import { useMemo, useState } from "react";
import { createColumnHelper } from "@/lib/tanstack-table";
import { EChart } from "@/components/viz";
import type { EChartsOption } from "@/components/viz";
import { Eu5DataTable, Eu5MapDataTable, SectionTitle } from "../../components";
import type {
  BuildingLevelsScopeSummary,
  BuildingTypeSummary,
  BuildingTypeForeignOwnerCell,
  BuildingLevelsTopLocation,
  ForeignBuildingLocationRow,
} from "@/wasm/wasm_eu5";
import { formatInt } from "@/lib/format";
import { formatExact, formatFixed } from "../../numberFormatting";
import { Figure } from "../../components/Figure";
import { escapeEChartsHtml } from "@/components/viz/EChart";
import { buildingOwnershipColors } from "../../gameColors";
import { chartTooltip, markGap } from "@/components/viz/echartsTheme";
import { InsightReadout, InsightReadoutSkeleton, ReadoutFigure } from "../InsightReadout";
import { useEu5SelectionTrigger } from "../profiles/useEu5Trigger";
import { LocationLink } from "../profiles/LocationLink";
import { CountryLink } from "../profiles/EntityLink";
import {
  Eu5InsightEmptyState,
  Eu5InsightErrorState,
  Eu5InsightLoadingState,
} from "../Eu5InsightState";

const BACK_LABEL = "Building Levels";

function BuildingLevelsScopeHeader({ data }: { data?: BuildingLevelsScopeSummary }) {
  if (!data) return <InsightReadoutSkeleton />;

  return (
    <InsightReadout
      figure={<Figure value={data.totalLevels} form="level" />}
      unit="building levels"
    >
      <ReadoutFigure
        value={<Figure value={data.medianLevels} form="level" />}
        label="median / location"
      />
      <ReadoutFigure
        value={<Figure value={data.foreignShare} form="percent" />}
        label="foreign-owned"
      />
    </InsightReadout>
  );
}

const categoryColors = [
  "#e5b85c",
  "#64b5cd",
  "#ce86bd",
  "#94bf70",
  "#df866a",
  "#9c9ed7",
  "#71baaa",
  "#cda57b",
];
function categoryColor(category: string) {
  let hash = 0;
  for (const c of category) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return categoryColors[hash % categoryColors.length];
}
function categoryLabel(category: string) {
  return category
    .replace(/_category$/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function BuildingTypesChart({ types }: { types: BuildingTypeSummary[] }) {
  const rows = useMemo(
    () =>
      types.slice(0, 30).map((t) => ({
        ...t,
        name: t.building.name,
        domestic: t.levels - t.foreignLevels,
      })),
    [types],
  );

  const option = useMemo((): EChartsOption => {
    return {
      dataset: {
        source: rows,
        dimensions: ["name", "domestic", "foreignLevels"],
      },
      grid: { left: 140, right: 24, top: 8, bottom: 64 },
      xAxis: {
        type: "value",
        name: "Building Levels",
        nameLocation: "middle",
        nameGap: 28,
      },
      yAxis: {
        type: "category",
        inverse: true,
        axisLabel: { width: 130 },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          name: "Domestic",
          stack: "levels",
          itemStyle: {
            color: (p: { dataIndex: number }) =>
              categoryColor(rows[p.dataIndex]?.category ?? "unknown"),
            ...markGap,
          },
          encode: { x: "domestic", y: "name" },
        },
        {
          type: "bar",
          name: "Foreign",
          stack: "levels",
          itemStyle: { color: buildingOwnershipColors.foreign, ...markGap },
          encode: { x: "foreignLevels", y: "name" },
        },
      ],
      tooltip: {
        ...chartTooltip,
        trigger: "axis",
        formatter: (params) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex?: number } | undefined)?.dataIndex;
          if (idx == null) return "";
          const d = rows[idx];
          if (!d) return "";
          return [
            `<strong>${escapeEChartsHtml(d.building.name)}</strong>`,
            `Domestic levels: ${formatExact(d.domestic)}`,
            `Foreign levels: ${formatExact(d.foreignLevels)}`,
            `Total levels: ${formatExact(d.levels)}`,
            `Employed: ${formatExact(d.employed)}`,
            `Buildings: ${formatInt(d.buildingCount)}`,
            `Locations: ${formatInt(d.locationCount)}`,
            `Foreign owners: ${formatInt(d.foreignOwnerCount)}`,
          ].join("<br/>");
        },
      },
      legend: {
        data: ["Domestic", "Foreign"],
        top: "bottom",
      },
    };
  }, [rows]);

  const height = Math.max(120, rows.length * 28 + 40);
  return (
    <EChart gpuBars mergeUpdates option={option} style={{ height: `${height}px`, width: "100%" }} />
  );
}

function ForeignShareCallout({ scope }: { scope: BuildingLevelsScopeSummary }) {
  const pct = scope.foreignShare * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-game-ink-300">
          Foreign-owned:{" "}
          <span className="font-semibold text-white">
            <Figure value={scope.foreignLevels} form="level" />
          </span>{" "}
          / <Figure value={scope.totalLevels} form="level" /> levels
        </span>
        <span className="font-semibold" style={{ color: buildingOwnershipColors.foreign }}>
          <Figure value={scope.foreignShare} form="percent" />
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-game-panel-hover">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: buildingOwnershipColors.foreign,
          }}
        />
      </div>
      {(scope.foreignLocationCount > 0 || scope.foreignOwnerCount > 0) && (
        <p className="text-xs text-game-ink-500">
          {scope.foreignLocationCount > 0 && (
            <>
              {formatInt(scope.foreignLocationCount)} location
              {scope.foreignLocationCount !== 1 ? "s" : ""}
            </>
          )}
          {scope.foreignLocationCount > 0 && scope.foreignOwnerCount > 0 && " · "}
          {scope.foreignOwnerCount > 0 && (
            <>
              {formatInt(scope.foreignOwnerCount)} owner{scope.foreignOwnerCount !== 1 ? "s" : ""}
            </>
          )}
        </p>
      )}
    </div>
  );
}

const topLocColHelper = createColumnHelper<BuildingLevelsTopLocation>();

function DomesticTopLocationsTable({ locations }: { locations: BuildingLevelsTopLocation[] }) {
  const columns = useMemo(
    () => [
      topLocColHelper.accessor("location", {
        id: "location",
        sortFn: (a, b) => a.original.location.name.localeCompare(b.original.location.name),
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const loc = row.original;
          return <LocationLink location={loc.location} backLabel={BACK_LABEL} />;
        },
      }),
      topLocColHelper.accessor("owner", {
        id: "owner",
        sortFn: (a, b) =>
          a.original.owner.country.name.localeCompare(b.original.owner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      topLocColHelper.accessor("levels", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Levels", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={locations}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.location.key })}
      initialSorting={[{ id: "levels", desc: true }]}
      pagination
    />
  );
}

const foreignLocColHelper = createColumnHelper<ForeignBuildingLocationRow>();

function ForeignBuildingLocationTable({ rows }: { rows: ForeignBuildingLocationRow[] }) {
  const columns = useMemo(
    () => [
      foreignLocColHelper.accessor("location", {
        id: "location",
        sortFn: (a, b) => a.original.location.name.localeCompare(b.original.location.name),
        meta: Eu5DataTable.meta({ headerLabel: "Location", variant: "pin" }),
        cell: ({ row }) => {
          const r = row.original;
          return <LocationLink location={r.location} backLabel={BACK_LABEL} />;
        },
      }),
      foreignLocColHelper.accessor("locationOwner", {
        id: "locationOwner",
        sortFn: (a, b) =>
          a.original.locationOwner.country.name.localeCompare(
            b.original.locationOwner.country.name,
          ),
        meta: Eu5DataTable.meta({ headerLabel: "Loc Owner" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.locationOwner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      foreignLocColHelper.accessor("foreignOwner", {
        id: "foreignOwner",
        sortFn: (a, b) =>
          a.original.foreignOwner.country.name.localeCompare(b.original.foreignOwner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Building Owner" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.foreignOwner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      foreignLocColHelper.accessor((row) => row.building.name, {
        id: "building",
        sortFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Type" }),
        cell: (info) => info.getValue(),
      }),
      foreignLocColHelper.accessor("foreignLevels", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Foreign Lvls", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={rows}
      getRowHoverTarget={(row) => ({ kind: "location", locationIdx: row.location.key })}
      initialSorting={[{ id: "foreignLevels", desc: true }]}
      pagination
    />
  );
}

const foreignOwnerCellColHelper = createColumnHelper<BuildingTypeForeignOwnerCell>();

function ForeignOwnerCellsTable({ cells }: { cells: BuildingTypeForeignOwnerCell[] }) {
  const columns = useMemo(
    () => [
      foreignOwnerCellColHelper.accessor("owner", {
        id: "owner",
        sortFn: (a, b) =>
          a.original.owner.country.name.localeCompare(b.original.owner.country.name),
        meta: Eu5DataTable.meta({ headerLabel: "Owner", variant: "pin" }),
        cell: ({ row }) => (
          <CountryLink country={row.original.owner} aligned backLabel={BACK_LABEL} />
        ),
      }),
      foreignOwnerCellColHelper.accessor((row) => row.building.name, {
        id: "building",
        sortFn: "text",
        meta: Eu5DataTable.meta({ headerLabel: "Type" }),
        cell: (info) => info.getValue(),
      }),
      foreignOwnerCellColHelper.accessor("levels", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Levels", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
      foreignOwnerCellColHelper.accessor("buildingCount", {
        sortFn: "basic",
        meta: Eu5DataTable.meta({ headerLabel: "Buildings", variant: "num" }),
        cell: (info) => (
          <Eu5DataTable.NumericCell>{formatFixed(info.getValue(), 0)}</Eu5DataTable.NumericCell>
        ),
      }),
    ],
    [],
  );

  return (
    <Eu5MapDataTable
      className="w-full"
      columns={columns}
      data={cells}
      getRowHoverTarget={(row) => ({
        kind: "country",
        countryIdx: row.owner.country.key,
      })}
      initialSorting={[{ id: "levels", desc: true }]}
      pagination
    />
  );
}

export function BuildingLevelsInsight() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const insightQuery = useEu5SelectionTrigger((engine) =>
    engine.queries.getBuildingLevelsInsight(),
  );

  const types = insightQuery.data?.types ?? [];
  const categories = [...new Set(types.map((type) => type.category ?? "unknown"))].sort();
  const filteredTypes = types.filter(
    (type) =>
      (category === "all" || (type.category ?? "unknown") === category) &&
      type.building.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const foreignOwnerCells = insightQuery.data?.foreignOwnerCells ?? [];
  const foreignLocationRows = insightQuery.data?.foreignLocationRows ?? [];
  const topLocations = insightQuery.data?.topLocations ?? [];
  const scope = insightQuery.data?.scope;
  const totalLevels = scope?.totalLevels ?? 0;
  const foreignLevels = scope?.foreignLevels ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <BuildingLevelsScopeHeader data={scope} />
      {insightQuery.error ? (
        <Eu5InsightErrorState error={insightQuery.error} />
      ) : insightQuery.loading && !insightQuery.data ? (
        <Eu5InsightLoadingState />
      ) : (
        <>
          {types.length > 0 && (
            <section>
              <SectionTitle>Building levels by type</SectionTitle>
              <label className="my-2 block text-xs text-game-ink-300">
                Find a building
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search building types"
                  className="mt-1 w-full rounded border border-game-line bg-game-panel px-3 py-2 text-sm text-white"
                />
              </label>
              <div className="flex flex-wrap gap-2 py-2" aria-label="Building category filters">
                {["all", ...categories].map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setCategory(name)}
                    aria-pressed={category === name}
                    className="rounded border px-2 py-1 text-xs text-white"
                    style={{
                      borderColor: name === "all" ? undefined : categoryColor(name),
                      opacity: category === "all" || category === name ? 1 : 0.65,
                      backgroundColor:
                        category === name ? "var(--game-panel-active)" : "transparent",
                    }}
                  >
                    {name === "all" ? "All categories" : categoryLabel(name)}{" "}
                    <span className="text-game-ink-500">
                      {name === "all"
                        ? types.length
                        : types.filter((type) => (type.category ?? "unknown") === name).length}
                    </span>
                  </button>
                ))}
              </div>
              {filteredTypes.length ? (
                <>
                  <p className="mb-1 text-xs text-game-ink-500">
                    Showing up to 30 of {filteredTypes.length} building types · colors indicate
                    category
                  </p>
                  <BuildingTypesChart types={filteredTypes} />
                </>
              ) : (
                <p className="py-4 text-sm text-game-ink-500">No buildings match these filters.</p>
              )}
            </section>
          )}

          {totalLevels > 0 && foreignLevels > 0 && scope && (
            <section>
              <SectionTitle>Foreign ownership</SectionTitle>
              <ForeignShareCallout scope={scope} />
            </section>
          )}

          {topLocations.length > 0 && (
            <section>
              <SectionTitle>Top building locations</SectionTitle>
              <DomesticTopLocationsTable locations={topLocations} />
            </section>
          )}

          {foreignLocationRows.length > 0 && (
            <section>
              <SectionTitle>Foreign-owned buildings by location</SectionTitle>
              <ForeignBuildingLocationTable rows={foreignLocationRows} />
            </section>
          )}

          {foreignOwnerCells.length > 0 && (
            <section>
              <SectionTitle>Foreign-owned buildings by type and owner</SectionTitle>
              <ForeignOwnerCellsTable cells={foreignOwnerCells} />
            </section>
          )}

          {types.length === 0 && (
            <Eu5InsightEmptyState title="No building data in the selected scope." />
          )}
        </>
      )}
    </div>
  );
}
