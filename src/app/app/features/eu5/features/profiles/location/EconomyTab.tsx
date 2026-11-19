import { formatFloat } from "@/lib/format";
import type { LocationProfile } from "@/wasm/wasm_eu5";
import { Figure } from "../../../components/Figure";
import { SectionTitle } from "../../../components";

interface Props {
  profile: LocationProfile;
}

export function LocationEconomyTab({ profile }: Props) {
  if (profile.buildings.length === 0) {
    return <p className="text-sm text-game-ink-500">No buildings.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle className="mb-0">Buildings</SectionTitle>
      <div className="flex flex-col gap-1">
        {profile.buildings.map((b, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-game-ink-300">
              {b.building.name}
              {b.rgoGood && <span className="text-game-ink-500"> · {b.rgoGood.name}</span>}
              {b.productionMethods.length > 0 && (
                <span className="block text-xs text-game-ink-500">
                  {b.productionMethods.map((pm) => pm.name).join(", ")}
                </span>
              )}
              <span className="block text-xs text-game-ink-500">
                {formatFloat(b.employed, 0)} employed
              </span>
            </span>
            <span className="font-game-num text-xs text-game-ink-300">
              <Figure value={b.level} form="level" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
