import { AnimatedValue } from "../components/AnimatedValue";
import type { CountryDebt } from "./debtStats";
import { annualPercent, debtSummary } from "./debtStats";
import { Eu5Flag } from "../components/flags/Eu5Flag";
import styles from "./Timeline.module.css";
export const debtNumber = (v: number | null | undefined, suffix = "") =>
  v == null || !Number.isFinite(v)
    ? "Unavailable"
    : `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
export function DebtCountryDetails({
  country,
  name,
  names = {},
}: {
  country: CountryDebt;
  name?: string;
  names?: Record<string, string>;
}) {
  const summary = debtSummary([country])!;
  return (
    <section className={styles.debtDetails} aria-label="Country debt details">
      <h3 className={styles.goodHeading}>
        <Eu5Flag flag={country.flag} size="base" />
        {name ?? country.tag} · Debt &amp; Interest
      </h3>
      <dl className={styles.debtStats}>
        <div>
          <dt>Outstanding debt</dt>
          <dd>
            <AnimatedValue value={debtNumber(summary.debt)} /> gold
          </dd>
        </div>
        <div>
          <dt>Existing-loan rate</dt>
          <dd>
            <AnimatedValue value={debtNumber(summary.rate, "%")} />
          </dd>
        </div>
        <div>
          <dt>New-loan rate</dt>
          <dd>
            <AnimatedValue value={debtNumber(annualPercent(country.newLoanRate), "%")} />
          </dd>
        </div>
        <div>
          <dt>Debt / Wealth</dt>
          <dd>
            <AnimatedValue value={debtNumber(summary.ratio, "%")} />
          </dd>
        </div>
      </dl>
      <p className={styles.help}>
        Existing rates are annual contract rates, weighted by outstanding principal. Wealth is
        potential tax base, not GDP. A full new-loan quote is not reliably recoverable from these
        saves.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.marketTable}>
          <thead>
            <tr>
              <th>Lender</th>
              <th>Principal (gold)</th>
              <th>Annual rate</th>
            </tr>
          </thead>
          <tbody>
            {country.loans.map((loan, i) => (
              <tr key={i}>
                <td>
                  {loan.lenderId === 0
                    ? "Non-country lender"
                    : (names[String(loan.lenderId)] ??
                      loan.lenderTag ??
                      `Country ${loan.lenderId}`)}
                </td>
                <td>
                  <AnimatedValue value={debtNumber(loan.principal)} />
                </td>
                <td>
                  <AnimatedValue value={debtNumber(annualPercent(loan.annualRate), "%")} />
                </td>
              </tr>
            ))}
            {!country.loans.length && (
              <tr>
                <td colSpan={3}>No outstanding loans.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
