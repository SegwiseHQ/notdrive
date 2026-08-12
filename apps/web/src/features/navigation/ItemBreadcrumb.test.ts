import type { ItemPathDTO } from '@notdrive/shared';
import { describe, expect, it } from 'vitest';
import { buildItemBreadcrumb, collapseItemBreadcrumb } from './ItemBreadcrumb.js';

describe('buildItemBreadcrumb', () => {
  it('builds a root-to-current path for nested pages', () => {
    const path: ItemPathDTO = {
      complete: true,
      ancestors: [
        { id: 'parent-1', title: 'Projects' },
        { id: 'parent-2', title: 'Launch' },
      ],
    };

    expect(buildItemBreadcrumb(path, { id: 'current', title: 'Brief' })).toEqual([
      { kind: 'root', label: 'All pages' },
      { kind: 'item', id: 'parent-1', label: 'Projects', current: false },
      { kind: 'item', id: 'parent-2', label: 'Launch', current: false },
      { kind: 'item', id: 'current', label: 'Brief', current: true },
    ]);
  });

  it('shows an incomplete-path marker and readable untitled labels', () => {
    expect(
      buildItemBreadcrumb(
        { complete: false, ancestors: [{ id: 'known-parent', title: '   ' }] },
        { id: 'current', title: '' },
      ),
    ).toEqual([
      { kind: 'root', label: 'All pages' },
      { kind: 'gap', label: '…' },
      { kind: 'item', id: 'known-parent', label: 'Untitled', current: false },
      { kind: 'item', id: 'current', label: 'Untitled', current: true },
    ]);
  });

  it('shows a temporary gap until the path has loaded', () => {
    expect(buildItemBreadcrumb(undefined, { id: 'current', title: 'Brief' })).toEqual([
      { kind: 'root', label: 'All pages' },
      { kind: 'gap', label: '…' },
      { kind: 'item', id: 'current', label: 'Brief', current: true },
    ]);
  });

  it('collapses the middle of a deep path while keeping every hidden parent accessible', () => {
    const ancestors = Array.from({ length: 8 }, (_, index) => ({
      id: `parent-${index + 1}`,
      title: `Parent ${index + 1}`,
    }));

    const entries = collapseItemBreadcrumb(
      buildItemBreadcrumb({ complete: true, ancestors }, { id: 'current', title: 'Current' }),
    );

    expect(entries).toEqual([
      { kind: 'root', label: 'All pages' },
      { kind: 'item', id: 'parent-1', label: 'Parent 1', current: false },
      {
        kind: 'collapsed',
        entries: ancestors.slice(1, -2).map((ancestor) => ({
          kind: 'item',
          id: ancestor.id,
          label: ancestor.title,
          current: false,
        })),
      },
      { kind: 'item', id: 'parent-7', label: 'Parent 7', current: false },
      { kind: 'item', id: 'parent-8', label: 'Parent 8', current: false },
      { kind: 'item', id: 'current', label: 'Current', current: true },
    ]);
  });
});
