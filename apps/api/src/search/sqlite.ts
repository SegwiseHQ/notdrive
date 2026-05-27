import type Database from 'better-sqlite3';

/**
 * Create FTS5 virtual table + triggers that mirror items.title and
 * drive_file_cache.name / mime_type and tag names.
 * Idempotent: safe to call on every migrate.
 */
export function applySqliteSearch(db: Database.Database) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      item_id UNINDEXED,
      workspace_id UNINDEXED,
      title,
      drive_name,
      drive_mime,
      tag_names,
      tokenize = 'porter unicode61'
    );

    -- rebuild helper: re-populate from current rows
    INSERT INTO items_fts(items_fts) VALUES('rebuild');

    CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(item_id, workspace_id, title, drive_name, drive_mime, tag_names)
      VALUES (new.id, new.workspace_id, new.title, '', '', '');
    END;

    CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
      DELETE FROM items_fts WHERE item_id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE OF title ON items BEGIN
      UPDATE items_fts SET title = new.title WHERE item_id = new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS drive_cache_au AFTER UPDATE ON drive_file_cache BEGIN
      UPDATE items_fts
      SET drive_name = new.name, drive_mime = new.mime_type
      WHERE item_id IN (
        SELECT id FROM items
        WHERE workspace_id = new.workspace_id AND drive_file_id = new.drive_file_id
      );
    END;

    CREATE TRIGGER IF NOT EXISTS drive_cache_ai AFTER INSERT ON drive_file_cache BEGIN
      UPDATE items_fts
      SET drive_name = new.name, drive_mime = new.mime_type
      WHERE item_id IN (
        SELECT id FROM items
        WHERE workspace_id = new.workspace_id AND drive_file_id = new.drive_file_id
      );
    END;
  `);
}
