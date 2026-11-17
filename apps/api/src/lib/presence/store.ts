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

// Returns true when this heartbeat moved the user from absent -> present
// (SET ... GET hands back the previous value, null if the key had expired
// or never existed). The websocket layer uses that to emit `presence:changed`
// only on a real transition instead of on every 15s heartbeat.
export async function heartbeat(incidentId: string, userId: string): Promise<boolean> {
  const key = presenceKey(incidentId, userId);
  const previous = await redis.set(key, Date.now(), 'EX', TTL_SECONDS, 'GET');
  await redis.sadd(presenceSetKey(incidentId), userId);
  await redis.publish(channelName(incidentId), JSON.stringify({ userId, status: 'online' }));
  return previous === null;
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

// Atomically "SREM the member iff its TTL key is gone". Atomic because a
// heartbeat landing between a separate EXISTS and SREM would otherwise get
// a live user pruned from the Set.
const SWEEP_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return redis.call('SREM', KEYS[2], ARGV[1])
end
return 0
`;

// A key expiring fires no event on its own (that needs keyspace
// notifications), so something has to go looking. Returns only the users THIS
// call removed: with several API instances sweeping the same incident, SREM
// returns 1 for exactly one caller, so each expiry is announced exactly once.
export async function sweepExpired(incidentId: string): Promise<string[]> {
  const setKey = presenceSetKey(incidentId);
  const members = await redis.smembers(setKey);
  if (members.length === 0) return [];

  const pipeline = redis.pipeline();
  members.forEach((userId) =>
    pipeline.eval(SWEEP_LUA, 2, presenceKey(incidentId, userId), setKey, userId),
  );
  const results = await pipeline.exec();
  return members.filter((_, i) => results?.[i]?.[1] === 1);
}

export function getChannelName(incidentId: string): string {
  return channelName(incidentId);
}