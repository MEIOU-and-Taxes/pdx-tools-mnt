import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type * as React from "react";
import type * as HistoryStore from "./store";

const mocks = vi.hoisted(() => ({
  developer: false,
  effects: [] as Array<() => void | (() => void)>,
  worker: vi.fn(),
  queryHistory: vi.fn(async () => []),
  marketCenters: vi.fn(async () => []),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  // Execute the real query effects explicitly after SSR, without a browser.
  useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
}));
vi.mock("@/features/account", () => ({ useIsDeveloper: () => mocks.developer }));
vi.mock("./analysisClient", () => ({ campaignAnalysis: mocks.worker }));
vi.mock("./store", async (original) => {
  const actual = await original<typeof HistoryStore>();
  return {
    ...actual,
    useHistory: Object.assign(
      (select: (state: ReturnType<typeof actual.useHistory.getState>) => unknown) =>
        select(actual.useHistory.getState()),
      actual.useHistory,
    ),
  };
});
import { useHistory } from "./store";
import { useAnalysisHistory, useCountryMarketCenters } from "./useAnalysisHistory";

beforeEach(() => {
  mocks.effects = [];
  mocks.developer = false;
  mocks.worker.mockReset().mockReturnValue({
    queryHistory: mocks.queryHistory,
    marketCenters: mocks.marketCenters,
  });
  mocks.queryHistory.mockClear();
  mocks.marketCenters.mockClear();
  useHistory.setState({ snapshots: [], analysisEnabledCampaigns: [], progress: null });
});

function render(campaignId = "campaign", requested = true) {
  function Queries() {
    const result = useAnalysisHistory({ campaignId, country: "id:101" }, requested);
    useCountryMarketCenters(campaignId, "id:101", requested);
    return <span>{result.loading ? "loading" : "idle"}</span>;
  }
  const html = renderToStaticMarkup(<Queries />);
  const cleanups = mocks.effects.map((effect) => effect());
  return { html, cleanup: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

it.each([false, true])(
  "does not create a worker for an ordinary user (campaign activated: %s)",
  (activated) => {
    if (activated) useHistory.getState().enableAnalysis("campaign");
    const result = render();
    expect(result.html).toContain("idle");
    expect(mocks.worker).not.toHaveBeenCalled();
    result.cleanup();
  },
);

it("waits for Analyze campaign even for a developer", () => {
  mocks.developer = true;
  const result = render();
  expect(result.html).toContain("idle");
  expect(mocks.worker).not.toHaveBeenCalled();
  result.cleanup();
});

it("queries both history and markets after developer activation", () => {
  mocks.developer = true;
  useHistory.getState().enableAnalysis("campaign");
  const result = render();
  expect(result.html).toContain("loading");
  expect(mocks.queryHistory).toHaveBeenCalledWith({
    campaignId: "campaign",
    country: "id:101",
    good: undefined,
    centers: [],
  });
  expect(mocks.marketCenters).toHaveBeenCalledWith("campaign", "id:101");
  result.cleanup();
});

it.each([
  ["campaign", false],
  ["other", true],
  ["", true],
] as const)(
  "does not query a hidden or inactive campaign (%s, visible: %s)",
  (campaignId, requested) => {
    mocks.developer = true;
    useHistory.getState().enableAnalysis("campaign");
    const result = render(campaignId, requested);
    expect(result.html).toContain("idle");
    expect(mocks.worker).not.toHaveBeenCalled();
    result.cleanup();
  },
);

it("coalesces import revisions and cancels superseded queries before touching the worker", () => {
  vi.useFakeTimers();
  try {
    mocks.developer = true;
    useHistory.getState().enableAnalysis("campaign");
    useHistory.setState({ progress: { completed: 1, total: 100, startedAt: 0 } });
    const first = render();
    expect(mocks.queryHistory).not.toHaveBeenCalled();
    first.cleanup();
    vi.advanceTimersByTime(250);
    expect(mocks.queryHistory).not.toHaveBeenCalled();
    mocks.effects = [];
    const latest = render();
    vi.advanceTimersByTime(200);
    expect(mocks.queryHistory).toHaveBeenCalledOnce();
    expect(mocks.marketCenters).toHaveBeenCalledOnce();
    latest.cleanup();
  } finally {
    vi.useRealTimers();
  }
});
