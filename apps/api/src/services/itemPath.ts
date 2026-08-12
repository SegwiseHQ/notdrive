import type { ItemPathDTO, ItemPathNodeDTO } from '@notdrive/shared';

export const ITEM_PATH_MAX_DEPTH = 100;

export interface StructuralPathItem extends ItemPathNodeDTO {
  parent_id: string | null;
}

type LoadVisibleItem = (id: string) => Promise<StructuralPathItem | null>;

/**
 * Walk an item's structural parents and return the visible, unique portion of
 * its path. The caller owns workspace and visibility filtering in the loader.
 */
export async function resolveItemPath(
  item: Pick<StructuralPathItem, 'id' | 'parent_id'>,
  loadVisibleItem: LoadVisibleItem,
): Promise<ItemPathDTO> {
  const nearestFirst: ItemPathNodeDTO[] = [];
  const seen = new Set<string>([item.id]);
  let parentId = item.parent_id;

  while (parentId !== null) {
    if (nearestFirst.length >= ITEM_PATH_MAX_DEPTH || seen.has(parentId)) {
      return { ancestors: nearestFirst.reverse(), complete: false };
    }

    seen.add(parentId);
    const parent = await loadVisibleItem(parentId);
    if (!parent || parent.id !== parentId) {
      return { ancestors: nearestFirst.reverse(), complete: false };
    }

    nearestFirst.push({ id: parent.id, title: parent.title });
    parentId = parent.parent_id;
  }

  return { ancestors: nearestFirst.reverse(), complete: true };
}
