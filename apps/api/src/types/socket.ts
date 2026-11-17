import type { Server } from 'socket.io';
import type { JwtPayload } from './jwt.js';

export type PresenceChange = {
  incidentId: string;
  userId: string;
  status: 'online' | 'offline';
};

export type JoinAck = { ok: true; present: string[] } | { ok: false; error: string };

export interface ServerToClientEvents {
  'incident:updated': (payload: unknown) => void;
  'presence:changed': (change: PresenceChange) => void;
}

export interface ClientToServerEvents {
  'incident:join': (incidentId: string, ack?: (res: JoinAck) => void) => void;
  'incident:leave': (incidentId: string) => void;
  'presence:heartbeat': (incidentId: string) => void;
}

// Populated once, by the handshake middleware — see plugins/socket.ts.
export interface SocketData {
  user: JwtPayload;
}

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
