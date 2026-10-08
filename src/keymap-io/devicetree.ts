// Parses the preprocessed token stream of a .keymap file as devicetree.
//
// Only what keymaps use is supported: nodes (optionally labelled), `&label`
// overrides, properties with string / cell-list / byte values, and the
// /directives/ that may prefix nodes. Cell expressions are evaluated here.

import {
  evaluate,
  KeymapSyntaxError,
  splitCells,
  toCell,
  Token,
} from "./preprocessor";

export type CellItem =
  | { kind: "ref"; label: string; line: number; text: string }
  | { kind: "num"; value: number; line: number; text: string }
  | { kind: "error"; message: string; line: number; text: string };

export type DtValue =
  | { kind: "string"; value: string }
  | { kind: "cells"; items: CellItem[] }
  | { kind: "bytes" }
  | { kind: "ref"; label: string };

export interface DtProperty {
  name: string;
  values: DtValue[];
  line: number;
}

export interface DtNode {
  name: string;
  labels: string[];
  // Set for top-level `&label { ... }` override blocks.
  refLabel?: string;
  props: DtProperty[];
  children: DtNode[];
  line: number;
}

const NAME_PUNCT = new Set([",", ".", "_", "+", "-", "#", "@", "?"]);

export function parseDevicetree(tokens: Token[]): DtNode[] {
  let pos = 0;
  const roots: DtNode[] = [];

  const peek = (o = 0) => tokens[pos + o];
  const lineHere = () => peek()?.line ?? tokens[tokens.length - 1]?.line ?? 0;
  const fail = (msg: string): never => {
    throw new KeymapSyntaxError(msg, lineHere());
  };
  const expect = (text: string) => {
    if (peek()?.text !== text) {
      fail(`expected '${text}' but found '${peek()?.text ?? "end of file"}'`);
    }
    pos++;
  };

  // Devicetree names may contain characters that C tokenizes separately
  // (`display-name`, `#binding-cells`, `key@1`). Glue adjacent tokens back.
  function readName(): string {
    const first = peek();
    if (!first || (first.kind === "punct" && !NAME_PUNCT.has(first.text))) {
      return fail(`expected a name but found '${first?.text ?? "end of file"}'`);
    }
    let name = first.text;
    pos++;
    while (peek() && !peek().space) {
      const t = peek();
      if (t.kind === "ident" || t.kind === "number" || NAME_PUNCT.has(t.text)) {
        name += t.text;
        pos++;
      } else {
        break;
      }
    }
    return name;
  }

  // `/omit-if-no-ref/`, `/delete-node/`, `/dts-v1/` and friends. Returns the
  // directive name and moves past it, or undefined if this isn't one.
  function skipDirective(): string | undefined {
    if (peek()?.text !== "/") return undefined;
    let j = pos + 1;
    let name = "";
    while (
      tokens[j] &&
      tokens[j].text !== "/" &&
      (j === pos + 1 || !tokens[j].space) &&
      (tokens[j].kind !== "punct" || NAME_PUNCT.has(tokens[j].text))
    ) {
      name += tokens[j].text;
      j++;
    }
    if (!name || tokens[j]?.text !== "/") return undefined;
    pos = j + 1;
    return name;
  }

  function parseCells(): CellItem[] {
    expect("<");
    const start = pos;
    while (peek() && peek().text !== ">") {
      if (peek().text === "(") {
        // Skip a balanced group so `>>` / `>` inside it can't end the list.
        let depth = 0;
        do {
          if (peek().text === "(") depth++;
          else if (peek().text === ")") depth--;
          pos++;
        } while (peek() && depth > 0);
      } else {
        pos++;
      }
    }
    const inner = tokens.slice(start, pos);
    expect(">");

    const items: CellItem[] = [];
    let i = 0;
    while (i < inner.length) {
      const t = inner[i];
      if (t.text === "&") {
        const next = inner[i + 1];
        if (next?.kind === "ident" && !next.space) {
          // Labels can't contain '-' etc., so a plain identifier is enough.
          items.push({ kind: "ref", label: next.text, line: t.line, text: `&${next.text}` });
          i += 2;
          continue;
        }
        items.push({ kind: "error", message: "stray '&'", line: t.line, text: "&" });
        i++;
        continue;
      }
      // Gather everything up to the next & and split it into cells.
      let j = i;
      while (j < inner.length && inner[j].text !== "&") j++;
      for (const cell of splitCells(inner.slice(i, j))) {
        const text = cell.map((c) => c.text).join(cell.length > 1 ? " " : "");
        try {
          items.push({ kind: "num", value: toCell(evaluate(cell)), line: cell[0].line, text });
        } catch (e) {
          const message =
            cell.length === 1 && cell[0].kind === "ident"
              ? `unknown name '${cell[0].text}'`
              : e instanceof Error
                ? e.message.replace(/^Line \d+: /, "")
                : String(e);
          items.push({ kind: "error", message, line: cell[0].line, text });
        }
      }
      i = j;
    }
    return items;
  }

  function parseValue(): DtValue {
    const t = peek();
    if (t?.kind === "string") {
      pos++;
      return { kind: "string", value: t.text.slice(1, -1).replace(/\\(.)/g, "$1") };
    }
    if (t?.text === "<") return { kind: "cells", items: parseCells() };
    if (t?.text === "[") {
      while (peek() && peek().text !== "]") pos++;
      expect("]");
      return { kind: "bytes" };
    }
    if (t?.text === "&") {
      pos++;
      return { kind: "ref", label: readName() };
    }
    return fail(`unexpected '${t?.text ?? "end of file"}' in property value`);
  }

  function parseNodeBody(node: DtNode) {
    expect("{");
    while (peek() && peek().text !== "}") {
      if (peek().text === ";") {
        pos++;
        continue;
      }
      const directive = skipDirective();
      if (directive === "delete-node" || directive === "delete-property") {
        while (peek() && peek().text !== ";") pos++;
        expect(";");
        continue;
      }
      if (directive) continue;

      const line = lineHere();
      const labels: string[] = [];
      let name = readName();
      while (peek()?.text === ":") {
        pos++;
        labels.push(name);
        name = readName();
      }

      if (peek()?.text === "{") {
        const child: DtNode = { name, labels, props: [], children: [], line };
        parseNodeBody(child);
        expect(";");
        node.children.push(child);
      } else {
        const values: DtValue[] = [];
        if (peek()?.text === "=") {
          pos++;
          values.push(parseValue());
          while (peek()?.text === ",") {
            pos++;
            values.push(parseValue());
          }
        }
        expect(";");
        node.props.push({ name, values, line });
      }
    }
    expect("}");
  }

  while (pos < tokens.length) {
    if (peek().text === ";") {
      pos++;
      continue;
    }
    const line = lineHere();
    const directive = skipDirective();
    if (directive) {
      if (peek()?.text === ";") pos++;
      else if (directive !== "omit-if-no-ref") {
        // e.g. /delete-node/ &label;
        while (peek() && peek().text !== ";") pos++;
        pos++;
      }
      continue;
    }

    if (peek().text === "/" && peek(1)?.text === "{") {
      pos++;
      const node: DtNode = { name: "/", labels: [], props: [], children: [], line };
      parseNodeBody(node);
      expect(";");
      roots.push(node);
    } else if (peek().text === "&") {
      pos++;
      const refLabel = readName();
      const node: DtNode = { name: refLabel, labels: [], refLabel, props: [], children: [], line };
      parseNodeBody(node);
      expect(";");
      roots.push(node);
    } else {
      fail(`unexpected '${peek().text}' at top level`);
    }
  }

  return roots;
}

export function* walk(nodes: DtNode[]): Generator<DtNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children);
  }
}

export function prop(node: DtNode, name: string): DtProperty | undefined {
  return node.props.find((p) => p.name === name);
}

export function stringProp(node: DtNode, name: string): string | undefined {
  const v = prop(node, name)?.values[0];
  return v?.kind === "string" ? v.value : undefined;
}

export function cellsProp(node: DtNode, name: string): CellItem[] | undefined {
  const p = prop(node, name);
  if (!p) return undefined;
  return p.values.flatMap((v) => (v.kind === "cells" ? v.items : []));
}
