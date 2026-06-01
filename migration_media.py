"""Migration: carry RSS-extracted media through the ingest→analyzer pipeline.

raw_feeds:
  - media_url   TEXT DEFAULT NULL  (validated https image URL from RSS item)
  - media_type  TEXT DEFAULT NULL  ("image")

incidents already has media_url / media_type / sns_source — no change there.

Idempotent — safe to re-run.

Run manually:  python migration_media.py
"""

import sqlite3
from db_utils import get_db_connection

MIGRATIONS = [
    ("raw_feeds", "media_url",  "TEXT DEFAULT NULL"),
    ("raw_feeds", "media_type", "TEXT DEFAULT NULL"),
]


def run():
    with get_db_connection() as conn:
        for table, name, ddl in MIGRATIONS:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
                print(f"[OK]   added {table}.{name}")
            except sqlite3.OperationalError as e:
                print(f"[SKIP] {table}.{name}: {e}")
        conn.commit()
    print("[DONE] media migration complete.")


if __name__ == "__main__":
    run()
