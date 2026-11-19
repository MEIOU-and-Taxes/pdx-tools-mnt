import { expose, transfer } from "comlink";
import { registerWebWorker } from "@sentry/react-router";
import init, {
  set_tokens,
  ImportLoader,
  Eu5WasmGameBundle,
  Eu5WasmLocalizationBundle,
} from "@/wasm/wasm_eu5";
import wasmUrl from "@/wasm/wasm_eu5_bg.wasm?url";
import tokenUrl from "../../../../../../assets/tokens/eu5.bin?url";
import { getBundleUrls, resolveBundleVersion } from "../bundleUrls";
import { compiledCacheKey, readCompiledAnalysis, writeCompiledAnalysis } from "./analysisCache";
import { analysisBundleIdentity } from "../bundleUrls";
import type { Eu5Snapshot } from "./analysisTypes";
registerWebWorker({ self: globalThis });
let initialized: Promise<unknown> | undefined;
const initialize = () =>
  (initialized ??= (async () => {
    await init({ module_or_path: wasmUrl });
    const response = await fetch(tokenUrl);
    if (!response.ok) throw Error("Could not load EU5 parser tokens");
    set_tokens(new Uint8Array(await response.arrayBuffer()));
  })().catch((error) => {
    initialized = undefined;
    throw error;
  }));
export function releaseBuffer(buffer: ArrayBuffer | undefined) {
  if (!buffer?.byteLength) return;
  if (typeof buffer.transfer === "function") buffer.transfer(0);
  else if (typeof structuredClone === "function") structuredClone(buffer, { transfer: [buffer] });
}
const bundles = new Map<
  string,
  Promise<{ game: Eu5WasmGameBundle; localization: Eu5WasmLocalizationBundle }>
>();
function assets(version: string) {
  let pending = bundles.get(version);
  if (!pending) {
    pending = loadAssets(version).catch((error) => {
      bundles.delete(version);
      throw error;
    });
    bundles.set(version, pending);
  }
  return pending;
}
async function loadAssets(version: string) {
  const urls = getBundleUrls(resolveBundleVersion(version));
  const read = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw Error("Could not load EU5 analytical assets");
    return new Uint8Array(await response.arrayBuffer());
  };
  const [game, loc] = await Promise.all([read(urls.game), read(urls.loc)]);
  let openedGame: Eu5WasmGameBundle | undefined;
  try {
    openedGame = Eu5WasmGameBundle.open(game);
    return {
      game: openedGame,
      localization: Eu5WasmLocalizationBundle.open(loc),
    };
  } catch (error) {
    openedGame?.free();
    throw error;
  } finally {
    releaseBuffer(game.buffer);
    releaseBuffer(loc.buffer);
  }
}
/** Parse one full model, release its arena, and keep the worker reusable. */
export type ParseProgress = { stage: string; cache?: "hit" | "miss" | "unavailable" };
export async function parseImport(
  file: File,
  report?: (progress: ParseProgress) => void,
  useCompiledCache = true,
): Promise<Eu5Snapshot> {
  let cacheKey: string | undefined;
  try {
    if (useCompiledCache) {
      let last = -1;
      cacheKey = await compiledCacheKey(
        file,
        [wasmUrl, tokenUrl, analysisBundleIdentity()].join("|"),
        (percent) => {
          const step = Math.floor(percent / 10);
          if (step !== last) {
            last = step;
            report?.({ stage: `Checking compiled cache · ${percent}%` });
          }
        },
      );
      const cached = await readCompiledAnalysis(cacheKey);
      if (cached) {
        report?.({ stage: "Loaded compiled analysis from disk", cache: "hit" });
        return transfer(cached, [cached.data.buffer]);
      }
    }
  } catch {
    report?.({ stage: "Disk cache unavailable; parsing save", cache: "unavailable" });
  }
  report?.({ stage: "Reading save", cache: "miss" });
  await initialize();
  const parser = await ImportLoader.open(file);
  let data: Awaited<ReturnType<typeof assets>> | undefined;
  let consumed = false;
  try {
    const meta = parser.meta();
    if (!meta.playthroughId) throw Error("Save has no campaign ID");
    report?.({ stage: "Loading analysis assets" });
    data = await assets(`${meta.version.major}.${meta.version.minor}`);
    consumed = true;
    report?.({ stage: "Parsing save and building analysis" });
    const result = parser.parse_import(data.game, data.localization);
    if (cacheKey) {
      report?.({ stage: "Saving compiled analysis to disk" });
      const saved = await writeCompiledAnalysis(cacheKey, result);
      report?.({
        stage: saved
          ? "Compiled analysis cached on disk"
          : "Disk cache unavailable or full; analysis ready",
        ...(saved ? {} : { cache: "unavailable" as const }),
      });
    }
    return transfer(result, [result.data.buffer]);
  } finally {
    if (!consumed) parser.free();
  }
}
expose({ parseImport });
