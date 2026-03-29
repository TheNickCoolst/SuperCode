import { db } from './db.js';

export interface Memory {
  id: number;
  content: string;
  created_at: string;
}

/**
 * Saves a new fact/memory to the database.
 */
export function saveMemory(content: string): number {
  const stmt = db.prepare('INSERT INTO memories (content) VALUES (?)');
  const info = stmt.run(content);
  return info.lastInsertRowid as number;
}

/**
 * Searches the memories using FTS5 for the most relevant facts.
 */
export function searchMemory(query: string, limit = 5): Memory[] {
  try {
    // FTS5 MATCH query ordered by relevance (bm25)
    // We append '*' to each word in the query for prefix matching if needed
    const ftsQuery = query.split(/\\s+/).map(word => `"${word}"*`).join(' OR ');

    const stmt = db.prepare(`
      SELECT m.id, m.content, m.created_at
      FROM memories m
      JOIN memories_fts fts ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
      ORDER BY bm25(memories_fts)
      LIMIT ?
    `);

    return stmt.all(ftsQuery, limit) as Memory[];
  } catch (error) {
    if (error instanceof Error && error.message.includes('syntax error')) {
      // Fallback simple search if the FTS query was syntactically invalid
      const fallbackStmt = db.prepare(`
        SELECT id, content, created_at FROM memories
        WHERE content LIKE ?
        LIMIT ?
      `);
      return fallbackStmt.all(`%${query}%`, limit) as Memory[];
    }
    throw error;
  }
}

/**
 * Lists the most recent memories.
 */
export function getRecentMemories(limit = 10): Memory[] {
  const stmt = db.prepare('SELECT id, content, created_at FROM memories ORDER BY created_at DESC LIMIT ?');
  return stmt.all(limit) as Memory[];
}
