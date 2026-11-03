import { useLayoutEffect, useRef } from "react";
import { digitSequence } from "./numberAnimation";

const easing = "cubic-bezier(.22,.61,.36,1)";

/** One compositor animation per changed digit; interrupted transitions release their strip. */
export function useRollingDigit(char: string, trend: number, duration: number) {
  const incoming = useRef<HTMLSpanElement>(null);
  const outgoing = useRef<HTMLSpanElement>(null);
  const previous = useRef(char);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = char;
    const next = incoming.current;
    const strip = outgoing.current;
    if (
      !next ||
      !strip ||
      old === char ||
      duration <= 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    if (!/^\d$/.test(old) || !/^\d$/.test(char)) {
      const animation = next.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: Math.min(150, duration),
        easing: "ease-out",
      });
      return () => animation.cancel();
    }

    const sequence = digitSequence(old, char, trend);
    const down = trend < 0;
    const digits = down ? sequence.toReversed() : sequence;
    strip.replaceChildren(
      ...digits.map((digit) => {
        const row = document.createElement("span");
        row.textContent = digit;
        row.style.cssText = "display:block;height:100%";
        return row;
      }),
    );
    strip.style.opacity = "1";
    next.style.opacity = "0";
    const travel = (digits.length - 1) * 100;
    const animation = strip.animate(
      [
        { transform: `translateY(${down ? -travel : 0}%)` },
        { transform: `translateY(${down ? 0 : -travel}%)` },
      ],
      { duration, easing, fill: "forwards" },
    );
    const restore = () => {
      next.style.removeProperty("opacity");
      strip.style.opacity = "0";
      animation.cancel();
      strip.replaceChildren();
    };
    animation.onfinish = restore;
    return restore;
  }, [char, trend, duration]);
  return { incoming, outgoing };
}
