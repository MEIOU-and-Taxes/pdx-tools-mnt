import type { CountryDebt, DebtLoan } from "@/wasm/wasm_eu5";
export type { CountryDebt, DebtLoan };
export const annualPercent = (rate: number | null | undefined) =>
  rate != null && Number.isFinite(rate) ? rate * 100 : null;
export const debtRatio = (debt: number, wealth: number | null | undefined) =>
  wealth != null && Number.isFinite(wealth) && wealth > 0 ? (debt / wealth) * 100 : null;
export const bandFor = (rate: number) => Math.floor(rate * 100 + 1e-9);
export function debtSummary(countries: CountryDebt[] | null | undefined) {
  if (countries == null) return null;
  const debt = countries.reduce((n, c) => n + c.debt, 0);
  const rated = countries.reduce((n, c) => n + c.ratedPrincipal, 0);
  const weighted = countries.reduce((n, c) => n + c.interestWeightedPrincipal, 0);
  const knownWealth = countries.filter((c) => c.wealth != null && Number.isFinite(c.wealth));
  const wealth = knownWealth.length ? knownWealth.reduce((n, c) => n + c.wealth!, 0) : null;
  return {
    debt,
    wealth,
    rate:
      debt > 0 && Math.abs(rated - debt) < 1e-7 * Math.max(1, debt)
        ? annualPercent(weighted / debt)
        : null,
    ratio: debtRatio(debt, wealth),
    loans: countries.flatMap((c) => c.loans),
  };
}
/** Inverse weighted empirical CDF: each gold of outstanding principal has equal weight. */
export function weightedBox(loans: DebtLoan[]): [number, number, number, number, number] | null {
  const sorted = loans
    .filter(
      (l) =>
        l.principal > 0 &&
        Number.isFinite(l.principal) &&
        l.annualRate != null &&
        Number.isFinite(l.annualRate),
    )
    .toSorted((a, b) => a.annualRate! - b.annualRate!);
  if (!sorted.length) return null;
  const total = sorted.reduce((n, l) => n + l.principal, 0);
  const quantile = (p: number) => {
    let cumulative = 0;
    for (const l of sorted) {
      cumulative += l.principal;
      if (cumulative >= p * total) return l.annualRate! * 100;
    }
    return sorted.at(-1)!.annualRate! * 100;
  };
  return [quantile(0), quantile(0.25), quantile(0.5), quantile(0.75), quantile(1)];
}
export function debtBands(observations: (CountryDebt[] | null | undefined)[]) {
  let low = Infinity,
    high = -Infinity;
  for (const countries of observations)
    for (const country of countries ?? [])
      for (const loan of country.loans) {
        if (loan.principal > 0 && loan.annualRate != null && Number.isFinite(loan.annualRate)) {
          const band = bandFor(loan.annualRate);
          low = Math.min(low, band);
          high = Math.max(high, band);
        }
      }
  if (!Number.isFinite(low)) return [];
  return Array.from({ length: high - low + 1 }, (_, i) => low + i);
}
export function histogram(countries: CountryDebt[], bands: number[]) {
  const sums = new Map<number, number>();
  for (const c of countries)
    for (const l of c.loans) {
      if (l.principal > 0 && l.annualRate != null && Number.isFinite(l.annualRate)) {
        const band = bandFor(l.annualRate);
        sums.set(band, (sums.get(band) ?? 0) + l.principal);
      }
    }
  return bands.map((band) => sums.get(band) ?? 0);
}
export function borrowersInBand(countries: CountryDebt[], band: number | null) {
  return band == null
    ? countries
    : countries.filter((c) =>
        c.loans.some(
          (l) => l.principal > 0 && l.annualRate != null && bandFor(l.annualRate) === band,
        ),
      );
}

/** A country absent from a date is missing data, rather than a debt-free country. */
export function debtScope(countries: CountryDebt[] | null | undefined, scope: string) {
  if (countries == null) return undefined;
  if (scope === "world") return countries;
  const country = countries.find((c) => `id:${c.countryId}` === scope);
  return country ? [country] : undefined;
}
