import os
import sqlite3


def run_migration():
    db_path = os.path.join("data", "osint_matrix.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(rooms)")
        columns = [info[1] for info in cursor.fetchall()]

        if "channel" not in columns:
            print("[MIGRATION] Adding channel column to rooms table...")
            cursor.execute("ALTER TABLE rooms ADD COLUMN channel TEXT DEFAULT 'GEOPOLITICS'")
            conn.commit()
            print("[MIGRATION] Successfully added channel column.")
        else:
            print("[MIGRATION] channel column already exists in rooms table.")
    except Exception as e:
        print(f"[MIGRATION] Error: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
