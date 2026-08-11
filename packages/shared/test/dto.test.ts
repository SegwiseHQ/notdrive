import { describe, expect, it } from 'vitest';
import { type DriveTreeNode, sortDriveNodes } from '../src/dto.js';

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
});
