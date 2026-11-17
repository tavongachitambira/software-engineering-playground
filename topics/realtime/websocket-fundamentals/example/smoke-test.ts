// Automates the handshake + room-isolation checks from the test plan against a running server.ts.
// Run: pnpm --filter @topics/websocket-fundamentals dev   (one terminal)
//      pnpm --filter @topics/websocket-fundamentals test  (another)
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';

const BASE = process.env.BASE ?? 'http://localhost:4200';
const tokenFor = async (user: string) =>
  ((await (await fetch(`${BASE}/dev-token?user=${user}`)).json()) as { token: string }).token;

const connect = (token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = io(BASE, { auth: token === undefined ? {} : { token }, reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => (s.close(), reject(e)));
  });

const nextEvent = (s: Socket, ev: string, ms = 500) =>
  new Promise<unknown>((resolve) => {
    const t = setTimeout(() => resolve(null), ms); // null = nothing arrived
    s.once(ev, (p) => (clearTimeout(t), resolve(p)));
  });

// 1. Two valid handshakes
const alice = await connect(await tokenFor('alice'));
const bob = await connect(await tokenFor('bob'));
const carol = await connect(await tokenFor('carol')); // never joins a room
console.log('ok  valid handshakes accepted');

// 2. No token / tampered token are rejected at the handshake
await assert.rejects(connect(), { message: 'unauthorized' });
const good = await tokenFor('mallory');
await assert.rejects(connect(good.slice(0, -4) + 'AAAA'), { message: 'unauthorized' });
console.log('ok  missing and tampered tokens rejected');

// 3. Only room members receive the update
for (const s of [alice, bob]) await s.emitWithAck('incident:join', 'inc-1');
const [toBob, toCarol] = [nextEvent(bob, 'incident:updated'), nextEvent(carol, 'incident:updated')];
alice.emit('incident:update', 'inc-1', { status: 'mitigated' });
assert.deepEqual(await toBob, { incidentId: 'inc-1', patch: { status: 'mitigated' }, by: 'alice' });
assert.equal(await toCarol, null);
console.log('ok  room members get the update, non-member gets nothing');

// 4. Leaving the room stops delivery
bob.emit('incident:leave', 'inc-1');
await new Promise((r) => setTimeout(r, 100));
const afterLeave = nextEvent(bob, 'incident:updated');
alice.emit('incident:update', 'inc-1', { status: 'resolved' });
assert.equal(await afterLeave, null);
console.log('ok  left room stops receiving');

[alice, bob, carol].forEach((s) => s.close());
