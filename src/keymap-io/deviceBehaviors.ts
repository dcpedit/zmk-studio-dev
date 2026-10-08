// Matching keymap behavior labels to the behaviors a connected device reports,
// and working out what each behavior's parameters mean.

import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { FileBehavior } from "./keymapFile";
import {
  BuiltinBehavior,
  ParamKind,
  builtinByDisplayName,
  builtinByLabel,
  labelsMatch,
  toLabel,
} from "./zmk";

export type DeviceBehaviors = Record<number, GetBehaviorDetailsResponse>;

export interface ParamInfo {
  // Number of devicetree cells the behavior takes.
  cells: number | undefined;
  kinds: (ParamKind | undefined)[];
}

const POSITIONS = ["param1", "param2"] as const;

// Combine the device's metadata with what we know about stock behaviors.
// Device metadata wins for kinds; the stock #binding-cells wins for count,
// because metadata can't express "this cell is always 0" (e.g. BT_CLR).
export function paramInfo(
  details: GetBehaviorDetailsResponse | undefined,
  builtin?: BuiltinBehavior
): ParamInfo {
  const sets = details?.metadata || [];
  const kinds: (ParamKind | undefined)[] = POSITIONS.map((pos, i) => {
    const values = sets.flatMap((s) => s[pos] || []);
    if (values.some((v) => v.layerId)) return "layer";
    if (values.some((v) => v.hidUsage)) return "hid";
    if (values.some((v) => v.constant !== undefined || v.range)) return "value";
    return builtin?.params[i];
  });

  let cells = builtin?.cells;
  if (cells === undefined && sets.length) {
    cells = kinds[1] ? 2 : kinds[0] ? 1 : 0;
  }
  return { cells, kinds };
}

export interface ResolvedBehavior {
  details: GetBehaviorDetailsResponse;
  builtin?: BuiltinBehavior;
}

// Find the device behavior a keymap label refers to.
export function resolveBehavior(
  label: string,
  device: DeviceBehaviors,
  fileBehaviors: Map<string, FileBehavior>
): ResolvedBehavior | undefined {
  const all = Object.values(device);
  const builtin = builtinByLabel(label);

  if (builtin) {
    const match = all.find((d) => builtin.displayNames.some((n) => labelsMatch(n, d.displayName)));
    if (match) return { details: match, builtin };
  }

  const defined = fileBehaviors.get(label);
  if (defined) {
    const candidates = [defined.displayName, defined.nodeName].filter((n): n is string => !!n);
    const match = all.find((d) => candidates.some((n) => labelsMatch(n, d.displayName)));
    if (match) return { details: match };
  }

  const byName = all.find((d) => labelsMatch(label, d.displayName));
  if (byName) return { details: byName, builtin: builtinByDisplayName(byName.displayName) };

  return undefined;
}

// The label to write for a device behavior when exporting.
export function behaviorLabel(details: GetBehaviorDetailsResponse): {
  label: string;
  builtin?: BuiltinBehavior;
} {
  const builtin = builtinByDisplayName(details.displayName);
  if (builtin) return { label: builtin.label, builtin };
  return { label: toLabel(details.displayName) };
}
