import { describe, expect, it, vi } from 'vitest';
import {
  ITEM_PATH_MAX_DEPTH,
  type StructuralPathItem,
  resolveItemPath,
} from '../src/services/itemPath.js';

function loader(items: StructuralPathItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return vi.fn(async (id: string) => byId.get(id) ?? null);
}

describe('resolveItemPath', () => {
  it('returns visible ancestors from root to immediate parent', async () => {
    const load = loader([
      { id: 'root', title: 'Root', parent_id: null },
      { id: 'folder', title: 'Folder', parent_id: 'root' },
    ]);

    await expect(resolveItemPath({ id: 'page', parent_id: 'folder' }, load)).resolves.toEqual({
      ancestors: [
        { id: 'root', title: 'Root' },
        { id: 'folder', title: 'Folder' },
      ],
      complete: true,
    });
  });

  it('returns the known suffix without exposing a missing or inaccessible parent', async () => {
    const load = loader([{ id: 'folder', title: 'Folder', parent_id: 'private-root' }]);

    await expect(resolveItemPath({ id: 'page', parent_id: 'folder' }, load)).resolves.toEqual({
      ancestors: [{ id: 'folder', title: 'Folder' }],
      complete: false,
    });
  });

  it('stops cycles and returns each known ancestor once', async () => {
    const load = loader([
      { id: 'a', title: 'A', parent_id: 'b' },
      { id: 'b', title: 'B', parent_id: 'a' },
    ]);

    await expect(resolveItemPath({ id: 'page', parent_id: 'a' }, load)).resolves.toEqual({
      ancestors: [
        { id: 'b', title: 'B' },
        { id: 'a', title: 'A' },
      ],
      complete: false,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not include the open item if a cycle points back to it', async () => {
    const load = loader([{ id: 'folder', title: 'Folder', parent_id: 'page' }]);

    await expect(resolveItemPath({ id: 'page', parent_id: 'folder' }, load)).resolves.toEqual({
      ancestors: [{ id: 'folder', title: 'Folder' }],
      complete: false,
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('caps traversal at 100 known ancestors', async () => {
    const items = Array.from({ length: ITEM_PATH_MAX_DEPTH + 1 }, (_, index) => {
      const number = index + 1;
      return {
        id: `node-${number}`,
        title: `Node ${number}`,
        parent_id: number <= ITEM_PATH_MAX_DEPTH ? `node-${number + 1}` : null,
      };
    });
    const load = loader(items);

    const result = await resolveItemPath({ id: 'page', parent_id: 'node-1' }, load);

    expect(result.complete).toBe(false);
    expect(result.ancestors).toHaveLength(ITEM_PATH_MAX_DEPTH);
    expect(result.ancestors[0]?.id).toBe(`node-${ITEM_PATH_MAX_DEPTH}`);
    expect(result.ancestors.at(-1)?.id).toBe('node-1');
    expect(load).toHaveBeenCalledTimes(ITEM_PATH_MAX_DEPTH);
  });

  it('marks a path complete when the root is the 100th ancestor', async () => {
    const items = Array.from({ length: ITEM_PATH_MAX_DEPTH }, (_, index) => {
      const number = index + 1;
      return {
        id: `node-${number}`,
        title: `Node ${number}`,
        parent_id: number < ITEM_PATH_MAX_DEPTH ? `node-${number + 1}` : null,
      };
    });

    const result = await resolveItemPath({ id: 'page', parent_id: 'node-1' }, loader(items));

    expect(result.complete).toBe(true);
    expect(result.ancestors).toHaveLength(ITEM_PATH_MAX_DEPTH);
    expect(result.ancestors[0]?.id).toBe(`node-${ITEM_PATH_MAX_DEPTH}`);
    expect(result.ancestors.at(-1)?.id).toBe('node-1');
  });
});
