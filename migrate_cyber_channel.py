"""One-off: move existing cyber-natured incidents from GEOPOLITICS → CYBER_AI.

Legacy data was ingested while cyber RSS fed the GEOPOLITICS channel. This
reassigns those rows to the dedicated CYBER_AI channel so they show in the
correct tab. Matches by category=CYBERATTACK or cyber keywords in title/summary.

Run:  python migrate_cyber_channel.py            (dry-run, shows count)
      python migrate_cyber_channel.py --apply    (actually update)
"""

import sys
from db_utils import get_db_connection

KEYWORDS = [
    "cyber", "ransomware", "hack", "malware", "breach", "ddos", "zero-day",
    "zero day", "exploit", "phishing", "botnet", "spyware", "vulnerab",
    "data leak", "backdoor", "deepfake", "해킹", "랜섬", "악성코드", "사이버",
    "데이터 유출", "딥페이크",
]


def build_query(select_or_update):
    like_clause = " OR ".join(
        ["lower(title || ' ' || IFNULL(summary,'')) LIKE ?" for _ in KEYWORDS]
    )
    where = f"channel='GEOPOLITICS' AND (category='CYBERATTACK' OR {like_clause})"
    if select_or_update == "select":
        return f"SELECT id, title FROM incidents WHERE {where}", where
    return f"UPDATE incidents SET channel='CYBER_AI' WHERE {where}", where


def run():
    apply = "--apply" in sys.argv
    params = [f"%{k.lower()}%" for k in KEYWORDS]

    with get_db_connection() as conn:
        sel, _ = build_query("select")
        rows = conn.execute(sel, params).fetchall()
        print(f"[MATCH] {len(rows)} cyber incidents currently in GEOPOLITICS:")
        for r in rows[:15]:
            print(f"   - {r[1][:70]}")
        if len(rows) > 15:
            print(f"   ... (+{len(rows) - 15} more)")

        if not apply:
            print("\n[DRY-RUN] no changes made. Re-run with --apply to migrate.")
            return

        upd, _ = build_query("update")
        cur = conn.execute(upd, params)
        conn.commit()
        print(f"\n[DONE] moved {cur.rowcount} incidents → CYBER_AI channel.")


if __name__ == "__main__":
    run()
