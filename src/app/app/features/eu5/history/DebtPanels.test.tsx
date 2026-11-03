import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EChartsOption } from "@/components/viz";
import type { Snapshot } from "./types";
const mocks = vi.hoisted(() => ({
  options: [] as EChartsOption[],
  deferred: [] as boolean[],
  speed: 1,
}));
vi.mock("@/components/viz", () => ({
  EChart: ({ option, mergeUpdates }: { option: EChartsOption; mergeUpdates?: boolean }) => {
    mocks.deferred.push(mergeUpdates === true);
    mocks.options.push(option);
    return <div data-chart />;
  },
}));
vi.mock("./useAnalysisHistory", () => ({
  useAnalysisHistory: () => ({ dates: [], loading: false, error: null }),
}));
vi.mock("./store", () => ({
  useHistory: (select: (s: unknown) => unknown) =>
    select({ snapshots: [], progress: null, cancel: null, playbackSpeed: mocks.speed }),
}));
import { DebtPanels } from "./DebtPanels";
import { DebtCountryDetails } from "./DebtCountryDetails";
const country = {
  countryId: 7,
  tag: "ENG",
  flag: "ENG",
  wealth: 100,
  debt: 100,
  ratedPrincipal: 100,
  interestWeightedPrincipal: 5,
  newLoanRate: undefined,
  loans: [{ principal: 100, annualRate: 0.05, lenderId: 0, lenderTag: undefined }],
};
const observation = (hash: string, date: string, debt: Snapshot["debt"]): Snapshot => ({
  hash,
  date,
  dateSort: Number(date.replaceAll("-", "")),
  campaignId: "campaign",
  version: "1.4.0",
  fileName: "save.eu5",
  population: 0,
  development: 0,
  countries: [],
  markets: [],
  marketLabels: {},
  debt,
});
beforeEach(() => {
  mocks.options = [];
  mocks.deferred = [];
  mocks.speed = 1;
});
it("labels the saved date and puts the debt-weighted mean at the exact numeric annual rate", () => {
  const html = renderToStaticMarkup(
    <DebtPanels
      dates={[observation("one", "1500-01-01", [country])]}
      campaignId="campaign"
      selectedHash="one"
      visible
    />,
  );
  expect(html).toContain("Current campaign · 1500-01-01");
  expect(html).toContain("not GDP");
  expect(mocks.deferred.every(Boolean)).toBe(true);
  const histogram = mocks.options.find(
    (o) => Array.isArray(o.series) && o.series[0].type === "bar",
  )!;
  expect(histogram).toMatchObject({
    xAxis: { type: "value" },
    series: [{ markLine: { data: [{ xAxis: 5 }], label: { formatter: "Mean 5%" } } }],
  });
  expect(histogram).toMatchObject({ series: [{ data: [{ value: [5.5, 100], band: 5 }] }] });
});
it("shows missing historical debt as unavailable and never substitutes a different date", () => {
  const html = renderToStaticMarkup(
    <DebtPanels
      dates={[
        observation("old", "1500-01-01", undefined),
        observation("new", "1600-01-01", [country]),
      ]}
      campaignId="campaign"
      selectedHash="old"
      visible
    />,
  );
  expect(html).toContain("Current campaign · 1500-01-01");
  expect(html).toContain("Debt data is unavailable for this observation");
  expect(mocks.options.some((o) => Array.isArray(o.series) && o.series[0].type === "bar")).toBe(
    false,
  );
});
it("distinguishes the contract rate from an unavailable new-loan quote in country details", () => {
  const html = renderToStaticMarkup(<DebtCountryDetails country={country} name="England" />);
  expect(html).toContain("England");
  expect(html).toContain("5%");
  expect(html).toContain("New-loan rate");
  expect(html).toContain("Unavailable");
  expect(html).toContain("Non-country lender");
});

it("fits histogram bounds to the selected observation instead of historical outliers", () => {
  const high = {
    ...country,
    interestWeightedPrincipal: 80,
    loans: [{ ...country.loans[0], annualRate: 0.8 }],
  };
  const dates = [
    observation("old", "1500-01-01", [high]),
    observation("new", "1600-01-01", [country]),
  ];
  renderToStaticMarkup(
    <DebtPanels dates={dates} campaignId="campaign" selectedHash="new" visible />,
  );
  const narrow = mocks.options.find((o) => Array.isArray(o.series) && o.series[0].type === "bar")!;
  expect(narrow).toMatchObject({ xAxis: { min: 5, max: 6 } });
  mocks.options = [];
  renderToStaticMarkup(
    <DebtPanels dates={dates} campaignId="campaign" selectedHash="old" visible />,
  );
  const wide = mocks.options.find((o) => Array.isArray(o.series) && o.series[0].type === "bar")!;
  expect(wide).toMatchObject({ xAxis: { min: 80, max: 81 } });
});
it("uses the existing animated numeric readouts without animating unavailable rates", () => {
  const html = renderToStaticMarkup(<DebtCountryDetails country={country} name="England" />);
  expect(html).toContain('role="img" aria-label="5%"');
  expect(html).toContain("Unavailable");
});

it("retains the directional numeric readouts at high playback speeds", () => {
  mocks.speed = 8;
  const html = renderToStaticMarkup(
    <DebtPanels
      dates={[observation("one", "1500-01-01", [country])]}
      campaignId="campaign"
      selectedHash="one"
      visible
    />,
  );
  expect(html).toContain("5%");
  expect(html).toContain('aria-label="5%"');
});

it("shows only the weighted interquartile range and median, without min/max whiskers", () => {
  const distribution = {
    ...country,
    loans: [0.01, 0.04, 0.05, 0.06, 0.99].map((annualRate) => ({
      principal: 20,
      annualRate,
      lenderId: 0,
      lenderTag: undefined,
    })),
  };
  const html = renderToStaticMarkup(
    <DebtPanels
      dates={[observation("one", "1500-01-01", [distribution])]}
      campaignId="campaign"
      selectedHash="one"
      visible
    />,
  );
  const box = mocks.options.find((o) => Array.isArray(o.series) && o.series[0].type === "boxplot")!;
  expect(box).toMatchObject({ series: [{ data: [[4, 4, 5, 6, 6]] }] });
  const tooltip = box.tooltip as {
    formatter: (point: { name: string; value: number[] }) => string;
  };
  expect(tooltip.formatter({ name: "1500-01-01", value: [4, 4, 5, 6, 6] })).toBe(
    "1500-01-01<br/>25th percentile: 4%<br/>Median: 5%<br/>75th percentile: 6%",
  );
  expect(html).toContain("interquartile range");
  expect(html).not.toContain("Whiskers show");
});
