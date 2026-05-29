import type { Pool } from 'pg';

/**
 * Postgres full-text objects: a tsvector generated column on items.title and
 * a GIN index. Additional fields (tag names, drive names) are joined at query
 * time — simpler than maintaining a materialized view in MVP.
 */
export async function applyPostgresSearch(pool: Pool) {
  await pool.query(`
    -- Title-only column (legacy; kept for any code still referencing it).
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='items' AND column_name='title_tsv'
      ) THEN
        ALTER TABLE items ADD COLUMN title_tsv tsvector
          GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,''))) STORED;
      END IF;
    END$$;

    -- Title + body tsvector. HTML tags stripped from body before tokenizing so
    -- markup doesn't pollute matches. Title is weighted higher than body.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='items' AND column_name='search_tsv'
      ) THEN
        ALTER TABLE items ADD COLUMN search_tsv tsvector
          GENERATED ALWAYS AS (
            setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
            setweight(
              to_tsvector('simple', regexp_replace(coalesce(body, ''), '<[^>]+>', ' ', 'g')),
              'B'
            )
          ) STORED;
      END IF;
    END$$;

    CREATE INDEX IF NOT EXISTS items_title_tsv_gin  ON items USING GIN (title_tsv);
    CREATE INDEX IF NOT EXISTS items_search_tsv_gin ON items USING GIN (search_tsv);

    CREATE INDEX IF NOT EXISTS drive_cache_name_trgm
      ON drive_file_cache USING GIN (name gin_trgm_ops);
  `).catch(async () => {
    // pg_trgm may not be installed; graceful fallback.
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm').catch(() => {});
    await pool.query(`
      CREATE INDEX IF NOT EXISTS drive_cache_name_trgm
        ON drive_file_cache USING GIN (name gin_trgm_ops)
    `).catch(() => {});
  });
}
