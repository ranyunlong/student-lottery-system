import { inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';

export async function listAuditActorNames(actorIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(actorIds)];
  if (uniqueIds.length === 0) return new Map();

  const actors = await db.select({ id: user.id, name: user.name })
    .from(user).where(inArray(user.id, uniqueIds));
  return new Map(actors.map((actor) => [actor.id, actor.name]));
}
