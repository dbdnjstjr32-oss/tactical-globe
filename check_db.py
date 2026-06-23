import sqlite3
from datetime import datetime, timedelta, timezone

def check():
    c = sqlite3.connect('data/osint_matrix.db')
    t24 = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    rows = c.execute("SELECT id, lat, lng, created_at FROM incidents WHERE (channel='GEOPOLITICS' OR channel='TELEGRAM') AND created_at >= ?", (t24,)).fetchall()
    print(f"Total recent GEOPOLITICS/TELEGRAM (last 24h): {len(rows)}")
    valid = [r for r in rows if r[1] and r[2] and r[1]!=0 and r[2]!=0]
    print(f"Valid coords (lat!=0 & lng!=0): {len(valid)}")
    
    rows_all = c.execute("SELECT id, lat, lng FROM incidents WHERE channel='GEOPOLITICS' OR channel='TELEGRAM'").fetchall()
    valid_all = [r for r in rows_all if r[1] and r[2] and r[1]!=0 and r[2]!=0]
    print(f"Total ALL TIME GEOPOLITICS/TELEGRAM: {len(rows_all)}")
    print(f"Valid coords ALL TIME: {len(valid_all)}")

check()
