"""Migration: add kinematic sensor columns to the incidents table.

Adds:
  - kinematic_score    FLOAT DEFAULT NULL   (normalized 0.0–1.0 vector deviation)
  - sensor_raw_vector  JSON  DEFAULT NULL   (raw [lat,lng,alt,vel,heading,ts])

Idempotent — safe to re-run. Existing columns are skipped, not overwritten.

Run manually:  python migration_kinematic.py
"""

import sqlite3
from db_utils import get_db_connection

COLUMNS = [
    ("kinematic_score",   "FLOAT DEFAULT NULL"),
    ("sensor_raw_vector", "JSON DEFAULT NULL"),
]


def run():
    with get_db_connection() as conn:
        for name, ddl in COLUMNS:
            try:
                conn.execute(f"ALTER TABLE incidents ADD COLUMN {name} {ddl}")
                print(f"[OK]   added incidents.{name}")
            except sqlite3.OperationalError as e:
                print(f"[SKIP] incidents.{name}: {e}")
        conn.commit()
    print("[DONE] kinematic migration complete.")


if __name__ == "__main__":
    run()
