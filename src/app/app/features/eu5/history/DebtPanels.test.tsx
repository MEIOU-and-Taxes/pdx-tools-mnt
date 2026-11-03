import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EChartsOption } from "@/components/viz";
import type { Snapshot } from "./types";
const mocks = vi.hoisted(() => ({ options: [] as EChartsOption[] }));
vi.mock("@/components/viz", () => ({
  EChart: ({ option }: { option: EChartsOption }) => {
    mocks.options.push(option);
    return <div data-chart />;
  },
}));
vi.mock("./useAnalysisHistory", () => ({
  useAnalysisHistory: () => ({ dates: [], loading: false, error: null }),
}));
vi.mock("./store", () => ({
  useHistory: (select: (s: unknown) => unknown) =>
    select({ snapshots: [], progress: null, cancel: null }),
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
  const histogram = mocks.options.find(
    (o) => Array.isArray(o.series) && o.series[0].type === "bar",
  )!;
  expect(histogram).toMatchObject({
    xAxis: { type: "value" },
    series: [{ markLine: { data: [{ xAxis: 5 }] } }],
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
