import type { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../lib/db.js';
import {
  createDocument,
  getDocument,
  updateDocument,
  updateDocumentNaive,
  type UpdateResult,
} from '../lib/documents/store.js';

interface UpdateBody {
  title: string;
  body: string;
  baseVersion: number;
}

// Everything after authentication is client-controlled input.
function parseUpdate(raw: unknown): UpdateBody | null {
  const b = raw as Partial<UpdateBody> | null;
  if (!b || typeof b.title !== 'string' || b.title.length === 0) return null;
  if (typeof b.body !== 'string') return null;
  if (!Number.isInteger(b.baseVersion)) return null;
  return { title: b.title, body: b.body, baseVersion: b.baseVersion as number };
}

function respond(reply: FastifyReply, result: UpdateResult, baseVersion: number) {
  switch (result.status) {
    case 'ok':
      return result.document;
    case 'not_found':
      return reply.code(404).send({ error: 'not_found' });
    case 'conflict':
      // Return the current row (including who changed it) so the client can
      // reapply its edit on top of it without a second GET.
      return reply.code(409).send({ error: 'version_conflict', baseVersion, current: result.current });
  }
}

export default async function documentRoutes(app: FastifyInstance) {
  app.addHook('onClose', async () => {
    await pool.end();
  });

  app.post('/', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { title, body = '' } = (req.body ?? {}) as { title?: unknown; body?: unknown };
    if (typeof title !== 'string' || title.length === 0 || typeof body !== 'string') {
      return reply.code(400).send({ error: 'title (string) required, body must be a string' });
    }
    reply.code(201);
    return createDocument(title, body, req.user!.sub);
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await getDocument(id);
    return doc ?? reply.code(404).send({ error: 'not_found' });
  });

  // The fix: version-guarded update.
  app.put('/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parseUpdate(req.body);
    if (!input) return reply.code(400).send({ error: 'title, body and baseVersion (integer) are required' });
    const result = await updateDocument(id, input, input.baseVersion, req.user!.sub);
    return respond(reply, result, input.baseVersion);
  });

  // The bug, kept mounted so the race script can show it failing. Never copy this.
  app.put('/:id/naive', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parseUpdate(req.body);
    if (!input) return reply.code(400).send({ error: 'title, body and baseVersion (integer) are required' });
    const result = await updateDocumentNaive(id, input, input.baseVersion, req.user!.sub);
    return respond(reply, result, input.baseVersion);
  });
}
