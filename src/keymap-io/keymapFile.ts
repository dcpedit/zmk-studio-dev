// Reads a ZMK .keymap file into layers of bindings, with every macro expanded
// and every cell evaluated to a number.

import { DtNode, cellsProp, parseDevicetree, prop, stringProp, walk } from "./devicetree";
import { KeymapSyntaxError, preprocess } from "./preprocessor";
import { KNOWN_INCLUDES, zmkMacros } from "./zmk";

export interface Issue {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
}

export interface ParsedBinding {
  label: string;
  params: number[];
  // Source text after macro expansion, for messages.
  text: string;
  line: number;
  // Cells that couldn't be evaluated (unknown macro names etc.).
  errors: string[];
}

export interface ParsedLayer {
  nodeName: string;
  displayName?: string;
  bindings: ParsedBinding[];
  line: number;
}

// A behavior defined in the file itself (e.g. a custom hold-tap).
export interface FileBehavior {
  label: string;
  nodeName: string;
  displayName?: string;
  compatible?: string;
  cells?: number;
}

export interface ParsedKeymap {
  layers: ParsedLayer[];
  behaviors: Map<string, FileBehavior>;
  issues: Issue[];
}

export { KeymapSyntaxError };

export function parseKeymapFile(source: string): ParsedKeymap {
  const issues: Issue[] = [];
  const pre = preprocess(source, zmkMacros());

  for (const p of pre.issues) {
    issues.push({ severity: "warning", message: p.message, line: p.line });
  }
  for (const inc of pre.includes) {
    if (!KNOWN_INCLUDES.has(inc)) {
      issues.push({
        severity: "warning",
        message: `Can't read #include <${inc}>; anything it defines will show up as unknown.`,
      });
    }
  }

  const roots = parseDevicetree(pre.tokens);

  const behaviors = new Map<string, FileBehavior>();
  for (const node of walk(roots)) {
    const compatible = stringProp(node, "compatible");
    if (!compatible?.startsWith("zmk,behavior")) continue;
    const cells = cellsProp(node, "#binding-cells")?.[0];
    for (const label of node.labels) {
      behaviors.set(label, {
        label,
        nodeName: node.name,
        displayName: stringProp(node, "display-name"),
        compatible,
        cells: cells?.kind === "num" ? cells.value : undefined,
      });
    }
  }

  const keymapNode = findKeymapNode(roots);
  if (!keymapNode) {
    throw new KeymapSyntaxError('no keymap node (compatible = "zmk,keymap") found', 1);
  }

  const layers: ParsedLayer[] = [];
  for (const child of keymapNode.children) {
    if (!prop(child, "bindings")) continue;
    layers.push({
      nodeName: child.name,
      displayName: stringProp(child, "display-name") ?? stringProp(child, "label"),
      bindings: readBindings(child, issues),
      line: child.line,
    });
  }

  if (layers.length === 0) {
    issues.push({ severity: "error", message: "The keymap node has no layers.", line: keymapNode.line });
  }

  return { layers, behaviors, issues };
}

function findKeymapNode(roots: DtNode[]): DtNode | undefined {
  for (const node of walk(roots)) {
    if (stringProp(node, "compatible") === "zmk,keymap") return node;
  }
  // A config that only overrides the board's keymap: `&keymap { ... };`
  return roots.find((r) => r.refLabel === "keymap");
}

function readBindings(layer: DtNode, issues: Issue[]): ParsedBinding[] {
  const bindings: ParsedBinding[] = [];
  for (const item of cellsProp(layer, "bindings") || []) {
    if (item.kind === "ref") {
      bindings.push({ label: item.label, params: [], text: item.text, line: item.line, errors: [] });
      continue;
    }
    const current = bindings[bindings.length - 1];
    if (!current) {
      issues.push({
        severity: "error",
        message: `Layer "${layer.name}": value '${item.text}' isn't attached to a behavior.`,
        line: item.line,
      });
      continue;
    }
    current.text += ` ${item.text}`;
    if (item.kind === "num") {
      current.params.push(item.value);
    } else {
      current.params.push(0);
      current.errors.push(item.message);
    }
  }
  return bindings;
}
