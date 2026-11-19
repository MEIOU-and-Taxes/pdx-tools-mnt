import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  open: vi.fn(),
  meta: vi.fn(),
  free: vi.fn(),
  gameOpen: vi.fn(),
  locOpen: vi.fn(),
}));
vi.mock("comlink", () => ({ expose: vi.fn(), transfer: (value: unknown) => value }));
vi.mock("@sentry/react-router", () => ({ registerWebWorker: vi.fn() }));
vi.mock("@/wasm/wasm_eu5", () => ({
  default: vi.fn(),
  set_tokens: vi.fn(),
  ImportLoader: { open: mocks.open },
  Eu5WasmGameBundle: { open: mocks.gameOpen },
  Eu5WasmLocalizationBundle: { open: mocks.locOpen },
}));
vi.mock("../bundleUrls", () => ({
  getBundleUrls: () => ({ game: "/game.zip", loc: "/loc-en.zip" }),
  resolveBundleVersion: (version: string) => version,
  analysisBundleIdentity: () => "test",
}));
import { parseImport } from "./snapshot-worker";
const snapshot = { descriptor: { id: "eu5:checksum" }, data: new Uint8Array([1]) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1]))),
  );
  mocks.open.mockResolvedValue({ meta: mocks.meta, parse_import: mocks.parse, free: mocks.free });
  mocks.meta.mockReturnValue({ playthroughId: "campaign", version: { major: 1, minor: 4 } });
  mocks.gameOpen.mockReturnValue({ kind: "game" });
  mocks.locOpen.mockReturnValue({ kind: "localization" });
  mocks.parse.mockReturnValue(snapshot);
});
afterEach(() => vi.unstubAllGlobals());
it("uses one full parser with the matching game and localization bundles", async () => {
  const file = new File(["save"], "test.eu5");
  const result = await parseImport(file);
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith(file);
  expect(mocks.parse).toHaveBeenCalledExactlyOnceWith({ kind: "game" }, { kind: "localization" });
  expect(result).toBe(snapshot);
  expect(fetch).toHaveBeenCalledWith("/game.zip");
  expect(fetch).toHaveBeenCalledWith("/loc-en.zip");
});
it("reuses initialization and parses a later file after an ordinary parse failure", async () => {
  mocks.parse.mockImplementationOnce(() => {
    throw Error("unknown field food");
  });
  await expect(parseImport(new File(["bad"], "bad.eu5"))).rejects.toThrow("unknown field food");
  await expect(parseImport(new File(["good"], "good.eu5"))).resolves.toBeDefined();
  expect(mocks.parse).toHaveBeenCalledTimes(2);
});
it("frees an unconsumed loader when campaign metadata is absent", async () => {
  mocks.meta.mockReturnValue({ playthroughId: "" });
  await expect(parseImport(new File(["save"], "bad.eu5"))).rejects.toThrow("campaign ID");
  expect(mocks.free).toHaveBeenCalledOnce();
  expect(mocks.parse).not.toHaveBeenCalled();
});
it("propagates asynchronous file failures without retrying a different parser", async () => {
  mocks.open.mockRejectedValue(Error("File changed"));
  await expect(parseImport(new File(["save"], "bad.eu5"))).rejects.toThrow("File changed");
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(mocks.parse).not.toHaveBeenCalled();
});
