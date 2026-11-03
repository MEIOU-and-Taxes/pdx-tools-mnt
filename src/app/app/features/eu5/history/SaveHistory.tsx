import { DebtPanels } from "./DebtPanels";
import { aggregateMarkets } from "./marketAggregate";
import { campaignAnalysis } from "./analysisClient";
import { useCountryMarketCenters, useAnalysisHistory } from "./useAnalysisHistory";
import type { AnalysisDescriptor } from "./analysisTypes";
import { countryObservation, marketObservation } from "./observations";
import { exportHistoryCsv, historySeriesValues } from "./exportHistoryCsv";
import { ContextGraphs } from "./ContextGraphs";
import { useEffect, useMemo, useState } from "react";
import { useCampaign } from "@/features/campaign/CampaignProvider";
import { useEu5Trigger } from "../features/profiles/useEu5Trigger";
import { GameThemeProvider } from "@/components/GameThemeProvider";
import { HistoryPlot } from "./HistoryPlot";
import type { EChartsOption } from "@/components/viz";
import { chartTooltip, getEChartsTheme, seriesColors } from "@/components/viz/echartsTheme";
import type { MapMode } from "@/wasm/wasm_eu5";
import { useHistory } from "@/features/eu5/history/store";
import { useMapHistory } from "./context";
import styles from "@/features/eu5/history/Timeline.module.css";
import { useEu5PlaythroughId } from "../store";
import { useCurrentHistorySnapshot } from "./currentSnapshot";
import { GameSelect } from "../components/Select";
import { GoodSelect } from "../components/GoodSelect";
import { Eu5Icon } from "../components/icons/Eu5Icon";
import AdjustmentsHorizontalIcon from "@heroicons/react/24/outline/AdjustmentsHorizontalIcon";
import MagnifyingGlassIcon from "@heroicons/react/24/outline/MagnifyingGlassIcon";

type Metric =
  | "balance"
  | "price"
  | "supply"
  | "demand"
  | "stockpile"
  | "population"
  | "development";
type HistoryPreferences = {
  metricState: { mode: MapMode; value: Metric };
  good: string;
  markets: string[];
  country: string;
  indexed: boolean;
};
const preferences = new Map<string, HistoryPreferences>();
const metricNames: Record<Metric, string> = {
  balance: "Supply and demand",
  price: "Price",
  supply: "Supply",
  demand: "Demand",
  stockpile: "Stockpile",
  population: "Population",
  development: "Development",
};

const human = (text: string) =>
  text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function download(name: string, data: string | Blob, type: string) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaveHistory({
  visible = true,
  mapMode = "markets",
  focusTag,
  focusName,
  focusMarketCenter,
}: {
  visible?: boolean;
  mapMode?: MapMode;
  focusTag?: string;
  focusName?: string;
  focusMarketCenter?: number;
}) {
  const history = useHistory();
  const mapHistory = useMapHistory();
  const campaign = useCampaign();
  const playthroughId = useEu5PlaythroughId();
  const { data: version } = useEu5Trigger((engine) => engine.queries.getSaveVersion(), []);
  const currentSnapshot = useCurrentHistorySnapshot(version);
  const defaultMetric = mapMode === "population" || mapMode === "development" ? mapMode : "balance";
  const [metricState, setMetricState] = useState<{ mode: MapMode; value: Metric }>({
    ...(preferences.get(playthroughId ?? "")?.metricState ?? {
      mode: mapMode,
      value: defaultMetric,
    }),
  });
  const metric = metricState.mode === mapMode ? metricState.value : defaultMetric;
  if (metricState.mode !== mapMode) setMetricState({ mode: mapMode, value: defaultMetric });
  const setMetric = (value: Metric) => setMetricState({ mode: mapMode, value });
  const [good, setGood] = useState(() => preferences.get(playthroughId ?? "")?.good ?? "");
  const [marketSearch, setMarketSearch] = useState("");
  const [markets, setMarkets] = useState<string[]>(
    () => preferences.get(playthroughId ?? "")?.markets ?? [],
  );
  const [country, setCountry] = useState(
    () => preferences.get(playthroughId ?? "")?.country ?? "world",
  );
  const [indexed, setIndexed] = useState(
    () => preferences.get(playthroughId ?? "")?.indexed ?? false,
  );
  useEffect(
    () => () => {
      preferences.set(playthroughId ?? "", { metricState, good, markets, country, indexed });
    },
    [playthroughId, metricState, good, markets, country, indexed],
  );
  const section = history.section ?? "map";
  const busy = history.progress !== null;
  const metadata = useMemo(
    () =>
      history.snapshots.filter((row) => row.campaignId === playthroughId) as AnalysisDescriptor[],
    [history.snapshots, playthroughId],
  );
  const isMarket = mapMode === "markets";
  const goods = useMemo(
    () => [...new Set(metadata.flatMap((row) => row.goods ?? []))].sort(),
    [metadata],
  );
  const countryNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const row of metadata)
      for (const [id, name] of Object.entries(row.countryNames ?? {})) names[`id:${id}`] = name;
    return names;
  }, [metadata]);
  const activeGood = goods.includes(good)
    ? good
    : (goods.find((g) => g === "wheat" || g === "grain") ?? goods[0]);
  const labels = useMemo(() => {
    const result: Record<string, string> = {};
    for (const row of metadata)
      for (const [center, name] of Object.entries(row.marketLabels)) result[center] = human(name);
    return result;
  }, [metadata]);
  const focusCenters = useCountryMarketCenters(playthroughId ?? "", focusTag, visible);
  const { marketIds, activeMarkets, selectedMarkets } = useMemo(() => {
    const marketIds = Object.keys(labels)
      .filter((id) =>
        focusMarketCenter != null
          ? id === String(focusMarketCenter)
          : focusCenters === null || focusCenters.includes(Number(id)),
      )
      .sort((a, b) => labels[a].localeCompare(labels[b]));
    const chosenMarkets = markets.filter((m) => marketIds.includes(m));
    const activeMarkets = chosenMarkets.length ? chosenMarkets : marketIds;
    return { marketIds, activeMarkets, selectedMarkets: chosenMarkets };
  }, [focusMarketCenter, focusCenters, labels, markets]);
  const countries = useMemo(
    () =>
      Object.keys(countryNames).sort((a, b) =>
        (countryNames[a] ?? a).localeCompare(countryNames[b] ?? b),
      ),
    [countryNames],
  );
  const countryOptions = useMemo(
    () =>
      countries.map((c) => (
        <GameSelect.Item key={c} value={c} textValue={countryNames[c] ?? c}>
          {countryNames[c] ?? c}
        </GameSelect.Item>
      )),
    [countries, countryNames],
  );
  const activeCountry = focusTag ?? (countries.includes(country) ? country : "world");
  const { dates, loading, error } = useAnalysisHistory(
    {
      campaignId: playthroughId ?? "",
      country: activeCountry,
      good: isMarket ? activeGood : undefined,
      centers: activeMarkets.map(Number),
    },
    visible,
  );
  const entities = useMemo(
    () => (isMarket ? activeMarkets : [activeCountry]),
    [isMarket, activeMarkets, activeCountry],
  );
  const series = useMemo(
    () =>
      isMarket && metric === "balance"
        ? (["supply", "demand"] as const).map((field) => ({
            name: field === "supply" ? "Supply" : "Demand",
            raw: dates.map((snapshot) => {
              return aggregateMarkets(snapshot.markets)[field];
            }),
          }))
        : isMarket && metric === "price"
          ? [
              {
                name: "Weighted market price",
                raw: dates.map((snapshot) => aggregateMarkets(snapshot.markets).price),
              },
            ]
          : entities.map((entity) => ({
              name: isMarket
                ? labels[entity]
                : entity === "world"
                  ? "World · owned locations"
                  : (countryNames[entity] ?? entity),
              raw: dates.map((s) => {
                if (isMarket)
                  return (
                    marketObservation(s, Number(entity), activeGood)?.[
                      metric as "price" | "supply" | "demand" | "stockpile"
                    ] ?? null
                  );
                if (entity === "world") return s[metric as "population" | "development"];
                return (
                  countryObservation(s, entity)?.[metric as "population" | "development"] ?? null
                );
              }),
            })),
    [dates, entities, isMarket, activeGood, metric, countryNames, labels],
  );
  const indexUnavailable =
    indexed &&
    series.some((s) => {
      const v = s.raw.find((x) => x != null && Number.isFinite(x));
      return v == null || v <= 0;
    });
  const theme = getEChartsTheme();
  const option = useMemo(
    (): EChartsOption => ({
      useUTC: true,
      animation: false,
      animationDuration: 250,
      animationDurationUpdate: 750,
      animationEasingUpdate: "cubicInOut",
      color: [...seriesColors],
      textStyle: { fontFamily: theme.numFamily, color: theme.labelColor },
      tooltip: { ...chartTooltip, trigger: "axis", confine: true },
      legend: {
        top: 8,
        type: "scroll",
        textStyle: { color: theme.labelColor },
        pageTextStyle: { color: theme.labelColor },
      },
      grid: { left: 78, right: 25, top: 55, bottom: 85 },
      xAxis: {
        type: "time",
        axisLabel: { formatter: "{yyyy}-{MM}", color: theme.tickColor, hideOverlap: true },
        axisLine: { lineStyle: { color: theme.axisColor } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: theme.tickColor },
        nameTextStyle: { color: theme.labelColor },
        name: indexed
          ? "First observation = 100"
          : metric === "population"
            ? "People"
            : metric === "price"
              ? "Saved price"
              : "Save units",
        splitLine: { lineStyle: { color: theme.gridLineColor } },
      },
      dataZoom: [
        { type: "inside" },
        {
          type: "slider",
          height: 22,
          bottom: 20,
          textStyle: { color: theme.tickColor },
          borderColor: theme.axisColor,
        },
      ],
      series: series.map((s, slot) => {
        const line = {
          id: `history/${metric}/${s.name}`,
          color: seriesColors[slot],
          name: s.name,
          type: "line" as const,
          smooth: false,
          connectNulls: false,
          symbolSize: 7,
          showSymbol: true,
          data: historySeriesValues(s.raw, indexed).map((value, i) => [
            Date.parse(`${dates[i].date}T00:00:00Z`),
            value,
          ]),
        };
        return line;
      }),
    }),
    [
      dates,
      series,
      indexed,
      metric,
      theme.labelColor,
      theme.tickColor,
      theme.numFamily,
      theme.axisColor,
      theme.gridLineColor,
    ],
  );

  const csv = () => {
    download(
      "eu5-observations.csv",
      exportHistoryCsv(dates, series, {
        metric,
        good: isMarket ? activeGood : "",
        indexed,
      }),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <GameThemeProvider theme="eu5">
      <main className={styles.page}>
        <header className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>CAMPAIGN HISTORY</span>
            <h1>
              {focusName ? `${focusName} · ` : ""}
              {section === "debt" ? "Debt & Interest" : `${human(mapMode)} over time`}
            </h1>
            <p>
              {campaign ? `${campaign.saves.length} campaign saves available for navigation. ` : ""}
              {mapHistory?.enabled
                ? "New saves are analyzed automatically unless analysis is paused."
                : "Choose Analyze campaign in the left sidebar to start analysis."}
            </p>
          </div>
        </header>
        {error ? (
          <p>{error}</p>
        ) : loading && !dates.length ? (
          <p>Loading campaign charts…</p>
        ) : !dates.length ? (
          <section className={styles.empty}>
            <h2>Start with two or more saves</h2>
            <p>
              Add saves using the left sidebar, then choose Analyze campaign. Navigation remains
              available while observations are extracted in background workers.
            </p>
            <p>
              Every section has its own history: development, control, wealth, taxation, population,
              births, buildings, religion, RGO capacity and markets.
            </p>
          </section>
        ) : section === "debt" ? (
          <DebtPanels
            dates={dates}
            campaignId={playthroughId ?? ""}
            selectedHash={currentSnapshot?.hash}
            visible={visible}
          />
        ) : (
          <div className={styles.layout}>
            <aside className={styles.panel} aria-label="History filters">
              <div className={styles.filterHeading}>
                <AdjustmentsHorizontalIcon aria-hidden="true" />
                <h2>History filters</h2>
                <span>{isMarket ? "Markets" : "Countries"}</span>
              </div>
              <div className={styles.filterGrid}>
                {isMarket && (
                  <label className={styles.field}>
                    <span>Metric</span>
                    <GameSelect
                      value={metric}
                      onValueChange={(value) => setMetric(value as Metric)}
                    >
                      <GameSelect.Trigger aria-label="Metric">
                        <GameSelect.Value />
                      </GameSelect.Trigger>
                      <GameSelect.Content>
                        {Object.entries(metricNames)
                          .filter(([value]) =>
                            ["balance", "price", "supply", "demand", "stockpile"].includes(value),
                          )
                          .map(([value, name]) => (
                            <GameSelect.Item key={value} value={value}>
                              {name}
                            </GameSelect.Item>
                          ))}
                      </GameSelect.Content>
                    </GameSelect>
                  </label>
                )}
                {isMarket ? (
                  <>
                    <label className={styles.field}>
                      <span>Good</span>
                      <GoodSelect
                        value={activeGood}
                        onValueChange={setGood}
                        goods={goods.map((key) => ({ key, name: human(key) }))}
                        label="Good"
                      />
                    </label>
                    <fieldset className={styles.marketPicker}>
                      <legend>Market scope</legend>
                      <div className={styles.scopeHeading}>
                        <span>
                          {selectedMarkets.length
                            ? `${selectedMarkets.length} selected`
                            : "All markets"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMarkets([])}
                          disabled={!selectedMarkets.length}
                        >
                          Reset
                        </button>
                      </div>
                      <div className={styles.searchField}>
                        <MagnifyingGlassIcon aria-hidden="true" />
                        <input
                          type="search"
                          aria-label="Find markets"
                          value={marketSearch}
                          onChange={(event) => setMarketSearch(event.target.value)}
                          placeholder="Search markets"
                        />
                      </div>
                      <div className={styles.marketList} role="group" aria-label="Markets">
                        {marketIds
                          .filter((id) =>
                            labels[id].toLowerCase().includes(marketSearch.trim().toLowerCase()),
                          )
                          .map((id) => (
                            <label key={id} className={styles.marketOption}>
                              <input
                                type="checkbox"
                                checked={selectedMarkets.includes(id)}
                                onChange={() =>
                                  setMarkets((previous) =>
                                    previous.includes(id)
                                      ? previous.filter((market) => market !== id)
                                      : [...previous, id],
                                  )
                                }
                              />
                              <span>{labels[id]}</span>
                            </label>
                          ))}
                        {!marketIds.some((id) =>
                          labels[id].toLowerCase().includes(marketSearch.trim().toLowerCase()),
                        ) && <p className={styles.noResults}>No markets match your search.</p>}
                      </div>
                      <p className={styles.scopeHint}>
                        {selectedMarkets.length
                          ? "Selected markets are combined in the chart."
                          : "Select markets to narrow the chart, or leave all included."}
                      </p>
                    </fieldset>
                  </>
                ) : !focusTag ? (
                  <label className={styles.countryField}>
                    <span>Country</span>
                    <GameSelect value={activeCountry} onValueChange={setCountry}>
                      <GameSelect.Trigger aria-label="Country">
                        <GameSelect.Value />
                      </GameSelect.Trigger>
                      <GameSelect.Content className="max-h-72 overflow-y-auto">
                        <GameSelect.Item value="world">World · owned locations</GameSelect.Item>
                        {countryOptions}
                      </GameSelect.Content>
                    </GameSelect>
                  </label>
                ) : (
                  <p className={styles.help}>Following selected nation: {focusName ?? focusTag}</p>
                )}
                {isMarket && (
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={indexed}
                      onChange={(event) => setIndexed(event.target.checked)}
                    />
                    <span>
                      Index first observation to 100
                      <span className={styles.checkboxHint}>
                        Compare relative change instead of absolute amounts.
                      </span>
                    </span>
                  </label>
                )}
              </div>
              <p className={styles.help}>
                {isMarket
                  ? "Supply and demand are summed across the included markets. Missing observations remain gaps."
                  : "Compare this section across saved dates for the selected country. Missing observations remain gaps."}
              </p>
            </aside>
            <section className={styles.main}>
              {isMarket && (
                <div className={styles.chart}>
                  <div className={styles.chartHeading}>
                    <div>
                      <span className={styles.eyebrow}>
                        {dates.length} SAVED DATES
                        {currentSnapshot && currentSnapshot.campaignId === playthroughId
                          ? ` · ${currentSnapshot.date}`
                          : ""}
                      </span>
                      <h2 className={styles.goodHeading}>
                        {activeGood && <Eu5Icon family="goods" id={activeGood} size="sm" alt="" />}
                        {isMarket ? `${human(activeGood ?? "Good")} · ` : ""}
                        {metricNames[metric]}
                      </h2>
                    </div>
                    <button onClick={csv}>Export CSV</button>
                  </div>
                  {indexUnavailable && (
                    <p className={styles.notice}>
                      Indexing requires a positive first observation. Series starting at zero or
                      without data are omitted.
                    </p>
                  )}
                  {visible ? (
                    <HistoryPlot
                      option={option}
                      date={
                        currentSnapshot && currentSnapshot.campaignId === playthroughId
                          ? currentSnapshot.date
                          : undefined
                      }
                      values={series.map(
                        (s) =>
                          historySeriesValues(s.raw, indexed)[
                            dates.findIndex((date) => date.hash === currentSnapshot?.hash)
                          ] ?? null,
                      )}
                      height={300}
                      top={55}
                      bottom={85}
                      left={78}
                      right={25}
                    />
                  ) : null}
                  <p className={styles.help}>
                    Points are actual saved observations. Lines connect them; missing market/good
                    records remain gaps. The moving markers follow the map date; animation between
                    points is visual only.
                  </p>
                </div>
              )}
              {isMarket && dates.length > 0 && (
                <div className={styles.chart}>
                  <h2>Markets · latest observation</h2>
                  <p className={styles.help}>
                    Price is weighted by quantity traded. Supply and demand are saved market values.
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.marketTable}>
                      <thead>
                        <tr>
                          <th>Market</th>
                          <th>Supply</th>
                          <th>Demand</th>
                          <th>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dates[dates.length - 1].markets.map((m) => (
                          <tr key={`${m.marketId}/${m.good}`}>
                            <td>{labels[String(m.center)] ?? m.centerName ?? m.center}</td>
                            <td>{m.supply?.toFixed(2) ?? "—"}</td>
                            <td>{m.demand?.toFixed(2) ?? "—"}</td>
                            <td>{m.price?.toFixed(2) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {visible && (
                <ContextGraphs
                  dates={dates}
                  mode={mapMode}
                  country={activeCountry}
                  countryName={focusName ?? countryNames[activeCountry]}
                  selectedHash={currentSnapshot?.hash}
                  good={activeGood}
                  centers={activeMarkets}
                />
              )}
            </section>
          </div>
        )}
        <footer className={styles.footer}>
          <span>{history.snapshots.length} observations in memory · Campaigns remain separate</span>
          <div>
            <button
              disabled={!dates.length}
              onClick={() =>
                void campaignAnalysis()
                  .exportObservations(playthroughId ?? "")
                  .then((blob) => download("eu5-snapshots.json", blob, "application/json"))
              }
            >
              Export observations JSON
            </button>
            <button
              disabled={
                busy ||
                !playthroughId ||
                !history.snapshots.length ||
                !mapHistory ||
                mapHistory.opening
              }
              onClick={() => {
                void mapHistory?.clearCampaign();
              }}
            >
              Clear campaign analysis
            </button>
          </div>
        </footer>
      </main>
    </GameThemeProvider>
  );
}
