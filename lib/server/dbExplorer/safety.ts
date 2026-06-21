/**
 * Classifies SQL statements for destructiveness detection.
 * Returns whether a statement would be destructive and the reason.
 */
export function classifySql(sql: string): { destructive: boolean; reason: string | null } {
  // Normalize: trim and collapse whitespace
  const normalized = sql.trim().replace(/\s+/g, ' ');

  // Check for DROP/TRUNCATE - always destructive
  if (/\b(drop|truncate)\b/i.test(normalized)) {
    return { destructive: true, reason: 'DROP/TRUNCATE' };
  }

  // Check for DELETE/UPDATE without WHERE - destructive
  if (/\b(delete|update)\b/i.test(normalized) && !/\bwhere\b/i.test(normalized)) {
    return { destructive: true, reason: "WHERE'siz DELETE/UPDATE" };
  }

  return { destructive: false, reason: null };
}

/**
 * Determines if a SQL statement is a write operation (non-read).
 * Returns false for read-only statements (SELECT, SHOW, EXPLAIN, WITH, DESCRIBE, DESC).
 * Returns true for all other statements.
 */
export function isWriteSql(sql: string): boolean {
  // Normalize: trim leading whitespace and collapse inner whitespace
  const normalized = sql.trim().replace(/\s+/g, ' ').toLowerCase();

  // Extract the first meaningful keyword (skip leading parentheses)
  const match = normalized.match(/^\s*(\(*)(\w+)/);
  if (!match) {
    return true; // Default to write if we can't determine
  }

  const firstKeyword = match[2];

  // Read-only keywords
  const readOnlyKeywords = ['select', 'show', 'explain', 'with', 'desc', 'describe'];

  if (readOnlyKeywords.includes(firstKeyword)) {
    return false;
  }

  return true;
}
