import os
import sqlite3

def run_migration():
    db_path = os.path.join("data", "osint_matrix.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    conn.execute("PRAGMA foreign_keys=ON")
    cursor = conn.cursor()
    
    print("[MIGRATION] Creating users table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            trust_level TEXT DEFAULT 'GUEST',
            created_at TEXT NOT NULL
        )
    """)
    
    print("[MIGRATION] Creating rooms table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            incident_id TEXT NULL,
            title TEXT NOT NULL,
            region TEXT,
            country TEXT,
            lat REAL,
            lng REAL,
            status TEXT DEFAULT 'ACTIVE',
            created_by TEXT,
            created_at TEXT NOT NULL,
            last_activity TEXT NOT NULL,
            FOREIGN KEY(incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
            FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)
    
    print("[MIGRATION] Creating posts table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            media_url TEXT,
            lat REAL,
            lng REAL,
            trust_score REAL DEFAULT 0.5,
            created_at TEXT NOT NULL,
            FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    
    print("[MIGRATION] Creating indices for performance...")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rooms_incident ON rooms(incident_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_posts_room_created ON posts(room_id, created_at DESC)")
    
    conn.commit()
    conn.close()
    print("[MIGRATION] Database schema migration completed successfully.")

if __name__ == "__main__":
    run_migration()
