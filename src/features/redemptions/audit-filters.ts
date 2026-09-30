const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export function shanghaiAuditDay(value: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const midnight = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== value) return null;
  return { from: new Date(midnight - shanghaiOffsetMs), to: new Date(midnight - shanghaiOffsetMs + dayMs) };
}

export function auditStudentPattern(value: string): string | null {
  const keyword = value.trim();
  return keyword ? `%${keyword.replace(/[!%_]/g, (character) => `!${character}`)}%` : null;
}
