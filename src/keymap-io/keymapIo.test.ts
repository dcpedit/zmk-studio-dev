import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { evaluate, preprocess, tokenize } from "./preprocessor";
import { KeymapSyntaxError, parseKeymapFile } from "./keymapFile";
import { exportKeymap, makeLayerDefines } from "./exportKeymap";
import { planImport, resolvePlannedBinding } from "./planImport";
import { keycodeName, zmkMacros } from "./zmk";
import type { DeviceBehaviors } from "./deviceBehaviors";

const fixtures = join(__dirname, "__fixtures__");
const fixture = (name: string) => readFileSync(join(fixtures, name), "utf8");

const hid = { name: "Key", hidUsage: { keyboardMax: 0xff, consumerMax: 0xfff } };
const layer = { name: "Layer", layerId: {} };
const nil = { name: "", nil: {} };

// Behavior metadata shaped like what ZMK firmware reports over the Studio RPC.
function fakeBehaviors(): DeviceBehaviors {
  const list: Omit<GetBehaviorDetailsResponse, "id">[] = [
    { displayName: "Key Press", metadata: [{ param1: [hid], param2: [] }] },
    { displayName: "Momentary Layer", metadata: [{ param1: [layer], param2: [] }] },
    { displayName: "Layer-Tap", metadata: [{ param1: [layer], param2: [hid] }] },
    { displayName: "Mod-Tap", metadata: [{ param1: [hid], param2: [hid] }] },
    { displayName: "Toggle Layer", metadata: [{ param1: [layer], param2: [] }] },
    { displayName: "To Layer", metadata: [{ param1: [layer], param2: [] }] },
    { displayName: "Sticky Key", metadata: [{ param1: [hid], param2: [] }] },
    { displayName: "Transparent", metadata: [] },
    { displayName: "None", metadata: [] },
    { displayName: "Caps Word", metadata: [] },
    { displayName: "Reset", metadata: [] },
    { displayName: "Bootloader", metadata: [] },
    {
      displayName: "Bluetooth",
      metadata: [
        {
          param1: [
            { name: "Next", constant: 1 },
            { name: "Prev", constant: 2 },
            { name: "Clear", constant: 0 },
            { name: "Clear All", constant: 4 },
          ],
          param2: [nil],
        },
        {
          param1: [
            { name: "Select", constant: 3 },
            { name: "Disconnect", constant: 5 },
          ],
          param2: [{ name: "Profile", range: { min: 0, max: 4 } }],
        },
      ],
    },
    {
      displayName: "Underglow",
      metadata: [{ param1: [{ name: "Toggle", constant: 0 }, { name: "On", constant: 1 }], param2: [nil] }],
    },
    { displayName: "Mouse Key Press", metadata: [{ param1: [{ name: "Button", range: { min: 0, max: 31 } }], param2: [] }] },
    { displayName: "Home Row Mod", metadata: [{ param1: [hid], param2: [hid] }] },
  ];
  return Object.fromEntries(list.map((b, i) => [i + 100, { ...b, id: i + 100 }]));
}

const behaviorId = (b: DeviceBehaviors, name: string) =>
  Object.values(b).find((d) => d.displayName === name)!.id;

function emptyKeymap(b: DeviceBehaviors, layerIds: number[], keys: number, available = 2): Keymap {
  const none = behaviorId(b, "None");
  return {
    availableLayers: available,
    maxLayerNameLength: 20,
    layers: layerIds.map((id, i) => ({
      id,
      name: `L${i}`,
      bindings: Array.from({ length: keys }, () => ({ behaviorId: none, param1: 0, param2: 0 })),
    })),
  };
}

// Apply a plan to an in-memory keymap, the way applyImport does over RPC.
function applyInMemory(keymap: Keymap, plan: ReturnType<typeof planImport>): Keymap {
  const next: Keymap = structuredClone(keymap);
  let nextId = Math.max(...next.layers.map((l) => l.id)) + 1;
  for (let i = 0; i < plan.layersToAdd; i++) {
    next.layers.push({ ...structuredClone(next.layers[0]), id: nextId++, name: "" });
    next.availableLayers--;
  }
  for (const r of plan.renames) next.layers[r.layerIndex].name = r.to;
  for (const c of plan.changes) {
    next.layers[c.layerIndex].bindings[c.keyPosition] = resolvePlannedBinding(c.binding, next.layers);
  }
  return next;
}

describe("preprocessor", () => {
  const evalExpr = (src: string) =>
    evaluate(preprocess(src, zmkMacros()).tokens);

  it("expands ZMK keycodes and modifier functions", () => {
    expect(evalExpr("A")).toBe(0x70004);
    expect(evalExpr("LS(N1)")).toBe(0x0207001e);
    expect(evalExpr("EXCL")).toBe(0x0207001e);
    expect(evalExpr("LC(LS(T))") >>> 0).toBe(0x03070017);
    expect(evalExpr("RG(A)") >>> 0).toBe(0x80070004);
  });

  it("expands multi-cell constants", () => {
    const tokens = preprocess("BT_CLR BT_SEL 2", zmkMacros()).tokens.map((t) => t.text);
    expect(tokens).toEqual(["0", "0", "3", "2"]);
  });

  it("handles conditionals, continuations and comments", () => {
    const src = [
      "#define X 1 /* comment */",
      "#ifdef X",
      "#define Y (X + \\",
      "  2)",
      "#else",
      "#define Y 99",
      "#endif",
      "Y // trailing",
    ].join("\n");
    const result = preprocess(src);
    expect(evaluate(result.tokens)).toBe(3);
    // Line numbers survive the continuation.
    expect(result.tokens[0].line).toBe(8);
  });

  it("evaluates C operator precedence", () => {
    expect(evaluate(tokenize("1 + 2 * 3 << 1 | 1"))).toBe(15);
    expect(evaluate(tokenize("(1 ? 4 : 5) - -1"))).toBe(5);
    expect(() => evaluate(tokenize("FOO"))).toThrow(/unknown name 'FOO'/);
  });
});

describe("parseKeymapFile", () => {
  it("parses every stock ZMK shield keymap cleanly", () => {
    const files = readdirSync(fixtures).filter((f) => f.endsWith(".keymap") && f !== "custom.keymap");
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const parsed = parseKeymapFile(fixture(f));
      expect(parsed.layers.length, f).toBeGreaterThan(1);
      const counts = new Set(parsed.layers.map((l) => l.bindings.length));
      expect(counts.size, `${f} layers differ in size`).toBe(1);
      const errors = parsed.layers.flatMap((l) => l.bindings.flatMap((b) => b.errors));
      expect(errors, f).toEqual([]);
      expect(parsed.issues.filter((i) => i.severity === "error"), f).toEqual([]);
    }
  });

  it("reads corne bindings exactly", () => {
    const parsed = parseKeymapFile(fixture("corne.keymap"));
    expect(parsed.layers.map((l) => l.bindings.length)).toEqual([42, 42, 42]);
    const first = parsed.layers[0].bindings.slice(0, 3);
    expect(first.map((b) => [b.label, ...b.params])).toEqual([
      ["kp", 0x7002b],
      ["kp", 0x70014],
      ["kp", 0x7001a],
    ]);
    const bt = parsed.layers[1].bindings.find((b) => b.label === "bt")!;
    expect(bt.params).toHaveLength(2);
  });

  it("handles custom behaviors, macros and odd syntax", () => {
    const parsed = parseKeymapFile(fixture("custom.keymap"));
    expect(parsed.layers.map((l) => l.displayName)).toEqual(["Base", "Nav", "Symbols"]);
    expect(parsed.layers.map((l) => l.bindings.length)).toEqual([8, 8, 8]);

    const base = parsed.layers[0].bindings.map((b) => [b.label, ...b.params]);
    expect(base).toEqual([
      ["kp", 0x70014],
      ["hm", 0x700e3, 0x70004],
      ["mt", 0x700e1, 0x70016],
      ["lt", 1, 0x7002c],
      ["kp", 0x0207001e],
      ["kp", 0x01070006],
      ["kp", 0x07070029],
      ["kp", 0x70069], // F14, from the #else branch
    ]);

    const nav = parsed.layers[1].bindings.map((b) => [b.label, ...b.params]);
    expect(nav).toEqual([
      ["trans"],
      ["none"],
      ["mo", 2],
      ["tog", 0],
      ["bt", 3, 1],
      ["bt", 0, 0],
      ["rgb_ug", 0, 0],
      ["mkp", 1],
    ]);

    const unknown = parsed.layers[2].bindings[1];
    expect(unknown.errors).toEqual(["unknown name 'UNKNOWN_KEY'"]);
    expect(parsed.layers[2].bindings[0].params).toEqual([0x0207001e]);

    expect(parsed.behaviors.get("hm")).toMatchObject({ displayName: "Home Row Mod", cells: 2 });
    expect(parsed.behaviors.get("zed_em_kay")).toMatchObject({ cells: 0 });
    expect(parsed.issues.some((i) => /my-helpers\.h/.test(i.message))).toBe(true);
  });

  it("reports syntax errors with a line number", () => {
    const src = "/ {\n keymap {\n compatible = \"zmk,keymap\";\n base { bindings = <&kp A>\n };\n};\n";
    expect(() => parseKeymapFile(src)).toThrow(KeymapSyntaxError);
    try {
      parseKeymapFile(src);
    } catch (e) {
      expect((e as KeymapSyntaxError).line).toBe(5);
    }
  });

  it("requires a keymap node", () => {
    expect(() => parseKeymapFile("/ { };")).toThrow(/no keymap node/);
  });
});

describe("planImport", () => {
  it("maps behaviors, layer indexes and reports what it can't do", () => {
    const behaviors = fakeBehaviors();
    // Non-sequential ids: layer params must be translated, not copied.
    const keymap = emptyKeymap(behaviors, [7, 3], 8, 2);
    const plan = planImport(parseKeymapFile(fixture("custom.keymap")), keymap, behaviors);

    expect(plan.layersToAdd).toBe(1);
    expect(plan.renames.map((r) => r.to)).toEqual(["Base", "Nav", "Symbols"]);

    const at = (l: number, k: number) =>
      plan.changes.find((c) => c.layerIndex === l && c.keyPosition === k);
    expect(at(0, 1)!.binding.behaviorId).toBe(behaviorId(behaviors, "Home Row Mod"));
    expect(at(0, 3)!.binding.param1).toEqual({ layerIndex: 1 });
    expect(at(1, 0)!.binding.behaviorId).toBe(behaviorId(behaviors, "Transparent"));

    // &none already matches the device, so it's not a change.
    expect(at(1, 1)).toBeUndefined();

    // UNKNOWN_KEY and the macro (not on the device) are skipped.
    expect(at(2, 1)).toBeUndefined();
    expect(at(2, 2)).toBeUndefined();
    expect(plan.skipped).toBe(2);
    const messages = plan.issues.map((i) => i.message).join("\n");
    expect(messages).toMatch(/UNKNOWN_KEY/);
    expect(messages).toMatch(/&zed_em_kay isn't on this keyboard/);

    const applied = applyInMemory(keymap, plan);
    expect(applied.layers[0].bindings[3].param1).toBe(3); // NAV is layer index 1 = id 3
    expect(applied.layers[1].bindings[2].param1).toBe(applied.layers[2].id);
  });

  it("skips layers the keyboard has no room for", () => {
    const behaviors = fakeBehaviors();
    const keymap = emptyKeymap(behaviors, [0], 8, 0);
    const plan = planImport(parseKeymapFile(fixture("custom.keymap")), keymap, behaviors);
    expect(plan.layersToAdd).toBe(0);
    expect(plan.issues.some((i) => /can only hold 1/.test(i.message))).toBe(true);
    // &lt NAV refers to a layer that won't exist.
    expect(plan.issues.some((i) => /refers to layer 1/.test(i.message))).toBe(true);
  });

  it("flags wrong parameter counts", () => {
    const behaviors = fakeBehaviors();
    const keymap = emptyKeymap(behaviors, [0], 2);
    const src = '/ { keymap { compatible = "zmk,keymap"; l { bindings = <&kp &mo 0 0>; }; }; };';
    const plan = planImport(parseKeymapFile(src), keymap, behaviors);
    expect(plan.skipped).toBe(2);
    expect(plan.issues.map((i) => i.message).join("\n")).toMatch(/&kp takes 1 parameter\(s\) but got 0/);
  });
});

describe("exportKeymap", () => {
  it("names keycodes, constants and layers", () => {
    expect(keycodeName(0x0207001e)).toBe("EXCL");
    expect(keycodeName(0x07070029)).toBe("LC(LS(LA(ESC)))");
    expect(makeLayerDefines(["Base", "nav", "A", "", "Base"])).toEqual([
      "BASE",
      "NAV",
      "A_LAYER",
      "LAYER_3",
      "BASE_2",
    ]);
  });

  it("round-trips through import with no changes", () => {
    const behaviors = fakeBehaviors();
    const start = emptyKeymap(behaviors, [12, 4, 9], 8, 0);
    const plan = planImport(parseKeymapFile(fixture("custom.keymap")), start, behaviors);
    const device = applyInMemory(start, plan);

    const { text, warnings } = exportKeymap({ keymap: device, behaviors, deviceName: "Test" });
    expect(text).toContain("&bt BT_SEL 1");
    expect(text).toContain("&bt BT_CLR");
    expect(text).toContain("&rgb_ug RGB_TOG");
    expect(text).toContain("&kp LC(LS(LA(ESC)))");
    expect(text).toContain("&lt NAV SPACE");
    expect(text).toContain("&mo SYMBOLS");
    expect(text).toContain("&home_row_mod LGUI A");
    expect(text).toContain("#include <dt-bindings/zmk/bt.h>");
    expect(warnings.some((w) => /Home Row Mod/.test(w))).toBe(true);

    const reparsed = parseKeymapFile(text);
    expect(reparsed.issues.filter((i) => i.severity !== "info")).toEqual([]);
    const again = planImport(reparsed, device, behaviors);
    expect(again.changes).toEqual([]);
    expect(again.renames).toEqual([]);
    expect(again.skipped).toBe(0);
  });

  it("lays bindings out by physical rows", () => {
    const behaviors = fakeBehaviors();
    const keymap = emptyKeymap(behaviors, [0], 4);
    const layout = {
      name: "test",
      keys: [
        { x: 0, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 },
        { x: 300, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 },
        { x: 0, y: 100, width: 100, height: 100, r: 0, rx: 0, ry: 0 },
        { x: 100, y: 100, width: 100, height: 100, r: 0, rx: 0, ry: 0 },
      ],
    };
    const { text } = exportKeymap({ keymap, behaviors, layout });
    const rows = text.split("\n").filter((l) => l.includes("&none"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/&none {6}&none/); // split gap
    expect(rows[1]).toMatch(/&none {2}&none/);
  });
});
