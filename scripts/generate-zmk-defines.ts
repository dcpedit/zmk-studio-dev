// Regenerates src/keymap-io/zmk-defines.json from ZMK's dt-bindings headers.
//
// Usage:
//   mkdir -p /tmp/zmk-headers && cd /tmp/zmk-headers
//   for f in modifiers.h hid_usage_pages.h hid_usage.h keys.h bt.h outputs.h \
//            rgb.h backlight.h ext_power.h pointing.h; do
//     curl -sfLO https://raw.githubusercontent.com/zmkfirmware/zmk/main/app/include/dt-bindings/zmk/$f
//   done
//   npx tsx scripts/generate-zmk-defines.ts /tmp/zmk-headers <zmk commit sha>
//
// Header contents are MIT licensed (ZMK contributors).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluate,
  expand,
  preprocess,
  splitCells,
  toCell,
  type MacroTable,
} from "../src/keymap-io/preprocessor.ts";

const [dir, sha = "main"] = process.argv.slice(2);
if (!dir) {
  console.error("usage: generate-zmk-defines.ts <header dir> [zmk sha]");
  process.exit(1);
}

const read = (f: string) => readFileSync(join(dir, f), "utf8");

// Zephyr's BIT() is used by pointing.h but lives outside ZMK.
const prelude = "#define BIT(n) (1 << (n))\n";

const PARAM_HEADERS = [
  "modifiers.h",
  "bt.h",
  "outputs.h",
  "rgb.h",
  "backlight.h",
  "ext_power.h",
  "pointing.h",
];

const all =
  prelude +
  ["modifiers.h", "hid_usage_pages.h", "hid_usage.h", "keys.h", ...PARAM_HEADERS]
    .map(read)
    .join("\n");
const { macros } = preprocess(all);

function definedNames(src: string): { name: string; fn: boolean; deprecated: boolean }[] {
  return src
    .split("\n")
    .map((l) => /^\s*#define\s+([A-Za-z_]\w*)(\()?/.exec(l) && l)
    .filter((l): l is string => !!l)
    .map((l) => {
      const m = /^\s*#define\s+([A-Za-z_]\w*)(\()?/.exec(l)!;
      return { name: m[1], fn: !!m[2], deprecated: /DEPRECATED/.test(l) };
    });
}

function resolveCells(name: string, table: MacroTable): number[] | undefined {
  try {
    const tokens = expand([{ kind: "ident", text: name, line: 0, space: true }], table);
    return splitCells(tokens).map((c) => toCell(evaluate(c)));
  } catch {
    return undefined;
  }
}

const keycodes: [string, number][] = [];
const deprecatedKeycodes: [string, number][] = [];
for (const d of definedNames(read("keys.h"))) {
  if (d.fn) continue;
  const cells = resolveCells(d.name, macros);
  if (!cells || cells.length !== 1) continue;
  (d.deprecated ? deprecatedKeycodes : keycodes).push([d.name, cells[0]]);
}

const constants: Record<string, [string, number[]][]> = {};
const functionMacros: string[] = [prelude.trim()];
for (const header of PARAM_HEADERS) {
  constants[header] = [];
  for (const d of definedNames(read(header))) {
    // DECODE helpers are C-only; RGB_COLOR_HSB/HSV are spelled out below.
    if (d.name.endsWith("_DECODE") || /^RGB_COLOR_HS[BV]$/.test(d.name)) continue;
    if (d.fn) {
      const m = macros.get(d.name)!;
      functionMacros.push(
        `#define ${m.name}(${m.params!.join(", ")}) ${m.body.map((t) => t.text).join(" ")}`
      );
      continue;
    }
    const cells = resolveCells(d.name, macros);
    if (cells) constants[header].push([d.name, cells]);
  }
}

// ZMK_HID_USAGE is handy for hand-written keymaps.
functionMacros.push("#define ZMK_HID_USAGE(page, id) ((page << 16) | id)");
// RGB_COLOR_HSB uses token pasting in an unusual way; spell it out.
functionMacros.push(
  "#define RGB_COLOR_HSB(h, s, v) 14 RGB_COLOR_HSB_VAL(h, s, v)",
  "#define RGB_COLOR_HSV(h, s, v) 14 RGB_COLOR_HSB_VAL(h, s, v)"
);

const out = {
  source: `zmkfirmware/zmk@${sha} app/include/dt-bindings/zmk`,
  keycodes,
  deprecatedKeycodes,
  constants,
  functionMacros,
};

writeFileSync(
  new URL("../src/keymap-io/zmk-defines.json", import.meta.url),
  JSON.stringify(out, null, 1) + "\n"
);
console.log(
  `${keycodes.length} keycodes, ${deprecatedKeycodes.length} deprecated, ` +
    Object.entries(constants).map(([h, c]) => `${h}: ${c.length}`).join(", ")
);
