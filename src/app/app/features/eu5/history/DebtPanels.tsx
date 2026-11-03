import { memo, useMemo, useRef, useState } from "react";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { importComparison } from "./compareCampaigns";
import { ImportProgress } from "./ImportProgress";
import {
  chartTooltip,
  getEChartsTheme,
  seriesColors,
  seriesFill,
} from "@/components/viz/echartsTheme";
import { Eu5Flag } from "../components/flags/Eu5Flag";
import { GameSelect } from "../components/Select";
import { useHistory } from "./store";
import { useAnalysisHistory } from "./useAnalysisHistory";
import {
  debtSummary,
  debtScope,
  weightedBox,
  debtBands,
  histogram,
  borrowersInBand,
  annualPercent,
} from "./debtStats";
import { DebtCountryDetails, debtNumber } from "./DebtCountryDetails";
import type { Snapshot } from "./types";
import type { AnalysisDescriptor } from "./analysisTypes";
import styles from "./Timeline.module.css";

type Scope = "world" | `id:${number}`;
export function DebtPanels({
  dates,
  campaignId,
  selectedHash,
  visible,
}: {
  dates: Snapshot[];
  campaignId: string;
  selectedHash?: string;
  visible: boolean;
}) {
  const metadata = useHistory((s) => s.snapshots) as AnalysisDescriptor[];
  const picker = useRef<HTMLInputElement>(null);
  const progress = useHistory((s) => s.progress);
  const cancel = useHistory((s) => s.cancel);
  const [notice, setNotice] = useState("");
  const addComparison = async (files: File[]) => {
    try {
      const result = await importComparison(files, campaignId);
      if (result.campaigns[0]) setCompare(result.campaigns[0]);
      setNotice(
        `${result.campaigns.length} comparison campaign(s) added; ${result.skipped} current-campaign or duplicate save(s) skipped; ${result.errors} import error(s).`,
      );
    } catch (error) {
      setNotice(String(error));
    }
  };
  const [scope, setScope] = useState<Scope>("world");
  const [compare, setCompare] = useState("none");
  const comparison = useAnalysisHistory(
    { campaignId: compare, country: "world" },
    visible && compare !== "none",
  );
  const names = useMemo(
    () =>
      Object.assign(
        {},
        ...metadata.filter((s) => s.campaignId === campaignId).map((s) => s.countryNames ?? {}),
      ) as Record<string, string>,
    [metadata, campaignId],
  );
  const otherNames = useMemo(
    () =>
      Object.assign(
        {},
        ...metadata.filter((s) => s.campaignId === compare).map((s) => s.countryNames ?? {}),
      ) as Record<string, string>,
    [metadata, compare],
  );
  const campaigns = [...new Set(metadata.map((s) => s.campaignId))].filter(
    (id) => id !== campaignId,
  );
  const [otherScope, setOtherScope] = useState<Scope>("world");
  const scoped = useMemo(
    () => dates.map((s) => ({ ...s, debt: debtScope(s.debt, scope) ?? undefined })),
    [dates, scope],
  );
  const otherDates = useMemo(
    () => comparison.dates.map((s) => ({ ...s, debt: debtScope(s.debt, otherScope) ?? undefined })),
    [comparison.dates, otherScope],
  );
  const summaries = useMemo(() => scoped.map((s) => debtSummary(s.debt)), [scoped]);
  const otherSummaries = useMemo(() => otherDates.map((s) => debtSummary(s.debt)), [otherDates]);
  const selected = selectedHash ? scoped.find((s) => s.hash === selectedHash) : scoped.at(-1);
  const selector = (
    value: Scope,
    update: (scope: Scope) => void,
    options: Record<string, string>,
    label: string,
  ) => (
    <label className={styles.field}>
      <span>{label}</span>
      <GameSelect value={value} onValueChange={(v) => update(v as Scope)}>
        <GameSelect.Trigger aria-label={label}>
          <GameSelect.Value className="min-w-0 truncate text-left" />
        </GameSelect.Trigger>
        <GameSelect.Content>
          <GameSelect.Item value="world">World · all countries</GameSelect.Item>
          {Object.entries(options)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, name]) => (
              <GameSelect.Item key={id} value={`id:${id}`}>
                {name}
              </GameSelect.Item>
            ))}
        </GameSelect.Content>
      </GameSelect>
    </label>
  );
  const metrics = [
    {
      label: "Weighted annual interest",
      unit: "% · weighted by outstanding principal",
      get: (s: ReturnType<typeof debtSummary>) => s?.rate ?? null,
    },
    {
      label: "Total outstanding debt",
      unit: "Gold",
      get: (s: ReturnType<typeof debtSummary>) => s?.debt ?? null,
    },
    {
      label: "Debt / Wealth",
      unit: "% · debt divided by potential tax base, not GDP",
      get: (s: ReturnType<typeof debtSummary>) => s?.ratio ?? null,
    },
    {
      label: "Total Wealth",
      unit: "Potential tax base",
      get: (s: ReturnType<typeof debtSummary>) => s?.wealth ?? null,
    },
  ];
  return (
    <section aria-label="Debt & Interest" className={styles.debtPanels}>
      <div className={styles.chart}>
        <div className={styles.chartHeading}>
          <h2>Debt &amp; Interest</h2>
          <button
            type="button"
            disabled={progress !== null}
            onClick={() => picker.current?.click()}
          >
            Compare
          </button>
        </div>
        <input
          ref={picker}
          type="file"
          multiple
          accept=".eu5"
          hidden
          aria-label="Select debt comparison saves"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void addComparison(files);
          }}
        />
        {progress && <ImportProgress progress={progress} onCancel={() => cancel?.()} />}
        {notice && (
          <p className={styles.help} role="status">
            {notice}
          </p>
        )}
        <p className={styles.help}>
          Existing-loan rates are annual contract rates, weighted by outstanding principal. A full
          new-loan quote is unavailable in the supported save data. Wealth is potential tax base,
          not GDP.
        </p>
        <div className={styles.filterGrid}>
          {selector(scope, setScope, names, "Country scope")}
          <label className={styles.field}>
            <span>Compare analyzed campaign</span>
            <GameSelect
              value={compare}
              onValueChange={(v) => {
                setCompare(v);
                setOtherScope("world");
              }}
            >
              <GameSelect.Trigger aria-label="Compare analyzed campaign">
                <GameSelect.Value className="min-w-0 truncate text-left" />
              </GameSelect.Trigger>
              <GameSelect.Content>
                <GameSelect.Item value="none">No comparison</GameSelect.Item>
                {campaigns.map((id) => (
                  <GameSelect.Item key={id} value={id}>
                    Campaign {id.slice(0, 8)}
                  </GameSelect.Item>
                ))}
              </GameSelect.Content>
            </GameSelect>
          </label>
          {compare !== "none" &&
            selector(otherScope, setOtherScope, otherNames, "Comparison country scope")}
        </div>
        <p className={styles.help}>
          Choose Compare to analyze saves from another campaign without changing the open map. Each
          campaign keeps its real dates, and its distributions remain separate.
        </p>
        {comparison.loading && <p role="status">Loading comparison…</p>}
        {comparison.error && <p role="alert">{comparison.error}</p>}
      </div>
      <DebtObservation dates={scoped} selected={selected} names={names} title="Current campaign" />
      {metrics.map((m) => (
        <div key={m.label} className={styles.chart}>
          <h2>{m.label}</h2>
          <p className={styles.help}>{m.unit}</p>
          <DebtHistoryChart
            dates={scoped}
            values={summaries.map(m.get)}
            otherDates={otherDates}
            otherValues={otherSummaries.map(m.get)}
            title={m.label}
          />
        </div>
      ))}
      <BoxHistory dates={scoped} title="Current campaign · Interest distribution over time" />
      {compare !== "none" && otherDates.length > 0 && (
        <>
          <BoxHistory
            dates={otherDates}
            title="Comparison campaign · Interest distribution over time"
          />
          <ComparisonObservation key={compare} dates={otherDates} names={otherNames} />
        </>
      )}
      <p className={styles.help}>
        Only saved observations are shown. Missing debt data stays unavailable; reanalyze older
        observations to add it. Lines connect observed dates without estimating intermediate debt.
      </p>
    </section>
  );
}
function ComparisonObservation({
  dates,
  names,
}: {
  dates: Snapshot[];
  names: Record<string, string>;
}) {
  const [hash, setHash] = useState(dates.at(-1)?.hash ?? "");
  const selected = dates.find((s) => s.hash === hash);
  return (
    <>
      <label className={styles.field}>
        <span>Comparison observation</span>
        <GameSelect value={hash} onValueChange={setHash}>
          <GameSelect.Trigger aria-label="Comparison observation">
            <GameSelect.Value className="min-w-0 truncate text-left" />
          </GameSelect.Trigger>
          <GameSelect.Content>
            {dates.map((s) => (
              <GameSelect.Item key={s.hash} value={s.hash}>
                {s.date}
              </GameSelect.Item>
            ))}
          </GameSelect.Content>
        </GameSelect>
      </label>
      <DebtObservation
        dates={dates}
        selected={selected}
        names={names}
        title="Comparison campaign"
      />
    </>
  );
}
function chartBase(): EChartsOption {
  const t = getEChartsTheme();
  return {
    animation: false,
    useUTC: true,
    color: [...seriesColors],
    textStyle: { color: t.labelColor, fontFamily: t.numFamily },
    tooltip: { ...chartTooltip, trigger: "axis", confine: true },
    grid: { left: 80, right: 25, top: 40, bottom: 75 },
    xAxis: { type: "time", axisLabel: { color: t.tickColor, formatter: "{yyyy}-{MM}" } },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { color: t.tickColor },
      splitLine: { lineStyle: { color: t.gridLineColor } },
    },
    dataZoom: [{ type: "inside" }, { type: "slider", bottom: 10, height: 20 }],
  };
}
function exportDebt(
  dates: Snapshot[],
  otherDates: Snapshot[],
  title: string,
  values: (number | null)[],
  otherValues: (number | null)[],
) {
  const rows: (string | number)[][] = [["campaign", "date", "metric", "value", "save_hash"]];
  for (const [observations, series] of [
    [dates, values],
    [otherDates, otherValues],
  ] as const)
    observations.forEach((s, i) =>
      rows.push([s.campaignId, s.date, title, series[i] ?? "", s.hash]),
    );
  const csv = rows
    .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "eu5-debt-history.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function DebtHistoryChart({
  dates,
  values,
  otherDates,
  otherValues,
  title,
}: {
  dates: Snapshot[];
  values: (number | null)[];
  otherDates: Snapshot[];
  otherValues: (number | null)[];
  title: string;
}) {
  const option: EChartsOption = {
    ...chartBase(),
    legend: { top: 5, textStyle: { color: getEChartsTheme().labelColor } },
    series: [
      { name: "Current campaign", dates, values },
      ...(otherDates.length
        ? [{ name: "Comparison campaign", dates: otherDates, values: otherValues }]
        : []),
    ].map((s, i) => ({
      name: s.name,
      type: "line",
      lineStyle: { type: i ? "dashed" : "solid" },
      showSymbol: true,
      connectNulls: false,
      data: s.dates.map((d, j) => [d.date, s.values[j]]),
    })),
  };
  return (
    <>
      <button
        type="button"
        onClick={() => exportDebt(dates, otherDates, title, values, otherValues)}
      >
        Export CSV
      </button>
      <EChart option={option} style={{ height: 280 }} />
    </>
  );
}
const BoxHistory = memo(function BoxHistory({
  dates,
  title,
}: {
  dates: Snapshot[];
  title: string;
}) {
  const option: EChartsOption = {
    ...chartBase(),
    tooltip: { ...chartTooltip, trigger: "item", confine: true },
    xAxis: {
      type: "category",
      data: dates.map((s) => s.date),
      axisLabel: { color: getEChartsTheme().tickColor, rotate: 35 },
    },
    yAxis: {
      type: "value",
      name: "Annual interest (%)",
      axisLabel: { color: getEChartsTheme().tickColor },
    },
    series: [
      {
        name: "Annual interest (%)",
        type: "boxplot",
        itemStyle: { color: seriesFill(0, 0.22), borderColor: seriesColors[0] },
        data: dates.map((s) => {
          const summary = debtSummary(s.debt);
          return (summary ? weightedBox(summary.loans) : null) ?? [NaN, NaN, NaN, NaN, NaN];
        }),
      },
    ],
  };
  return (
    <div className={styles.chart}>
      <h2>{title}</h2>
      <p className={styles.help}>
        Principal-weighted quartiles and median. Whiskers show the minimum and maximum saved loan
        rates. Empty dates have no box.
      </p>
      <EChart option={option} style={{ height: 300 }} />
    </div>
  );
});
function DebtObservation({
  dates,
  selected,
  names,
  title,
}: {
  dates: Snapshot[];
  selected?: Snapshot;
  names: Record<string, string>;
  title: string;
}) {
  const [band, setBand] = useState<number | null>(null);
  const [sort, setSort] = useState<"debt" | "rate" | "ratio">("debt");
  const [descending, setDescending] = useState(true);
  const [countryId, setCountryId] = useState<number | null>(null);
  const bands = useMemo(() => debtBands(dates.map((s) => s.debt)), [dates]);
  const countries = selected?.debt;
  const summary = debtSummary(countries);
  const rows = borrowersInBand(countries ?? [], band).toSorted((a, b) => {
    const va = debtSummary([a]),
      vb = debtSummary([b]);
    const av = va?.[sort],
      bv = vb?.[sort];
    if (av == null) return bv == null ? a.countryId - b.countryId : 1;
    if (bv == null) return -1;
    return (descending ? -1 : 1) * (av - bv) || a.countryId - b.countryId;
  });
  const bins = histogram(countries ?? [], bands);
  const option: EChartsOption = {
    ...chartBase(),
    xAxis: {
      type: "value",
      name: "Annual interest (%)",
      min: bands[0],
      max: bands.length ? bands.at(-1)! + 1 : undefined,
      minInterval: 1,
      axisLabel: {
        color: getEChartsTheme().tickColor,
        rotate: 35,
        formatter: (v: number) => `${v}%`,
      },
    },
    yAxis: {
      type: "value",
      name: "Outstanding debt (gold)",
      axisLabel: { color: getEChartsTheme().tickColor },
    },
    series: [
      {
        name: "Outstanding debt (gold)",
        type: "bar",
        barWidth: "85%",
        markLine:
          summary?.rate == null
            ? undefined
            : {
                silent: true,
                symbol: "none",
                lineStyle: { color: seriesColors[1], type: "dashed", width: 2 },
                label: {
                  formatter: `Mean ${debtNumber(summary.rate, "%")}`,
                  position: "insideEndTop",
                  color: getEChartsTheme().labelColor,
                },
                data: [{ name: "Debt-weighted mean", xAxis: summary.rate }],
              },
        data: bins.map((value, i) => ({
          value: [bands[i] + 0.5, value],
          name: `${bands[i]}–${bands[i] + 1}%`,
          band: bands[i],
          itemStyle: { color: band === bands[i] ? seriesColors[1] : seriesColors[0] },
        })),
      },
    ],
  };
  const details = countries?.find((c) => c.countryId === countryId);
  const sortButton = (key: typeof sort, label: string) => (
    <th aria-sort={sort === key ? (descending ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => {
          setSort(key);
          setDescending(sort === key ? !descending : true);
        }}
      >
        {label}
        {sort === key ? (descending ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
  return (
    <div className={styles.chart}>
      <h2>
        {title} · {selected?.date ?? "No matching saved observation"}
      </h2>
      {!summary ? (
        <p className={styles.help}>
          Debt data is unavailable for this observation. Reanalyze the original save to add it.
        </p>
      ) : (
        <>
          <dl className={styles.debtStats}>
            <div>
              <dt>Total debt</dt>
              <dd>{debtNumber(summary.debt)} gold</dd>
            </div>
            <div>
              <dt>Weighted interest</dt>
              <dd>{debtNumber(summary.rate, "%")}</dd>
            </div>
            <div>
              <dt>Debt / Wealth</dt>
              <dd>{debtNumber(summary.ratio, "%")}</dd>
            </div>
            <div>
              <dt>Wealth</dt>
              <dd>{debtNumber(summary.wealth)}</dd>
            </div>
          </dl>
          <h3>Debt by interest-rate band</h3>
          <p className={styles.help}>
            The vertical line marks the debt-weighted mean. Click a bar to filter borrowers. Bands
            include their lower bound and exclude their upper bound, and stay fixed across saved
            dates.
          </p>
          <EChart
            key={`${bands[0]}:${bands.at(-1)}`}
            option={option}
            style={{ height: 300 }}
            onInit={(chart) =>
              chart.on("click", (event) => {
                const data = event.data as { band?: number } | undefined;
                if (typeof data?.band === "number") setBand(data.band);
              })
            }
          />
          {summary.debt > 0 && summary.rate == null && (
            <p className={styles.help}>
              Some loan rates are unavailable. The average is unavailable and those loans are
              excluded from rate distributions.
            </p>
          )}
          {band != null && (
            <button type="button" onClick={() => setBand(null)}>
              Clear {band}–{band + 1}% filter
            </button>
          )}
          <div className={styles.debtTable}>
            <table className={styles.marketTable}>
              <thead>
                <tr>
                  <th>Country</th>
                  {sortButton("debt", "Debt (gold)")}
                  {sortButton("rate", "Existing rate")}
                  {sortButton("ratio", "Debt / Wealth")}
                  <th>New-loan rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = debtSummary([c])!;
                  return (
                    <tr key={c.countryId}>
                      <td>
                        <button
                          type="button"
                          className={styles.goodHeading}
                          onClick={() => setCountryId(c.countryId)}
                        >
                          <Eu5Flag flag={c.flag} size="sm" />
                          {names[String(c.countryId)] ?? c.tag}
                        </button>
                      </td>
                      <td>{debtNumber(c.debt)}</td>
                      <td>{debtNumber(s.rate, "%")}</td>
                      <td>{debtNumber(s.ratio, "%")}</td>
                      <td>{debtNumber(annualPercent(c.newLoanRate), "%")}</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={5}>No borrowers in this band at this saved date.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {details && (
            <>
              <button type="button" onClick={() => setCountryId(null)}>
                Close country details
              </button>
              <DebtCountryDetails
                country={details}
                name={names[String(details.countryId)]}
                names={names}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
