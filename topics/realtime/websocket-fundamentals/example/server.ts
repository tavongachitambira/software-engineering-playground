// Standalone Socket.io server for the topic exercise: JWT handshake + room-per-incident.
// Memory-only on purpose. Redis adapter + presence live in apps/api/src/plugins/socket.ts.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { Server } from 'socket.io';
import { SignJWT, jwtVerify, generateKeyPair } from 'jose';

const PORT = Number(process.env.PORT ?? 4200);
const ALG = 'RS256';
const { publicKey, privateKey } = await generateKeyPair(ALG); // fresh keys every boot: dev only

const page = readFileSync(new URL('./client-test.html', import.meta.url));

// Plain HTTP side. Socket.io attaches to this same server and handles /socket.io/ itself.
const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname === '/dev-token') {
    // Stand-in for the real login route in apps/api. Short expiry so the demo shows the cap.
    const jwt = await new SignJWT({ role: 'Responder' })
      .setProtectedHeader({ alg: ALG })
      .setSubject(url.searchParams.get('user') ?? 'anonymous')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);
    res.setHeader('content-type', 'application/json').end(JSON.stringify({ token: jwt }));
    return;
  }
  if (url.pathname === '/') return void res.setHeader('content-type', 'text/html').end(page);
  res.statusCode = 404;
  res.end();
});

const io = new Server(http);

// Runs once per connection attempt, before 'connection' fires. A rejected
// handshake never becomes a socket, so no handler below can see it.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string') return next(new Error('unauthorized'));
  try {
    const { payload } = await jwtVerify(token, publicKey, { algorithms: [ALG] });
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('unauthorized')); // same message for every failure: don't tell attackers why
  }
});

const room = (incidentId: string) => `incident:${incidentId}`;

io.on('connection', (socket) => {
  const userId = socket.data.user.sub as string;
  console.log(`+ ${userId} connected (${socket.id})`);

  socket.on('incident:join', (incidentId: string, ack?: (r: unknown) => void) => {
    socket.join(room(incidentId));
    ack?.({ ok: true });
  });
  socket.on('incident:leave', (incidentId: string) => socket.leave(room(incidentId)));

  // Client-initiated update. Rebroadcast to the room; sender is included, by design.
  socket.on('incident:update', (incidentId: string, patch: unknown) => {
    // Handshake proved WHO this is, not that they may touch this incident. Real code checks that here.
    io.to(room(incidentId)).emit('incident:updated', { incidentId, patch, by: userId });
  });

  socket.on('disconnect', (reason) => console.log(`- ${userId} gone: ${reason}`));
});

http.listen(PORT, () => console.log(`open http://localhost:${PORT} in two tabs`));
