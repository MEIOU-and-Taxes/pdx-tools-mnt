import { useEffect, useState } from "react";
import { campaignAnalysis } from "./analysisClient";
import { useHistory } from "./store";
import { useIsCampaignAnalysisEnabled } from "./useIsCampaignAnalysisEnabled";
import type { HistoryQuery } from "./analysisTypes";
import type { Snapshot } from "./types";

const EMPTY_DATES: Snapshot[] = [];

function useAnalysisQueryEnabled(campaignId: string, requested: boolean) {
  const featureEnabled = useIsCampaignAnalysisEnabled();
  return useHistory(
    (state) => requested && featureEnabled && state.analysisEnabledCampaigns.includes(campaignId),
  );
}

/** Request only the country and market series currently shown by the history panel. */
export function useAnalysisHistory(query: HistoryQuery, requested = true) {
  const enabled = useAnalysisQueryEnabled(query.campaignId, requested);
  const importing = useHistory((state) => state.progress !== null);
  const revision = useHistory((state) =>
    state.snapshots
      .filter((row) => row.campaignId === query.campaignId)
      .map((row) => row.hash)
      .join("|"),
  );
  const centers = JSON.stringify(query.centers ?? []);
  const key = JSON.stringify([query.campaignId, query.country, query.good, centers]);
  const [result, setResult] = useState<{
    key: string;
    revision: typeof revision;
    dates: Snapshot[];
    loading: boolean;
    error: string | null;
  }>({ key: "", revision, dates: [], loading: true, error: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = () => {
      void campaignAnalysis()
        .queryHistory({
          campaignId: query.campaignId,
          country: query.country,
          good: query.good,
          centers: JSON.parse(centers),
        })
        .then(
          (dates) => {
            if (!cancelled) setResult({ key, revision, dates, loading: false, error: null });
          },
          (error) => {
            if (!cancelled)
              setResult({ key, revision, dates: [], loading: false, error: String(error) });
          },
        );
    };
    const timer = importing ? setTimeout(run, 200) : undefined;
    if (!importing) run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query.campaignId, query.country, query.good, centers, key, revision, enabled, importing]);
  return enabled && result.key === key
    ? {
        ...result,
        loading: result.revision !== revision,
        error: result.revision === revision ? result.error : null,
      }
    : { dates: EMPTY_DATES, loading: enabled, error: null };
}

export function useCountryMarketCenters(
  campaignId: string,
  country?: string,
  requested = true,
): number[] | null {
  const enabled = useAnalysisQueryEnabled(campaignId, requested);
  const importing = useHistory((state) => state.progress !== null);
  const revision = useHistory((state) =>
    state.snapshots
      .filter((row) => row.campaignId === campaignId)
      .map((row) => row.hash)
      .join("|"),
  );
  const [result, setResult] = useState<{
    campaignId: string;
    country: string;
    centers: number[];
  } | null>(null);
  useEffect(() => {
    if (!enabled || !country) return;
    let cancelled = false;
    const run = () => {
      void campaignAnalysis()
        .marketCenters(campaignId, country)
        .then(
          (centers) => {
            if (!cancelled) setResult({ campaignId, country, centers });
          },
          () => {
            if (!cancelled) setResult({ campaignId, country, centers: [] });
          },
        );
    };
    const timer = importing ? setTimeout(run, 200) : undefined;
    if (!importing) run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [campaignId, country, revision, enabled, importing]);
  return country
    ? enabled && result?.campaignId === campaignId && result.country === country
      ? result.centers
      : []
    : null;
}
