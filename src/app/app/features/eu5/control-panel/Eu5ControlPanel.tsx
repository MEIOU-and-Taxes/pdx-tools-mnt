import { compiledCacheStatus, clearCompiledCache } from "../history/analysisCache";
import { SidebarNav } from "../components/SidebarNav";
import { useMapHistory } from "../history/context";
import { useEffect, useRef, useState } from "react";
import PlusIcon from "@heroicons/react/16/solid/PlusIcon";
import { useIsCampaignAnalysisEnabled } from "../history/useIsCampaignAnalysisEnabled";
import { GameButton } from "@/components/game/Button";
import { holdsRef, localSaveRegistry, registerLocalSaves } from "@/features/campaign/localSaves";
import { useEu5Input, useEu5PlaythroughId, useSetEu5InsightPanelOpen } from "../store";
import { isAnalysisPaused, useHistory } from "../history/store";
import { ImportProgress } from "../history/ImportProgress";
import { analyzeCampaign } from "../history/analyzeCampaign";
import { CampaignSection } from "@/features/campaign/CampaignStepper";
import { PanelHeader } from "./PanelHeader";
import { MapModesSection } from "./MapModesSection";
import { RenderBar } from "./RenderBar";
import { ShareRow } from "./ShareSave";
import { ExportRow } from "./ExportRow";

export const Eu5ControlPanel = () => {
  const preview = useMapHistory()?.preview;
  return (
    <div className="pointer-events-auto absolute inset-y-0 left-0 z-30 w-[332px]">
      <aside className="flex h-full w-full flex-col border-r border-game-line-strong bg-game-panel">
        <PanelHeader />
        <CampaignSection className="border-b border-game-line" />
        <AddCampaignSaves />
        <CompiledCacheControls />
        <MapModesSection />
        <FinancialAnalysisNav />
        <div className="flex-1 overflow-hidden" />
        <RenderBar />
        <ShareRow unavailable={!!preview} />
        <ExportRow />
      </aside>
    </div>
  );
};

function AddCampaignSaves() {
  const featureEnabled = useIsCampaignAnalysisEnabled();
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const workers = useHistory((s) => s.analysisWorkers);
  const useCache = useHistory((s) => s.analysisUseCache);
  const playthroughId = useEu5PlaythroughId();
  const currentInput = useEu5Input();
  const localSaves = localSaveRegistry.useEntries();
  const progress = useHistory((state) => state.progress);
  const cancel = useHistory((state) => state.cancel);
  const paused = useHistory((state) => isAnalysisPaused(state, playthroughId));
  const issues = useHistory((state) => state.issues);
  const enabled = useHistory(
    (state) => !!playthroughId && state.analysisEnabledCampaigns.includes(playthroughId),
  );
  const entries = localSaves.filter(
    (entry) =>
      entry.game === "eu5" &&
      (entry.identity === null ||
        entry.identity.playthroughId === playthroughId ||
        (currentInput.kind !== "server" && holdsRef(entry, currentInput))),
  );
  const addFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((file) => /\.eu5$/i.test(file.name));
    if (!files.length) return;
    setBusy(true);
    try {
      await registerLocalSaves(
        "eu5",
        files.map((file) => ({ kind: "file", file })),
      );
    } catch (error) {
      useHistory.setState({ issues: [String(error)] });
    } finally {
      setBusy(false);
    }
  };
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  };
  return (
    <div className="border-b border-game-line px-3.5 py-2">
      <div className="flex items-center gap-2">
        <GameButton className="flex-1" disabled={busy} onClick={() => input.current?.click()}>
          <PlusIcon aria-hidden className="size-4" /> Add saves
        </GameButton>
        <GameButton variant="ghost" disabled={busy} onClick={() => folder.current?.click()}>
          Add folder
        </GameButton>
      </div>
      <input
        ref={input}
        type="file"
        aria-label="Add campaign saves"
        className="sr-only"
        accept=".eu5"
        multiple
        onChange={onChange}
      />
      <input
        ref={folder}
        type="file"
        aria-label="Add campaign save folder"
        className="sr-only"
        multiple
        {...{ webkitdirectory: "" }}
        onChange={onChange}
      />
      {featureEnabled && (
        <label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-game-ink-500">
          Analysis workers
          <select
            aria-label="Analysis workers"
            value={workers}
            disabled={!!progress}
            className="rounded-control border border-game-line bg-game-panel px-1 py-0.5 text-game-ink-300"
            onChange={(e) => useHistory.getState().setAnalysisWorkers(Number(e.target.value))}
          >
            {[0, 1, 2, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Auto (CPU / memory)" : `${n} workers`}
              </option>
            ))}
          </select>
        </label>
      )}
      {featureEnabled && (
        <label className="mt-2 flex items-center gap-2 text-[10px] text-game-ink-500">
          <input
            type="checkbox"
            aria-label="Use compiled disk cache"
            checked={useCache}
            disabled={!!progress}
            onChange={(e) => useHistory.getState().setAnalysisUseCache(e.target.checked)}
          />
          Use compiled disk cache
        </label>
      )}
      {featureEnabled && (!enabled || paused || issues.length > 0) && (
        <GameButton
          className="mt-2 w-full"
          variant="ghost"
          disabled={busy || !!progress || !entries.length || !playthroughId}
          onClick={() => {
            if (!playthroughId) return;
            useHistory.getState().enableAnalysis(playthroughId);
            if (enabled)
              void analyzeCampaign(entries, playthroughId).catch((error) =>
                useHistory.setState({ issues: [String(error)] }),
              );
          }}
        >
          {progress
            ? "Analyzing saves…"
            : !enabled
              ? "Analyze campaign"
              : paused
                ? "Resume import"
                : "Retry import"}
        </GameButton>
      )}
      {progress && (
        <div className="mt-3">
          <ImportProgress progress={progress} onCancel={() => cancel?.()} />
        </div>
      )}
      {issues.length > 0 && (
        <details className="mt-2 text-xs text-game-ink-300">
          <summary className="cursor-pointer">{issues.length} import notices</summary>
          <ul className="mt-2 max-h-32 space-y-2 overflow-y-auto break-words">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FinancialAnalysisNav() {
  const enabled = useIsCampaignAnalysisEnabled();
  const section = useHistory((s) => s.section);
  const open = useHistory((s) => s.panelOpen);
  const setPanelOpen = useSetEu5InsightPanelOpen();
  if (!enabled) return null;
  return (
    <SidebarNav aria-label="Financial analysis" className="border-b border-game-line">
      <SidebarNav.Section label="Analysis">
        <SidebarNav.Item
          active={open && section === "debt"}
          onClick={() => {
            useHistory.getState().showSection("debt");
            setPanelOpen(true);
          }}
        >
          Debt &amp; Interest
        </SidebarNav.Item>
      </SidebarNav.Section>
    </SidebarNav>
  );
}

function CompiledCacheControls() {
  const enabled = useIsCampaignAnalysisEnabled();
  const progress = useHistory((s) => s.progress);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof compiledCacheStatus>> | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || progress) return;
    let cancelled = false;
    void compiledCacheStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, progress]);
  if (!enabled || !status) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-1 border-b border-game-line px-3.5 py-2 text-[10px] text-game-ink-500">
      <span>
        {status.available
          ? `Disk cache · ${status.count} saves · ${(status.bytes / 1024 ** 2).toFixed(0)} MB`
          : "Disk cache unavailable"}
      </span>
      {status.available && (
        <button
          type="button"
          disabled={!!progress || status.count === 0}
          onClick={() => {
            void clearCompiledCache()
              .then(() => compiledCacheStatus())
              .then(setStatus)
              .catch((e) => setError(String(e)));
          }}
          className="underline disabled:opacity-40"
        >
          Clear cache
        </button>
      )}
      {error && <span role="status">{error}</span>}
    </div>
  );
}
