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
  | {
      kind: 'text';
      value: string;
      phrase: boolean;
    }
  | {
      kind: 'tag';
      name: string;
    }
  | {
      kind: 'mime';
      value: string;
    }
  | {
      kind: 'modified';
      op: CmpOp;
      value: ModifiedValue;
    }
  | {
      kind: 'is';
      flag: 'favorite' | 'archived' | 'page' | 'file';
    }
  | {
      kind: 'in';
      value: string;
    };
export type ModifiedValue =
  | {
      kind: 'relative_days';
      days: number;
    }
  | {
      kind: 'date';
      iso: string;
    };
export type Ast =
  | {
      kind: 'term';
      term: Term;
    }
  | {
      kind: 'not';
      inner: Ast;
    }
  | {
      kind: 'and';
      left: Ast;
      right: Ast;
    }
  | {
      kind: 'or';
      left: Ast;
      right: Ast;
    }
  | {
      kind: 'empty';
    };
export declare class QueryParseError extends Error {}
export declare function parseQuery(input: string): Ast;
/** Walk the AST, calling visitor for each terminal `term`. */
export declare function collectTerms(ast: Ast, out?: Term[]): Term[];
/** Resolve relative `Nd` values to absolute epoch-ms boundaries at call time. */
export declare function resolveModifiedToEpochMs(v: ModifiedValue, now?: number): number;
