import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbPath = path.join(process.cwd(), 'data', 'osint_matrix.db');
  const db = new Database(dbPath);

  try {
    const logs = db.prepare(`
      SELECT * FROM watchcon_log 
      ORDER BY timestamp DESC 
      LIMIT 50
    `).all();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Failed to fetch watchcon log:', error);
    return NextResponse.json({ error: 'Failed to fetch watchcon log' }, { status: 500 });
  } finally {
    db.close();
  }
}
