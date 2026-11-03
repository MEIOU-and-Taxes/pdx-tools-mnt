import { memo, useState } from "react";
import type { ReactNode } from "react";
import { useElementVisible } from "./useElementVisible";
import { useHistory } from "../history/store";
import { numberAnimationDuration } from "./numberAnimation";
import { useRollingDigit } from "./useRollingDigit";

const separators = new Intl.NumberFormat().formatToParts(1234.5);
const decimal = separators.find((p) => p.type === "decimal")?.value ?? ".";
const group = separators.find((p) => p.type === "group")?.value ?? ",";

/** Retain the original formatting, animating changed digits with compositor transforms. */
export const AnimatedValue = memo(function AnimatedValue({ value }: { value: ReactNode }) {
  if (typeof value !== "string" && typeof value !== "number") return <>{value}</>;
  const text = String(value);
  const match = /^([^\d+\-−]*)([+\-−]?\d[\d.,\u00a0\u202f]*)([^\d]*)$/.exec(text);
  if (!match) return <>{value}</>;
  const [, prefix, number, suffix] = match;
  const numeric = Number(
    number
      .replaceAll(group, "")
      .replaceAll("\u00a0", "")
      .replaceAll("\u202f", "")
      .replace(decimal, ".")
      .replace("−", "-"),
  );
  if (!Number.isFinite(numeric)) return <>{value}</>;
  const actual = numeric * (suffix === "K" ? 1000 : suffix === "M" ? 1_000_000 : 1);
  return (
    <RollingNumber text={text} prefix={prefix} number={number} suffix={suffix} actual={actual} />
  );
});

function RollingNumber({
  text,
  prefix,
  number,
  suffix,
  actual,
}: {
  text: string;
  prefix: string;
  number: string;
  suffix: string;
  actual: number;
}) {
  const speed = useHistory((state) => state.playbackSpeed);
  const duration = numberAnimationDuration(speed);
  const { ref, visible } = useElementVisible();
  const [previous, setPrevious] = useState({ actual, trend: 0 });
  const trend = actual === previous.actual ? previous.trend : Math.sign(actual - previous.actual);
  if (actual !== previous.actual) setPrevious({ actual, trend });
  // Keys follow decimal places, so grouping and changes in magnitude do not shift digit identity.
  const [integer, fraction] = number.split(decimal);
  let place = [...integer].filter((char) => /\d/.test(char)).length;
  const characters = [...integer].map((char) => ({
    key: /\d/.test(char) ? `integer-${--place}` : `separator-${place}-${char}`,
    char,
  }));
  if (fraction !== undefined) {
    characters.push({ key: "decimal", char: decimal });
    [...fraction].forEach((char, index) => characters.push({ key: `fraction-${index}`, char }));
  }
  return (
    <span ref={ref} role="img" aria-label={text} className="whitespace-nowrap tabular-nums">
      {visible ? (
        <span aria-hidden="true">
          {prefix}
          {characters.map(({ key, char }) => (
            <RollingCharacter
              key={key}
              char={char}
              trend={actual < 0 ? -trend : trend}
              duration={duration}
            />
          ))}
          {suffix}
        </span>
      ) : (
        <span aria-hidden="true">{text}</span>
      )}
    </span>
  );
}

function RollingCharacter({
  char,
  trend,
  duration,
}: {
  char: string;
  trend: number;
  duration: number;
}) {
  const { incoming, outgoing } = useRollingDigit(char, trend, duration);
  return (
    <span className="relative inline-block overflow-clip align-bottom">
      <span className="invisible select-none">{char}</span>
      <span ref={incoming} className="absolute inset-0">
        {char}
      </span>
      <span ref={outgoing} className="absolute inset-0 opacity-0 select-none" />
    </span>
  );
}
