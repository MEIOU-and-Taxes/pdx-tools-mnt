import { expect, it } from "vitest";
import {
  annualPercent,
  bandFor,
  debtRatio,
  debtSummary,
  debtScope,
  weightedBox,
  debtBands,
  histogram,
  borrowersInBand,
  type CountryDebt,
} from "./debtStats";
function country(
  id: number,
  loans: [number, number | null][],
  wealth: number | null = 100,
): CountryDebt {
  return {
    countryId: id,
    tag: `C${id}`,
    flag: undefined,
    wealth: wealth ?? undefined,
    debt: loans.reduce((s, l) => s + l[0], 0),
    interestWeightedPrincipal: loans.reduce((s, l) => s + l[0] * (l[1] ?? 0), 0),
    ratedPrincipal: loans.reduce((s, l) => s + (l[1] == null ? 0 : l[0]), 0),
    newLoanRate: undefined,
    loans: loans.map(([principal, rate]) => ({
      principal,
      annualRate: rate ?? undefined,
      lenderId: 0,
      lenderTag: undefined,
    })),
  };
}
it("weights interest by principal and computes the world ratio from totals, not averages", () => {
  const a = country(
      1,
      [
        [90, 0.01],
        [10, 0.1],
      ],
      100,
    ),
    b = country(2, [[100, 0.05]], 900);
  expect(debtSummary([a, b])?.rate).toBeCloseTo(3.45);
  expect(debtSummary([a, b])?.debt).toBe(200);
  expect(debtSummary([a, b])?.ratio).toBe(20);
  expect(debtSummary([a, b])?.wealth).toBe(1000);
  expect(annualPercent(0.08619)).toBeCloseTo(8.619);
});
it("does not treat a debt-free country as having a zero interest rate", () => {
  expect(debtSummary([country(1, [])])?.rate).toBeNull();
  expect(debtSummary([country(1, [])])?.debt).toBe(0);
  expect(debtSummary([country(1, [])])?.ratio).toBe(0);
  expect(debtSummary(undefined)).toBeNull();
  expect(debtRatio(10, 0)).toBeNull();
  expect(debtRatio(10, undefined)).toBeNull();
});
it("preserves real zero-rate contracts and suppresses an incomplete average", () => {
  expect(debtSummary([country(1, [[10, 0]])])?.rate).toBe(0);
  expect(
    debtSummary([
      country(1, [
        [10, 0.1],
        [20, null],
      ]),
    ])?.rate,
  ).toBeNull();
  expect(
    weightedBox(
      country(1, [
        [10, 0.1],
        [20, null],
      ]).loans,
    ),
  ).toEqual([10, 10, 10, 10, 10]);
});
it("computes weighted quartiles rather than unweighted loan or country quantiles", () => {
  expect(
    weightedBox(
      country(1, [
        [90, 0.01],
        [5, 0.05],
        [5, 0.1],
      ]).loans,
    ),
  ).toEqual([1, 1, 1, 1, 10]);
  expect(
    weightedBox(
      country(1, [
        [25, 0.01],
        [25, 0.02],
        [25, 0.03],
        [25, 0.04],
      ]).loans,
    ),
  ).toEqual([1, 1, 2, 3, 4]);
  expect(weightedBox([])).toBeNull();
});
it("keeps one-percentage-point histogram boundaries fixed and assigns boundary loans once", () => {
  const a = country(1, [
      [10, 0.01],
      [20, 0.01999],
      [30, 0.02],
    ]),
    b = country(2, [[5, 0.05]]);
  const bands = debtBands([[a], [b], undefined]);
  expect(bands).toEqual([1, 2, 3, 4, 5]);
  expect(histogram([a], bands)).toEqual([30, 30, 0, 0, 0]);
  expect(histogram([a, b], bands).reduce((s, v) => s + v, 0)).toBe(65);
  expect(bandFor(0.29)).toBe(29);
  expect(borrowersInBand([a, b], 2).map((c) => c.countryId)).toEqual([1]);
  expect(borrowersInBand([a, b], null)).toHaveLength(2);
  expect(borrowersInBand([a, b], 3)).toEqual([]);
});
it("handles missing observations and a country disappearing between dates", () => {
  const a = country(1, [[10, 0.01]]),
    b = country(2, [[20, 0.04]]);
  expect(debtSummary([a, b])?.debt).toBe(30);
  expect(debtSummary([b])?.debt).toBe(20);
  expect(debtSummary(null)).toBeNull();
  expect(debtBands([undefined, []])).toEqual([]);
});
it("finds bounds across large campaigns without spreading all loans into function arguments", () => {
  const c = country(1, [
    [1, 0.01],
    [1, 0.3],
  ]);
  expect(debtBands(Array.from({ length: 100000 }, () => [c]))).toHaveLength(30);
});

it("distinguishes a missing country from a present debt-free country", () => {
  const present = country(1, []);
  expect(debtScope([present], "id:1")).toEqual([present]);
  expect(debtScope([present], "id:2")).toBeUndefined();
  expect(debtScope(undefined, "world")).toBeUndefined();
  expect(debtSummary(debtScope([present], "id:2"))).toBeNull();
});
