import type { FastifyInstance } from 'fastify';
import { heartbeat, leave, getPresentUsers } from '../lib/presence/store.js';

export default async function presenceRoutes(app: FastifyInstance) {
  app.post('/:incidentId/heartbeat', async (req) => {
    const { incidentId } = req.params as { incidentId: string };
    const { userId } = req.body as { userId: string };
    await heartbeat(incidentId, userId);
    return { status: 'ok' };
  });

  app.post('/:incidentId/leave', async (req) => {
    const { incidentId } = req.params as { incidentId: string };
    const { userId } = req.body as { userId: string };
    await leave(incidentId, userId);
    return { status: 'ok' };
  });

  app.get('/:incidentId/present', async (req) => {
    const { incidentId } = req.params as { incidentId: string };
    const present = await getPresentUsers(incidentId);
    return { incidentId, present };
  });
}