// A small C preprocessor, just enough for ZMK .keymap files.
//
// ZMK runs keymaps through the real C preprocessor before parsing them as
// devicetree, so macros like `LS(A)` or `BT_SEL 0` are plain #defines that
// expand to numbers (sometimes to several cells). We mirror that here:
// tokenize, collect #defines, honour simple conditionals, expand macros, and
// evaluate parenthesised integer expressions without using eval().

export type TokenKind = "ident" | "number" | "string" | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  // True when whitespace (or a line break) precedes this token. The
  // devicetree parser uses this to glue `display` `-` `name` back together.
  space: boolean;
}

export interface Macro {
  name: string;
  params?: string[];
  body: Token[];
}

export type MacroTable = Map<string, Macro>;

export interface PreprocessIssue {
  line: number;
  message: string;
}

export interface PreprocessResult {
  tokens: Token[];
  macros: MacroTable;
  includes: string[];
  issues: PreprocessIssue[];
}

export class KeymapSyntaxError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.line = line;
  }
}

const PUNCTUATORS = [
  "<<",
  ">>",
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "##",
];

// Replace comments with whitespace (keeping newlines so line numbers stay
// right) and join backslash-continued lines.
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let pendingNewlines = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"' && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      const newlines = src.slice(i, stop).split("\n").length - 1;
      out += newlines ? "\n".repeat(newlines) : " ";
      i = stop;
    } else if (c === "\\" && n === "\n") {
      // Line continuation: keep a newline at the end of the logical line so
      // later line numbers still match the source.
      out += " ";
      i += 2;
      pendingNewlines++;
    } else {
      if (c === "\n" && pendingNewlines) {
        out += "\n".repeat(pendingNewlines);
        pendingNewlines = 0;
      }
      out += c;
      i++;
    }
  }
  return out + "\n".repeat(pendingNewlines);
}

export function tokenize(src: string, startLine = 1): Token[] {
  const tokens: Token[] = [];
  let line = startLine;
  let space = true;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      line++;
      space = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      space = true;
      i++;
      continue;
    }

    let text: string;
    let kind: TokenKind;
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      text = m[0];
      kind = "ident";
    } else if (/[0-9]/.test(c)) {
      const m = /^(0[xX][0-9a-fA-F]+|[0-9]+)[uUlL]*/.exec(src.slice(i))!;
      text = m[0];
      kind = "number";
    } else if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"' && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      text = src.slice(i, j + 1);
      kind = "string";
    } else {
      text = PUNCTUATORS.find((p) => src.startsWith(p, i)) || c;
      kind = "punct";
    }

    tokens.push({ kind, text, line, space });
    space = false;
    i += text.length;
  }
  return tokens;
}

// Parse the arguments of a function-like macro invocation. `start` points at
// the opening paren. Returns the argument token lists and the index just past
// the closing paren, or undefined if the parens never close.
export function readArgs(
  tokens: Token[],
  start: number
): [Token[][], number] | undefined {
  const args: Token[][] = [[]];
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text === "(") {
      depth++;
      if (depth === 1) continue;
    } else if (t.text === ")") {
      depth--;
      if (depth === 0) {
        return [args.length === 1 && args[0].length === 0 ? [] : args, i + 1];
      }
    } else if (t.text === "," && depth === 1) {
      args.push([]);
      continue;
    }
    args[args.length - 1].push(t);
  }
  return undefined;
}

export function expand(
  tokens: Token[],
  macros: MacroTable,
  disabled: ReadonlySet<string> = new Set()
): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const macro =
      t.kind === "ident" && !disabled.has(t.text)
        ? macros.get(t.text)
        : undefined;

    if (!macro) {
      out.push(t);
      i++;
      continue;
    }

    const inner = new Set(disabled).add(macro.name);
    const relocate = (body: Token[]) =>
      body.map((b, k) => ({ ...b, line: t.line, space: k === 0 ? t.space : b.space }));

    if (macro.params === undefined) {
      out.push(...expand(relocate(macro.body), macros, inner));
      i++;
      continue;
    }

    // Function-like macro: only expands when followed by `(`.
    if (tokens[i + 1]?.text !== "(") {
      out.push(t);
      i++;
      continue;
    }
    const parsed = readArgs(tokens, i + 1);
    if (!parsed) {
      throw new KeymapSyntaxError(`unterminated call to ${macro.name}(`, t.line);
    }
    const [args, next] = parsed;
    const expandedArgs = args.map((a) => expand(a, macros, disabled));
    const substituted: Token[] = [];
    for (const b of macro.body) {
      const p = b.kind === "ident" ? macro.params.indexOf(b.text) : -1;
      if (p >= 0) {
        const arg = expandedArgs[p] || [];
        substituted.push(...arg.map((a, k) => (k === 0 ? { ...a, space: b.space } : a)));
      } else {
        substituted.push(b);
      }
    }
    out.push(...expand(relocate(pasteTokens(substituted)), macros, inner));
    i = next;
  }
  return out;
}

// Minimal `##` support: glue the neighbouring tokens' text together.
function pasteTokens(tokens: Token[]): Token[] {
  if (!tokens.some((t) => t.text === "##")) return tokens;
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].text === "##" && out.length && tokens[i + 1]) {
      const left = out.pop()!;
      const right = tokens[++i];
      const text = left.text + right.text;
      const kind: TokenKind = /^[A-Za-z_]\w*$/.test(text)
        ? "ident"
        : /^[0-9]/.test(text)
          ? "number"
          : left.kind;
      out.push({ ...left, text, kind });
    } else {
      out.push(tokens[i]);
    }
  }
  return out;
}

export function parseDefine(rest: string, line: number): Macro | undefined {
  const m = /^\s*([A-Za-z_]\w*)(\([^)]*\))?(.*)$/.exec(rest);
  if (!m) return undefined;
  const [, name, paramList, body] = m;
  const params = paramList
    ?.slice(1, -1)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return { name, params, body: tokenize(body, line) };
}

export function defineMacros(source: string): MacroTable {
  return preprocess(source).macros;
}

export function preprocess(
  source: string,
  predefined: MacroTable = new Map()
): PreprocessResult {
  const macros: MacroTable = new Map(predefined);
  const issues: PreprocessIssue[] = [];
  const includes: string[] = [];
  const lines = stripComments(source).split("\n");

  // Conditional stack: each entry says whether the current branch is live and
  // whether any earlier branch of the same #if chain was taken.
  const stack: { live: boolean; taken: boolean; parentLive: boolean }[] = [];
  const isLive = () => stack.length === 0 || stack[stack.length - 1].live;

  let body = "";
  let bodyStartLine = 1;
  let firstBodyLine = true;

  lines.forEach((text, idx) => {
    const lineNo = idx + 1;
    const directive = /^\s*#\s*([a-z]+)\b(.*)$/.exec(text);
    const known = directive && DIRECTIVES.has(directive[1]);

    if (!known) {
      if (firstBodyLine) {
        bodyStartLine = lineNo;
        firstBodyLine = false;
      }
      body += (isLive() ? text : "") + "\n";
      return;
    }
    if (firstBodyLine) {
      bodyStartLine = lineNo + 1;
    } else {
      body += "\n";
    }

    const [, name, rest] = directive;
    switch (name) {
      case "if":
      case "ifdef":
      case "ifndef": {
        const parentLive = isLive();
        let cond = false;
        if (parentLive) {
          if (name === "ifdef") cond = macros.has(rest.trim());
          else if (name === "ifndef") cond = !macros.has(rest.trim());
          else cond = evalCondition(rest, macros, lineNo, issues);
        }
        stack.push({ live: parentLive && cond, taken: cond, parentLive });
        break;
      }
      case "elif": {
        const top = stack[stack.length - 1];
        if (!top) {
          issues.push({ line: lineNo, message: "#elif without #if" });
          break;
        }
        const cond =
          top.parentLive && !top.taken && evalCondition(rest, macros, lineNo, issues);
        top.live = cond;
        top.taken = top.taken || cond;
        break;
      }
      case "else": {
        const top = stack[stack.length - 1];
        if (!top) {
          issues.push({ line: lineNo, message: "#else without #if" });
          break;
        }
        top.live = top.parentLive && !top.taken;
        top.taken = true;
        break;
      }
      case "endif":
        if (!stack.pop()) issues.push({ line: lineNo, message: "#endif without #if" });
        break;
      default:
        if (!isLive()) break;
        if (name === "define") {
          const macro = parseDefine(rest, lineNo);
          if (macro) macros.set(macro.name, macro);
          else issues.push({ line: lineNo, message: `could not parse #define${rest}` });
        } else if (name === "undef") {
          macros.delete(rest.trim());
        } else if (name === "include") {
          const m = /[<"]([^>"]+)[>"]/.exec(rest);
          if (m) includes.push(m[1]);
        } else if (name === "error") {
          issues.push({ line: lineNo, message: `#error${rest}` });
        }
    }
  });

  if (stack.length) {
    issues.push({ line: lines.length, message: "missing #endif" });
  }

  const tokens = expand(tokenize(body, bodyStartLine), macros);
  return { tokens, macros, includes, issues };
}

const DIRECTIVES = new Set([
  "define",
  "undef",
  "include",
  "if",
  "ifdef",
  "ifndef",
  "elif",
  "else",
  "endif",
  "pragma",
  "error",
  "warning",
  "line",
]);

function evalCondition(
  expr: string,
  macros: MacroTable,
  line: number,
  issues: PreprocessIssue[]
): boolean {
  // Resolve defined(X) / defined X before macro expansion.
  const resolved = expr.replace(
    /defined\s*(?:\(\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*))/g,
    (_m, a, b) => (macros.has(a || b) ? "1" : "0")
  );
  try {
    const tokens = expand(tokenize(resolved, line), macros).map((t) =>
      // Unknown identifiers evaluate to 0, like in cpp.
      t.kind === "ident" ? { ...t, kind: "number" as const, text: "0" } : t
    );
    return evaluate(tokens) !== 0;
  } catch (e) {
    issues.push({ line, message: `could not evaluate #if${expr}` });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Integer expression evaluation (C semantics, 32-bit).

const BINARY_PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6,
  "!=": 6,
  "<": 7,
  ">": 7,
  "<=": 7,
  ">=": 7,
  "<<": 8,
  ">>": 8,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10,
};

// C casts that show up in ZMK headers; we just drop them.
const CAST_TYPES = new Set([
  "int",
  "int8_t",
  "int16_t",
  "int32_t",
  "uint8_t",
  "uint16_t",
  "uint32_t",
  "unsigned",
  "long",
]);

export function parseNumber(text: string): number {
  const clean = text.replace(/[uUlL]+$/, "");
  if (/^0[xX]/.test(clean)) return parseInt(clean.slice(2), 16);
  if (/^0[0-7]+$/.test(clean)) return parseInt(clean, 8);
  return parseInt(clean, 10);
}

// Evaluate a token list as one integer expression. Throws on anything that
// isn't a plain number expression (e.g. an unknown identifier).
export function evaluate(tokens: Token[]): number {
  let pos = 0;
  const line = tokens[0]?.line ?? 0;

  const peek = () => tokens[pos];
  const fail = (msg: string): never => {
    throw new KeymapSyntaxError(msg, peek()?.line ?? line);
  };

  function primary(): number {
    const t = tokens[pos++];
    if (!t) return fail("unexpected end of expression");
    if (t.kind === "number") return parseNumber(t.text);
    if (t.text === "(") {
      // Skip casts like (int16_t)
      if (tokens[pos]?.kind === "ident" && CAST_TYPES.has(tokens[pos].text)) {
        while (tokens[pos] && tokens[pos].text !== ")") pos++;
        pos++;
        return unary();
      }
      const v = ternary();
      if (tokens[pos]?.text !== ")") fail("expected )");
      pos++;
      return v;
    }
    if (t.kind === "ident") {
      throw new KeymapSyntaxError(`unknown name '${t.text}'`, t.line);
    }
    return fail(`unexpected '${t.text}'`);
  }

  function unary(): number {
    const t = peek();
    if (t && t.kind === "punct") {
      if (t.text === "-") {
        pos++;
        return -unary() | 0;
      }
      if (t.text === "+") {
        pos++;
        return unary();
      }
      if (t.text === "~") {
        pos++;
        return ~unary();
      }
      if (t.text === "!") {
        pos++;
        return unary() ? 0 : 1;
      }
    }
    return primary();
  }

  function binary(minPrec: number): number {
    let left = unary();
    for (;;) {
      const op = peek();
      const prec = op && op.kind === "punct" ? BINARY_PRECEDENCE[op.text] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      pos++;
      const right = binary(prec + 1);
      left = applyBinary(op.text, left, right, op.line);
    }
  }

  function ternary(): number {
    const cond = binary(1);
    if (peek()?.text !== "?") return cond;
    pos++;
    const a = ternary();
    if (peek()?.text !== ":") fail("expected :");
    pos++;
    const b = ternary();
    return cond ? a : b;
  }

  const value = ternary();
  if (pos < tokens.length) fail(`unexpected '${tokens[pos].text}'`);
  return value;
}

function applyBinary(op: string, a: number, b: number, line: number): number {
  switch (op) {
    case "||":
      return a || b ? 1 : 0;
    case "&&":
      return a && b ? 1 : 0;
    case "|":
      return a | b;
    case "^":
      return a ^ b;
    case "&":
      return a & b;
    case "==":
      return a === b ? 1 : 0;
    case "!=":
      return a !== b ? 1 : 0;
    case "<":
      return a < b ? 1 : 0;
    case ">":
      return a > b ? 1 : 0;
    case "<=":
      return a <= b ? 1 : 0;
    case ">=":
      return a >= b ? 1 : 0;
    case "<<":
      return a << b;
    case ">>":
      return a >> b;
    case "+":
      return (a + b) | 0;
    case "-":
      return (a - b) | 0;
    case "*":
      return Math.imul(a, b);
    case "/":
      if (b === 0) throw new KeymapSyntaxError("division by zero", line);
      return (a / b) | 0;
    case "%":
      if (b === 0) throw new KeymapSyntaxError("division by zero", line);
      return a % b | 0;
  }
  throw new KeymapSyntaxError(`unknown operator ${op}`, line);
}

// Devicetree cells are unsigned 32-bit.
export const toCell = (v: number) => v >>> 0;

// Split an expanded token run into devicetree cells. A cell is a number, a
// parenthesised expression, or a unary-prefixed one of those (`-1`).
// Anything else (an unknown identifier, a `&ref`) becomes its own group so the
// caller can report it.
export function splitCells(tokens: Token[]): Token[][] {
  const cells: Token[][] = [];
  let i = 0;
  while (i < tokens.length) {
    const start = i;
    while (["-", "+", "~", "!"].includes(tokens[i]?.text)) i++;
    if (tokens[i]?.text === "(") {
      let depth = 0;
      for (; i < tokens.length; i++) {
        if (tokens[i].text === "(") depth++;
        else if (tokens[i].text === ")" && --depth === 0) break;
      }
      i++;
    } else {
      i++;
    }
    cells.push(tokens.slice(start, i));
  }
  return cells;
}
