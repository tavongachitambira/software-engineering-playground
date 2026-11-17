import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from '../lib/redis.js';
import { verifyAccessToken } from '../routes/auth/jwt-auth.js';
import { registerIncidentSocket, startPresenceSweeper } from '../routes/incidents/socket.js';
import type { AppServer } from '../types/socket.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: AppServer;
  }
}

const MAX_TIMER_MS = 2 ** 31 - 1; // setTimeout overflows (fires immediately) above this

const socketPlugin: FastifyPluginAsync = async (fastify) => {
  const io: AppServer = new Server(fastify.server, {
    // Socket.io answers its own CORS preflights; Fastify's CORS plugin never sees them.
    cors: { origin: process.env.WEB_ORIGIN?.split(',') ?? false },
  });

  // Redis adapter: without it io.to(room).emit() only reaches sockets held by
  // THIS process. Pub and sub need separate connections (a subscribed client
  // can't issue regular commands).
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Handshake-time auth: verified once, before the connection is accepted.
  // Reuses the REST verifier on purpose — one place defines what a valid token is.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('unauthorized'));
    try {
      socket.data.user = await verifyAccessToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // The cost of checking once: a connection outlives the token that opened it.
  // Cap that window by dropping the socket when the token expires; the client's
  // reconnect re-runs the handshake with a fresh token (see example/client-test.html).
  io.on('connection', (socket) => {
    const msLeft = Math.min(socket.data.user.exp * 1000 - Date.now(), MAX_TIMER_MS);
    const timer = setTimeout(() => socket.disconnect(true), Math.max(msLeft, 0));
    socket.on('disconnect', () => clearTimeout(timer));
  });

  const onError = (err: unknown) => fastify.log.error(err);
  registerIncidentSocket(io, onError);
  const stopSweeper = startPresenceSweeper(io, onError);

  fastify.decorate('io', io);

  fastify.addHook('preClose', async () => {
    stopSweeper();
    io.local.disconnectSockets(true);
  });
  fastify.addHook('onClose', async () => {
    io.close(); // also closes the shared HTTP server; Fastify tolerates the second close
    pubClient.disconnect();
    subClient.disconnect();
  });
};

export default fp(socketPlugin, { name: 'socket', dependencies: [] });
