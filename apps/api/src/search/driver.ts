import { type Ast, resolveModifiedToEpochMs } from '@notdrive/shared';
import type { ItemDTO } from '@notdrive/shared';

export interface SearchDriver {
  search(workspaceId: string, ast: Ast, limit: number): Promise<ItemDTO[]>;
}

export function ftsTermsFromAst(ast: Ast): string[] {
  // Collect text terms to feed into FTS MATCH/websearch_to_tsquery.
  const out: string[] = [];
  function walk(n: Ast) {
    switch (n.kind) {
      case 'term':
        if (n.term.kind === 'text') out.push(n.term.value);
        break;
      case 'not':
        walk(n.inner);
        break;
      case 'and':
      case 'or':
        walk(n.left);
        walk(n.right);
        break;
      default:
        break;
    }
  }
  walk(ast);
  return out;
}

export { resolveModifiedToEpochMs };
