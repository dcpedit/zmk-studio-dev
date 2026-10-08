// Writes the device's current keymap as a ZMK .keymap file.

import type { Keymap, PhysicalLayout } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { DeviceBehaviors, behaviorLabel, paramInfo } from "./deviceBehaviors";
import { BuiltinBehavior, ParamKind, constantsFor, keycodeName, zmkMacros } from "./zmk";

export interface ExportInput {
  keymap: Keymap;
  behaviors: DeviceBehaviors;
  layout?: PhysicalLayout;
  deviceName?: string;
  date?: Date;
}

export interface ExportResult {
  text: string;
  warnings: string[];
}

const INCLUDE_FOR_HEADER: Record<string, string> = {
  "bt.h": "dt-bindings/zmk/bt.h",
  "outputs.h": "dt-bindings/zmk/outputs.h",
  "rgb.h": "dt-bindings/zmk/rgb.h",
  "backlight.h": "dt-bindings/zmk/backlight.h",
  "ext_power.h": "dt-bindings/zmk/ext_power.h",
  "pointing.h": "dt-bindings/zmk/pointing.h",
};

export function exportKeymap({
  keymap,
  behaviors,
  layout,
  deviceName,
  date = new Date(),
}: ExportInput): ExportResult {
  const warnings: string[] = [];
  const headers = new Set<string>();
  const layerDefines = makeLayerDefines(keymap.layers.map((l) => l.name));
  const layerNodes = makeLayerNodeNames(keymap.layers.map((l) => l.name));
  const layerIndexById = new Map(keymap.layers.map((l, i) => [l.id, i]));
  const warnedCustom = new Set<number>();

  const formatBinding = (
    b: { behaviorId: number; param1: number; param2: number },
    where: string
  ): string => {
    const details = behaviors[b.behaviorId];
    if (!details) {
      warnings.push(`${where}: behavior #${b.behaviorId} isn't known to the device; exported as &none.`);
      return "&none";
    }
    const { label, builtin } = behaviorLabel(details);
    if (!builtin && !warnedCustom.has(b.behaviorId)) {
      warnedCustom.add(b.behaviorId);
      warnings.push(
        `"${details.displayName}" isn't a stock ZMK behavior, so it's written as &${label}. ` +
          `Your config needs a behavior with that label for the file to build.`
      );
    }
    if (builtin?.constantsHeader) headers.add(builtin.constantsHeader);

    const info = paramInfo(details, builtin);
    const raw = [b.param1, b.param2];
    const cells = info.cells ?? (raw[1] ? 2 : raw[0] ? 1 : 0);
    const parts = [`&${label}`];

    // Behaviors like &bt have names covering both cells (BT_CLR = 0 0) or
    // just the first (BT_SEL, then a number).
    const named = builtin && namedConstant(builtin, raw.slice(0, cells));
    if (named) {
      parts.push(named.text);
      for (let i = named.consumed; i < cells; i++) parts.push(String(raw[i]));
      return parts.join(" ");
    }

    for (let i = 0; i < cells; i++) {
      parts.push(formatParam(raw[i], info.kinds[i], where));
    }
    return parts.join(" ");
  };

  const formatParam = (value: number, kind: ParamKind | undefined, where: string): string => {
    if (kind === "hid") {
      const name = keycodeName(value);
      if (name) return name;
      warnings.push(`${where}: no ZMK name for HID usage 0x${value.toString(16)}; written as a number.`);
      return `0x${value.toString(16)}`;
    }
    if (kind === "layer") {
      const index = layerIndexById.get(value);
      if (index !== undefined) return layerDefines[index];
      warnings.push(`${where}: refers to a layer that no longer exists (id ${value}).`);
      return String(value);
    }
    return String(value);
  };

  const rows = layoutRows(layout);
  const layerBlocks = keymap.layers.map((layer, li) => {
    const bindings = layer.bindings.map((b, ki) =>
      formatBinding(b, `Layer "${layer.name || li}", key ${ki}`)
    );
    const lines = formatGrid(bindings, rows).map((l) => `                ${l}`);
    const displayName = layer.name ? `            display-name = ${JSON.stringify(layer.name)};\n` : "";
    return (
      `        ${layerNodes[li]} {\n` +
      displayName +
      `            bindings = <\n${lines.join("\n")}\n            >;\n` +
      `        };`
    );
  });

  const includes = [
    "behaviors.dtsi",
    "dt-bindings/zmk/keys.h",
    ...[...headers].sort().map((h) => INCLUDE_FOR_HEADER[h]),
  ];

  const headerComment = [
    "/*",
    ` * Exported from ZMK Studio${deviceName ? ` (${deviceName})` : ""} on ${date.toISOString().slice(0, 10)}.`,
    ...(warnings.length
      ? [" *", " * Export notes:", ...warnings.map((w) => ` *   - ${w.replace(/\*\//g, "* /")}`)]
      : []),
    " */",
  ];

  const text = [
    ...headerComment,
    "",
    ...includes.map((i) => `#include <${i}>`),
    "",
    ...layerDefines.map((d, i) => `#define ${d} ${i}`),
    "",
    "/ {",
    "    keymap {",
    '        compatible = "zmk,keymap";',
    "",
    layerBlocks.join("\n\n"),
    "    };",
    "};",
    "",
  ].join("\n");

  return { text, warnings };
}

function namedConstant(
  builtin: BuiltinBehavior,
  cells: number[]
): { text: string; consumed: number } | undefined {
  const constants = constantsFor(builtin);
  if (!constants.length) return undefined;
  const eq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

  const full = constants.find(([, v]) => eq(v, cells));
  if (full) return { text: full[0], consumed: cells.length };
  if (cells.length > 1) {
    const head = constants.find(([, v]) => eq(v, cells.slice(0, 1)));
    if (head) return { text: head[0], consumed: 1 };
  }
  return undefined;
}

// Layer names as C identifiers for `#define NAV 1`, avoiding clashes with
// ZMK's own names (a layer called "A" or "TAB" would shadow the keycode).
export function makeLayerDefines(names: string[]): string[] {
  const reserved = zmkMacros();
  const used = new Set<string>();
  return names.map((name, i) => {
    let base = name
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!base) base = `LAYER_${i}`;
    if (/^[0-9]/.test(base)) base = `L_${base}`;
    if (reserved.has(base)) base = `${base}_LAYER`;
    let id = base;
    for (let n = 2; used.has(id) || reserved.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  });
}

function makeLayerNodeNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, i) => {
    let base = name
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!base) base = `layer_${i}`;
    if (!/^[a-z]/.test(base)) base = `layer_${base}`;
    if (!base.endsWith("layer")) base = `${base}_layer`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  });
}

interface RowKey {
  index: number;
  gapBefore: boolean;
}

// Group key positions into visual rows using the physical layout, so the
// exported bindings look like the keyboard.
function layoutRows(layout?: PhysicalLayout): RowKey[][] | undefined {
  if (!layout?.keys.length) return undefined;
  const rows: RowKey[][] = [];
  layout.keys.forEach((k, index) => {
    const prev = layout.keys[index - 1];
    const newRow = !prev || Math.abs(k.y - prev.y) >= 50 || k.x < prev.x;
    const gapBefore = !!prev && !newRow && k.x - (prev.x + prev.width) >= 100;
    if (newRow) rows.push([]);
    rows[rows.length - 1].push({ index, gapBefore });
  });
  return rows;
}

function formatGrid(bindings: string[], rows?: RowKey[][]): string[] {
  const width = Math.max(...bindings.map((b) => b.length));
  const pad = (s: string) => s.padEnd(width);
  const covered = rows?.reduce((n, r) => n + r.length, 0);

  if (!rows || covered !== bindings.length) {
    // No usable layout: ten per line.
    const lines: string[] = [];
    for (let i = 0; i < bindings.length; i += 10) {
      lines.push(bindings.slice(i, i + 10).map(pad).join("  ").trimEnd());
    }
    return lines;
  }

  return rows.map((row) =>
    row
      .map((k, i) => (i > 0 ? (k.gapBefore ? "      " : "  ") : "") + pad(bindings[k.index]))
      .join("")
      .trimEnd()
  );
}
