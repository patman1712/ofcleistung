// Lokale String-Union Typen als Ersatz fuer Prisma-Enums (SQLite kann keine Enums)
// Entsprechen exakt den Werten, die im Prisma-Schema als String modelliert sind.

export type Role = 'ADMIN' | 'PLAYER';
export type QuestionType = 'RATING_1_10' | 'TEXT';
export type AlertScope = 'DAILY' | 'TRAINING' | 'ALL';
export type AlertSeverity = 'WARNING' | 'CRITICAL';

export const ROLES: { [K in Role]: K } = {
  ADMIN: 'ADMIN',
  PLAYER: 'PLAYER',
};

export const QUESTION_TYPES: { [K in QuestionType]: K } = {
  RATING_1_10: 'RATING_1_10',
  TEXT: 'TEXT',
};

export function isRole(v: unknown): v is Role {
  return v === 'ADMIN' || v === 'PLAYER';
}

export function isQuestionType(v: unknown): v is QuestionType {
  return v === 'RATING_1_10' || v === 'TEXT';
}

export function asString(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0] ? String(v[0]) : undefined;
  return v === undefined || v === null ? undefined : String(v);
}

export function asInt(v: unknown): number | undefined {
  const s = asString(v);
  if (s === undefined) return undefined;
  const n = parseInt(s, 10);
  return isNaN(n) ? undefined : n;
}
