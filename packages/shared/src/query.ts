/**
 * Free-text smart query parser for NotDrive.
 *
 * Examples:
 *   tag:ads AND modified:<7d NOT is:archived "quarterly report"
 *   is:favorite tag:design OR tag:brand mime:pdf
 *
 * Supported keys:
 *   - tag:<name>                    (repeatable; AND unless OR used)
 *   - mime:<substring>              (matches Drive mimeType contains)
 *   - modified:<op><value>          (op: <, >, =; value: Nd or YYYY-MM-DD)
 *   - is:favorite|archived|page|file
 *   - in:<parent title substring>
 * Operators: AND (default), OR, NOT, case-insensitive.
 * Grouping with parentheses.
 * Free terms (bare words or "quoted phrases") match titles + drive name.
 */

export type CmpOp = '<' | '>' | '=';

export type Term =
  | { kind: 'text'; value: string; phrase: boolean }
  | { kind: 'tag'; name: string }
  | { kind: 'mime'; value: string }
  | { kind: 'modified'; op: CmpOp; value: ModifiedValue }
  | { kind: 'is'; flag: 'favorite' | 'archived' | 'page' | 'file' }
  | { kind: 'in'; value: string };

export type ModifiedValue =
  | { kind: 'relative_days'; days: number }
  | { kind: 'date'; iso: string };

export type Ast =
  | { kind: 'term'; term: Term }
  | { kind: 'not'; inner: Ast }
  | { kind: 'and'; left: Ast; right: Ast }
  | { kind: 'or'; left: Ast; right: Ast }
  | { kind: 'empty' };

type Tok =
  | { t: 'LP' }
  | { t: 'RP' }
  | { t: 'AND' }
  | { t: 'OR' }
  | { t: 'NOT' }
  | { t: 'KV'; key: string; raw: string }
  | { t: 'TEXT'; value: string; phrase: boolean };

class Lexer {
  private i = 0;
  constructor(private readonly src: string) {}

  tokens(): Tok[] {
    const out: Tok[] = [];
    while (this.i < this.src.length) {
      const ch = this.src[this.i]!;
      if (ch === ' ' || ch === '\t' || ch === '\n') {
        this.i++;
        continue;
      }
      if (ch === '(') {
        out.push({ t: 'LP' });
        this.i++;
        continue;
      }
      if (ch === ')') {
        out.push({ t: 'RP' });
        this.i++;
        continue;
      }
      if (ch === '"') {
        this.i++;
        let buf = '';
        while (this.i < this.src.length && this.src[this.i] !== '"') {
          buf += this.src[this.i++];
        }
        if (this.src[this.i] === '"') this.i++;
        out.push({ t: 'TEXT', value: buf, phrase: true });
        continue;
      }
      // Word: run of non-space, non-paren.
      let word = '';
      while (this.i < this.src.length) {
        const c = this.src[this.i]!;
        if (c === ' ' || c === '\t' || c === '\n' || c === '(' || c === ')') break;
        word += c;
        this.i++;
      }
      const upper = word.toUpperCase();
      if (upper === 'AND') out.push({ t: 'AND' });
      else if (upper === 'OR') out.push({ t: 'OR' });
      else if (upper === 'NOT' || word === '-') out.push({ t: 'NOT' });
      else {
        const colon = word.indexOf(':');
        if (colon > 0) {
          out.push({
            t: 'KV',
            key: word.slice(0, colon).toLowerCase(),
            raw: word.slice(colon + 1),
          });
        } else {
          out.push({ t: 'TEXT', value: word, phrase: false });
        }
      }
    }
    return out;
  }
}

export class QueryParseError extends Error {}

function parseTerm(tok: Tok): Ast {
  if (tok.t === 'TEXT') {
    return {
      kind: 'term',
      term: { kind: 'text', value: tok.value, phrase: tok.phrase },
    };
  }
  if (tok.t === 'KV') {
    return { kind: 'term', term: parseKv(tok.key, tok.raw) };
  }
  throw new QueryParseError(`unexpected token ${JSON.stringify(tok)}`);
}

function parseKv(key: string, raw: string): Term {
  switch (key) {
    case 'tag':
      return { kind: 'tag', name: raw.toLowerCase() };
    case 'mime':
      return { kind: 'mime', value: raw.toLowerCase() };
    case 'is': {
      const v = raw.toLowerCase();
      if (v === 'favorite' || v === 'archived' || v === 'page' || v === 'file') {
        return { kind: 'is', flag: v };
      }
      throw new QueryParseError(`is: expected favorite|archived|page|file, got ${v}`);
    }
    case 'in':
      return { kind: 'in', value: raw };
    case 'modified': {
      const first = raw[0];
      let op: CmpOp = '=';
      let valueStr = raw;
      if (first === '<' || first === '>' || first === '=') {
        op = first;
        valueStr = raw.slice(1);
      }
      return { kind: 'modified', op, value: parseModifiedValue(valueStr) };
    }
    default:
      throw new QueryParseError(`unknown key: ${key}`);
  }
}

function parseModifiedValue(s: string): ModifiedValue {
  const rel = /^(\d+)d$/.exec(s);
  if (rel) return { kind: 'relative_days', days: Number(rel[1]) };
  const date = /^\d{4}-\d{2}-\d{2}$/.exec(s);
  if (date) return { kind: 'date', iso: s };
  throw new QueryParseError(`modified: expected Nd or YYYY-MM-DD, got ${s}`);
}

// Pratt-style recursive descent: OR binds loosest, then AND, then NOT.
class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private eat(): Tok {
    const tk = this.toks[this.i++];
    if (!tk) throw new QueryParseError('unexpected end of input');
    return tk;
  }

  parse(): Ast {
    if (this.toks.length === 0) return { kind: 'empty' };
    const ast = this.parseOr();
    if (this.i < this.toks.length) {
      throw new QueryParseError(`trailing tokens at position ${this.i}`);
    }
    return ast;
  }

  private parseOr(): Ast {
    let left = this.parseAnd();
    while (this.peek()?.t === 'OR') {
      this.eat();
      const right = this.parseAnd();
      left = { kind: 'or', left, right };
    }
    return left;
  }

  private parseAnd(): Ast {
    let left = this.parseUnary();
    while (true) {
      const nx = this.peek();
      if (!nx) break;
      if (nx.t === 'RP' || nx.t === 'OR') break;
      if (nx.t === 'AND') this.eat();
      const right = this.parseUnary();
      left = { kind: 'and', left, right };
    }
    return left;
  }

  private parseUnary(): Ast {
    const tk = this.peek();
    if (!tk) throw new QueryParseError('unexpected end of input');
    if (tk.t === 'NOT') {
      this.eat();
      return { kind: 'not', inner: this.parseUnary() };
    }
    if (tk.t === 'LP') {
      this.eat();
      const inner = this.parseOr();
      const close = this.eat();
      if (close.t !== 'RP') throw new QueryParseError('missing closing paren');
      return inner;
    }
    this.eat();
    return parseTerm(tk);
  }
}

export function parseQuery(input: string): Ast {
  const toks = new Lexer(input.trim()).tokens();
  return new Parser(toks).parse();
}

/** Walk the AST, calling visitor for each terminal `term`. */
export function collectTerms(ast: Ast, out: Term[] = []): Term[] {
  switch (ast.kind) {
    case 'term':
      out.push(ast.term);
      break;
    case 'not':
      collectTerms(ast.inner, out);
      break;
    case 'and':
    case 'or':
      collectTerms(ast.left, out);
      collectTerms(ast.right, out);
      break;
    case 'empty':
      break;
  }
  return out;
}

/** Resolve relative `Nd` values to absolute epoch-ms boundaries at call time. */
export function resolveModifiedToEpochMs(v: ModifiedValue, now = Date.now()): number {
  if (v.kind === 'relative_days') return now - v.days * 24 * 60 * 60 * 1000;
  return Date.parse(v.iso);
}
