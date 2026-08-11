import { describe, expect, it } from 'vitest';
import { type DriveTreeNode, type ItemDTO, sortDriveNodes, sortItems } from '../src/dto.js';

function driveNode(id: string, modifiedTime: number | null, isFolder = false): DriveTreeNode {
  return {
    id,
    name: id,
    mime_type: isFolder ? 'application/vnd.google-apps.folder' : 'text/plain',
    is_folder: isFolder,
    modified_time: modifiedTime,
    children: isFolder ? [] : null,
  };
}

describe('sortDriveNodes', () => {
  it('sorts files and folders from newest to oldest', () => {
    const nodes = [
      driveNode('old-folder', 100, true),
      driveNode('new-file', 300),
      driveNode('middle-file', 200),
    ];

    expect(sortDriveNodes(nodes).map((node) => node.id)).toEqual([
      'new-file',
      'middle-file',
      'old-folder',
    ]);
  });

  it('puts nodes without a modified time last', () => {
    const nodes = [driveNode('unknown', null), driveNode('dated', 100)];

    expect(sortDriveNodes(nodes).map((node) => node.id)).toEqual(['dated', 'unknown']);
  });

  it('uses folder and name tie-breakers without mutating the input', () => {
    const nodes = [
      driveNode('z-file', 100),
      driveNode('b-folder', 100, true),
      driveNode('a-folder', 100, true),
    ];

    expect(sortDriveNodes(nodes).map((node) => node.id)).toEqual([
      'a-folder',
      'b-folder',
      'z-file',
    ]);
    expect(nodes.map((node) => node.id)).toEqual(['z-file', 'b-folder', 'a-folder']);
  });

  it('sorts alphabetically with folders first and natural numeric ordering', () => {
    const nodes = [
      driveNode('Sprint 10', 300),
      driveNode('Sprint 2', 100),
      driveNode('Archive', 50, true),
    ];

    expect(sortDriveNodes(nodes, 'alphabetical').map((node) => node.id)).toEqual([
      'Archive',
      'Sprint 2',
      'Sprint 10',
    ]);
  });
});

function item(id: string, title: string, updatedAt: number): ItemDTO {
  return {
    id,
    workspace_id: 'workspace',
    type: 'page',
    title,
    parent_id: null,
    drive_file_id: null,
    rank: id,
    is_favorite: false,
    is_archived: false,
    archived_at: null,
    body: null,
    visibility: 'workspace',
    owner_id: null,
    created_at: updatedAt,
    updated_at: updatedAt,
    tag_ids: [],
  };
}

describe('sortItems', () => {
  const items = [
    item('old', 'Sprint 10', 100),
    item('new', 'Sprint 2', 300),
    item('middle', 'Alpha', 200),
  ];

  it('sorts native items by modified date from newest to oldest by default', () => {
    expect(sortItems(items).map((entry) => entry.id)).toEqual(['new', 'middle', 'old']);
  });

  it('sorts native items alphabetically with natural numeric ordering', () => {
    expect(sortItems(items, 'alphabetical').map((entry) => entry.id)).toEqual([
      'middle',
      'new',
      'old',
    ]);
  });

  it('does not mutate native item input', () => {
    sortItems(items);
    expect(items.map((entry) => entry.id)).toEqual(['old', 'new', 'middle']);
  });
});
