import { getPresentUsers, heartbeat, leave, sweepExpired } from '../../lib/presence/store.js';
import type { AppServer } from '../../types/socket.js';

const ROOM_PREFIX = 'incident:';
const MAX_ID_LENGTH = 128;
const SWEEP_INTERVAL_MS = 5_000; // TTL is 45s, so offline is announced within ~50s

const roomFor = (incidentId: string) => `${ROOM_PREFIX}${incidentId}`;

// Everything after the handshake is client-controlled input; the JWT only
// proves WHO is connected, not that these arguments are sane.
const isValidId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;

export function registerIncidentSocket(io: AppServer, onError: (err: unknown) => void) {
  io.on('connection', (socket) => {
    const userId = socket.data.user.sub;

    socket.on('incident:join', async (incidentId, ack) => {
      if (!isValidId(incidentId)) return ack?.({ ok: false, error: 'invalid incidentId' });
      try {
        await socket.join(roomFor(incidentId));
        const cameOnline = await heartbeat(incidentId, userId);
        if (cameOnline) {
          io.to(roomFor(incidentId)).emit('presence:changed', { incidentId, userId, status: 'online' });
        }
        ack?.({ ok: true, present: await getPresentUsers(incidentId) });
      } catch (err) {
        onError(err);
        ack?.({ ok: false, error: 'internal error' });
      }
    });

    // Explicit leave is a clean signal, so it can skip the TTL wait.
    socket.on('incident:leave', async (incidentId) => {
      if (!isValidId(incidentId)) return;
      try {
        await socket.leave(roomFor(incidentId));
        await leave(incidentId, userId);
        io.to(roomFor(incidentId)).emit('presence:changed', { incidentId, userId, status: 'offline' });
      } catch (err) {
        onError(err);
      }
    });

    socket.on('presence:heartbeat', async (incidentId) => {
      // Ignore heartbeats for rooms this socket never joined.
      if (!isValidId(incidentId) || !socket.rooms.has(roomFor(incidentId))) return;
      try {
        if (await heartbeat(incidentId, userId)) {
          // TTL had lapsed while the socket stayed open (long pause, throttled tab).
          io.to(roomFor(incidentId)).emit('presence:changed', { incidentId, userId, status: 'online' });
        }
      } catch (err) {
        onError(err);
      }
    });

    // Deliberately NO presence cleanup on 'disconnect'. A dropped network or
    // closed lid may never deliver a clean disconnect, so the TTL is the only
    // offline signal we trust; the sweeper below announces it.
  });
}

// Announces TTL expiries. Walks only rooms that have local sockets on this
// instance; sweepExpired() makes the announcement exactly-once cluster-wide.
export function startPresenceSweeper(io: AppServer, onError: (err: unknown) => void) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // don't stack sweeps if Redis is slow
    running = true;
    try {
      const rooms = [...io.of('/').adapter.rooms.keys()].filter((r) => r.startsWith(ROOM_PREFIX));
      for (const room of rooms) {
        const incidentId = room.slice(ROOM_PREFIX.length);
        for (const userId of await sweepExpired(incidentId)) {
          io.to(room).emit('presence:changed', { incidentId, userId, status: 'offline' });
        }
      }
    } catch (err) {
      onError(err);
    } finally {
      running = false;
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

// What the rest of the API calls when an incident changes.
export function emitIncidentUpdated(io: AppServer, incidentId: string, payload: unknown) {
  io.to(roomFor(incidentId)).emit('incident:updated', payload);
}

export async function countRoomMembers(io: AppServer, incidentId: string): Promise<number> {
  // fetchSockets() goes through the adapter, so this counts across instances.
  return (await io.in(roomFor(incidentId)).fetchSockets()).length;
}
