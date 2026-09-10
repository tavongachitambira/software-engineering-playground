import { redis } from '../redis.js';

const TTL_SECONDS = 45; // ~3x a 15s heartbeat interval — absorbs normal
                          // network jitter without flickering offline

function presenceKey(incidentId: string, userId: string) {
  return `presence:${incidentId}:${userId}`;
}
function presenceSetKey(incidentId: string) {
  return `presence-set:${incidentId}`;
}
function channelName(incidentId: string) {
  return `presence-channel:${incidentId}`;
}

export async function heartbeat(incidentId: string, userId: string): Promise<void> {
  const key = presenceKey(incidentId, userId);
  await redis.set(key, Date.now(), 'EX', TTL_SECONDS);
  await redis.sadd(presenceSetKey(incidentId), userId);
  await redis.publish(channelName(incidentId), JSON.stringify({ userId, status: 'online' }));
}

export async function leave(incidentId: string, userId: string): Promise<void> {
  await redis.del(presenceKey(incidentId, userId));
  await redis.srem(presenceSetKey(incidentId), userId);
  await redis.publish(channelName(incidentId), JSON.stringify({ userId, status: 'offline' }));
}

// Lazy cleanup: read the presence Set, check each member's TTL key still
// exists, drop any that don't. Chosen over keyspace-notification-driven
// cleanup for simplicity — tradeoff is the Set can be slightly stale
// between reads, never wrong for longer than one read cycle.
export async function getPresentUsers(incidentId: string): Promise<string[]> {
  const setKey = presenceSetKey(incidentId);
  const members = await redis.smembers(setKey);
  if (members.length === 0) return [];

  const pipeline = redis.pipeline();
  members.forEach((userId) => pipeline.exists(presenceKey(incidentId, userId)));
  const results = await pipeline.exec();

  const present: string[] = [];
  const stale: string[] = [];
  members.forEach((userId, i) => {
    const exists = results?.[i]?.[1] === 1;
    (exists ? present : stale).push(userId);
  });

  if (stale.length > 0) await redis.srem(setKey, ...stale);
  return present;
}

export function getChannelName(incidentId: string): string {
  return channelName(incidentId);
}