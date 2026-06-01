"""Shared SQLite connection utility for all Tactical Globe workers.

Centralizes the WAL/busy_timeout/synchronous PRAGMA configuration so that
worker_ingest.py, worker_analyzer.py (and future worker_adsb.py /
worker_fusion.py) all open the database with identical, lock-safe settings.
"""

import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "osint_matrix.db")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=15000")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn
