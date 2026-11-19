import { findCarriedCountry } from "../../campaignCarry";
import type {
  CarriedSelection,
  CountryIdentity,
  Eu5Carry,
  StableProfile,
} from "../../campaignCarry";
import type { LocationClickChangeEvent } from "../map/map-module";
import { SharedCanvasModifierBits } from "@/lib/canvas_courier";
import type { ActiveProfileIdentity, Eu5App, MapChangeData } from "@/wasm/wasm_eu5";

type Countries = ReturnType<Eu5App["get_countries"]>["countries"];
type ClickApp = Pick<Eu5App, "click" | "clear_focus_or_selection">;

type ViewApp = ClickApp &
  Pick<
    Eu5App,
    | "set_map_mode"
    | "select_players"
    | "change_selection"
    | "focus_in_selection"
    | "market_at_center_id"
    | "get_selection_summary"
    | "location_index_from_id"
    | "get_market_profile"
    | "get_location_profile"
  >;

type CaptureApp = Pick<Eu5App, "selection_target" | "market_center_id" | "get_selection_summary">;

/** Change the selection as a click on the map does. */
export function clickChange(app: ClickApp, event: LocationClickChangeEvent): MapChangeData {
  if (event.kind === "clear") return app.clear_focus_or_selection();
  const op =
    event.modifiers & SharedCanvasModifierBits.Shift
      ? "add"
      : event.modifiers & SharedCanvasModifierBits.Alt
        ? "remove"
        : "replace";
  return app.click(op, event.locationIdx);
}

/**
 * The selection by values that stay the same across saves: a country by its
 * identity, a market by the id of its center location, and a location by
 * its index.
 */
export function captureSelection(app: CaptureApp, countries: Countries): CarriedSelection | null {
  const target = app.selection_target();
  if (!target) return null;
  const focusedLocation = app.get_selection_summary().focusedLocation ?? null;
  switch (target.kind) {
    case "players":
      return { target, focusedLocation };
    case "countries": {
      const keys = new Set(target.ids);
      const identities: CountryIdentity[] = countries
        .filter((c) => keys.has(c.country.key))
        .map(({ id, tag }) => ({ id, tag }));
      return { target: { kind: "countries", countries: identities }, focusedLocation };
    }
    case "markets": {
      const centers = target.ids.flatMap((id) => app.market_center_id(id) ?? []);
      return { target: { kind: "markets", centers }, focusedLocation };
    }
    case "locations":
      return { target: { kind: "locations", locations: target.ids }, focusedLocation };
  }
}

/** Restore a campaign view within the game worker, before publishing its buffers. */
export function restoreCampaignView(app: ViewApp, countries: Countries, carry: Eu5Carry) {
  const change = app.set_map_mode(carry.mapMode);
  const merge = (next: MapChangeData) => {
    change.colorsChanged ||= next.colorsChanged;
    change.flagsChanged ||= next.flagsChanged;
    change.gradient = next.gradient;
  };
  const selection = carry.selection;
  const target = selection?.target;
  // A country or market that is gone from this save leaves the selection.
  if (target?.kind === "players") merge(app.select_players());
  else if (target?.kind === "countries") {
    const keys = target.countries.flatMap((c) => findCarriedCountry(countries, c) ?? []);
    merge(app.change_selection("replace", "countries", Uint32Array.from(keys)));
  } else if (target?.kind === "markets") {
    const ids = target.centers.flatMap((center) => app.market_at_center_id(center) ?? []);
    merge(app.change_selection("replace", "markets", Uint32Array.from(ids)));
  } else if (target?.kind === "locations") {
    merge(app.change_selection("replace", "locations", Uint32Array.from(target.locations)));
  }
  if (selection?.focusedLocation != null) merge(app.focus_in_selection(selection.focusedLocation));
  // A click on a snapshot applies to the save of that snapshot.
  if (carry.inspection && "click" in carry.inspection)
    merge(clickChange(app, carry.inspection.click));
  else if (carry.inspection && "entity" in carry.inspection) {
    const entity = carry.inspection.entity;
    if (entity.kind === "country") {
      const match = countries.find((country) => country.id === entity.id);
      if (!match) throw Error("Country is absent from this save");
      merge(
        app.change_selection(
          carry.inspection.remove ? "remove" : "replace",
          "countries",
          Uint32Array.of(match.country.key),
        ),
      );
    } else if (entity.kind === "market")
      merge(
        app.change_selection(
          carry.inspection.remove ? "remove" : "replace",
          "markets",
          Uint32Array.of(entity.id),
        ),
      );
    else {
      const index = app.location_index_from_id(entity.id);
      if (index == null) throw Error("Location is absent from this save");
      merge(app.change_selection("replace", "locations", Uint32Array.of(index)));
      merge(app.focus_in_selection(index));
    }
  }

  const profiles: ActiveProfileIdentity[] = [];
  for (const profile of carry.profiles ?? []) {
    if (profile.kind === "country") {
      const idx = findCarriedCountry(countries, profile);
      const match = countries.find((country) => country.country.key === idx);
      if (!match) break;
      profiles.push({ kind: "country", country: match.country });
    } else if (profile.kind === "market") {
      const id = app.market_at_center_id(profile.center);
      const market = id == null ? null : app.get_market_profile(id);
      if (!market || id == null) break;
      profiles.push({ kind: "market", market: { key: id, name: market.header.name } });
    } else {
      const location = app.get_location_profile(profile.locationIdx);
      if (!location) break;
      profiles.push({ kind: "location", location: location.header.location });
    }
  }
  return { change, selection: app.get_selection_summary(), profiles };
}

export function campaignIdentities(
  app: Pick<ViewApp, "get_market_profile">,
  countries: Countries,
  profiles: ActiveProfileIdentity[],
): (StableProfile | null)[] {
  return profiles.map((profile) => {
    if (profile.kind === "country") {
      const match = countries.find((c) => c.country.key === profile.country.key);
      return match ? { kind: "country", id: match.id, tag: match.tag } : null;
    }
    if (profile.kind === "market") {
      const market = app.get_market_profile(profile.market.key);
      return market ? { kind: "market", center: market.centerId } : null;
    }
    return { kind: "location", locationIdx: profile.location.key };
  });
}
