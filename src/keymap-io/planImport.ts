// Works out exactly what importing a parsed keymap would change on the device,
// without touching it, so the user can review it first.

import type { BehaviorBinding, Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { validateValue } from "../behaviors/parameters";
import { DeviceBehaviors, paramInfo, resolveBehavior } from "./deviceBehaviors";
import type { Issue, ParsedKeymap } from "./keymapFile";

// Layer parameters are stored as layer *ids* on the device but written as
// layer *indexes* in a keymap. Layers we still have to add don't have an id
// yet, so they're resolved when the import is applied.
export type PlannedParam = number | { layerIndex: number };

export interface PlannedBinding {
  behaviorId: number;
  param1: PlannedParam;
  param2: PlannedParam;
}

export interface PlannedChange {
  layerIndex: number;
  keyPosition: number;
  binding: PlannedBinding;
  // What the source said, for display.
  text: string;
}

export interface PlannedRename {
  layerIndex: number;
  from: string;
  to: string;
}

export interface ImportPlan {
  layersToAdd: number;
  renames: PlannedRename[];
  changes: PlannedChange[];
  unchanged: number;
  skipped: number;
  fileLayerCount: number;
  deviceLayerCount: number;
  issues: Issue[];
}

export function planImport(
  parsed: ParsedKeymap,
  keymap: Keymap,
  behaviors: DeviceBehaviors
): ImportPlan {
  const issues: Issue[] = [...parsed.issues];
  const deviceLayers = keymap.layers;
  const keyCount = Math.max(0, ...deviceLayers.map((l) => l.bindings.length));

  const extra = Math.max(0, parsed.layers.length - deviceLayers.length);
  const layersToAdd = Math.min(extra, keymap.availableLayers);
  const usableLayers = deviceLayers.length + layersToAdd;

  if (extra > layersToAdd) {
    issues.push({
      severity: "warning",
      message:
        `The file has ${parsed.layers.length} layers but this keyboard can only hold ${usableLayers}. ` +
        `The last ${extra - layersToAdd} will be skipped.`,
    });
  }
  if (layersToAdd) {
    issues.push({ severity: "info", message: `${layersToAdd} new layer(s) will be added.` });
  }
  if (parsed.layers.length < deviceLayers.length) {
    issues.push({
      severity: "info",
      message:
        `The keyboard has ${deviceLayers.length - parsed.layers.length} more layer(s) than the file; ` +
        `those are left as they are.`,
    });
  }

  const renames: PlannedRename[] = [];
  const changes: PlannedChange[] = [];
  let unchanged = 0;
  let skipped = 0;
  const unknownBehaviors = new Map<string, number>();

  parsed.layers.slice(0, usableLayers).forEach((layer, li) => {
    const existing = deviceLayers[li];
    const layerTitle = layer.displayName || layer.nodeName;

    if (layer.displayName !== undefined) {
      const to = layer.displayName.slice(0, keymap.maxLayerNameLength || undefined);
      if (!existing || existing.name !== to) {
        renames.push({ layerIndex: li, from: existing?.name ?? "", to });
      }
    }

    if (layer.bindings.length !== keyCount) {
      issues.push({
        severity: "warning",
        message:
          `Layer "${layerTitle}" has ${layer.bindings.length} bindings but the keyboard has ${keyCount} keys` +
          (layer.bindings.length > keyCount
            ? `; the extra ${layer.bindings.length - keyCount} are ignored.`
            : `; the remaining ${keyCount - layer.bindings.length} keys are left as they are.`),
        line: layer.line,
      });
    }

    layer.bindings.slice(0, keyCount).forEach((b, ki) => {
      const where = `Layer "${layerTitle}", key ${ki}`;
      const skip = (message: string, severity: Issue["severity"] = "error") => {
        skipped++;
        issues.push({ severity, message: `${where}: ${message}`, line: b.line });
      };

      if (b.errors.length) {
        return skip(`can't read '${b.text}' (${b.errors.join(", ")}).`);
      }

      const resolved = resolveBehavior(b.label, behaviors, parsed.behaviors);
      if (!resolved) {
        skipped++;
        unknownBehaviors.set(b.label, (unknownBehaviors.get(b.label) || 0) + 1);
        return;
      }

      const info = paramInfo(resolved.details, resolved.builtin);
      const expected = info.cells ?? parsed.behaviors.get(b.label)?.cells;
      if (expected !== undefined && b.params.length !== expected) {
        return skip(
          `&${b.label} takes ${expected} parameter(s) but got ${b.params.length} ('${b.text}').`
        );
      }

      const params: PlannedParam[] = [0, 0];
      for (let i = 0; i < Math.min(2, b.params.length); i++) {
        const value = b.params[i];
        if (info.kinds[i] === "layer") {
          if (value >= usableLayers) {
            return skip(`'${b.text}' refers to layer ${value}, which won't exist on the keyboard.`);
          }
          params[i] = { layerIndex: value };
        } else {
          params[i] = value;
        }
      }

      // Check against the device's own parameter rules where we can.
      const layerIds = deviceLayers.map((l) => l.id);
      const concrete = params.map((p) =>
        typeof p === "number" ? p : deviceLayers[p.layerIndex]?.id
      );
      const sets = resolved.details.metadata || [];
      if (
        sets.length &&
        concrete.every((v) => v !== undefined) &&
        !sets.some(
          (s) =>
            validateValue(layerIds, concrete[0], s.param1) &&
            validateValue(layerIds, concrete[1], s.param2)
        )
      ) {
        issues.push({
          severity: "warning",
          message: `${where}: the keyboard may not accept '${b.text}'.`,
          line: b.line,
        });
      }

      const binding: PlannedBinding = {
        behaviorId: resolved.details.id,
        param1: params[0],
        param2: params[1],
      };

      const current = existing?.bindings[ki];
      if (current && sameBinding(current, binding, deviceLayers)) {
        unchanged++;
      } else {
        changes.push({ layerIndex: li, keyPosition: ki, binding, text: b.text });
      }
    });
  });

  for (const [label, count] of unknownBehaviors) {
    const defined = parsed.behaviors.get(label);
    issues.push({
      severity: "error",
      message:
        `&${label} isn't on this keyboard` +
        (defined?.displayName ? ` (looked for "${defined.displayName}")` : "") +
        `; ${count} binding(s) skipped. Studio can only assign behaviors that are built into the firmware.`,
    });
  }

  return {
    layersToAdd,
    renames,
    changes,
    unchanged,
    skipped,
    fileLayerCount: parsed.layers.length,
    deviceLayerCount: deviceLayers.length,
    issues,
  };
}

function sameBinding(
  current: BehaviorBinding,
  planned: PlannedBinding,
  layers: Keymap["layers"]
): boolean {
  const resolve = (p: PlannedParam) => (typeof p === "number" ? p : layers[p.layerIndex]?.id);
  return (
    current.behaviorId === planned.behaviorId &&
    current.param1 === resolve(planned.param1) &&
    current.param2 === resolve(planned.param2)
  );
}

export function resolvePlannedBinding(
  planned: PlannedBinding,
  layers: Keymap["layers"]
): BehaviorBinding {
  const resolve = (p: PlannedParam) => {
    if (typeof p === "number") return p;
    const layer = layers[p.layerIndex];
    if (!layer) throw new Error(`Layer ${p.layerIndex} doesn't exist`);
    return layer.id;
  };
  return {
    behaviorId: planned.behaviorId,
    param1: resolve(planned.param1),
    param2: resolve(planned.param2),
  };
}
