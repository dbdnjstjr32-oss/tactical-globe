"""Migration: add Bayesian spatial-trust columns.

users table:
  - trust_score                FLOAT   DEFAULT 0.5  (P(reliable) prior, 0.0–1.0)
  - successful_verifications   INT     DEFAULT 0    (count of confirmed reports)

posts table:
  - spatial_distance_km        FLOAT   DEFAULT NULL (Haversine dist to epicenter)
  - is_verified                BOOLEAN DEFAULT 0    (passed trust+proximity check)

Idempotent — safe to re-run. Existing columns are skipped, not overwritten.

Run manually:  python migration_trust.py
"""

import sqlite3
from db_utils import get_db_connection

MIGRATIONS = [
    ("users", "trust_score",              "FLOAT DEFAULT 0.5"),
    ("users", "successful_verifications", "INT DEFAULT 0"),
    ("posts", "spatial_distance_km",      "FLOAT DEFAULT NULL"),
    ("posts", "is_verified",              "BOOLEAN DEFAULT 0"),
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
    print("[DONE] trust migration complete.")


if __name__ == "__main__":
    run()
