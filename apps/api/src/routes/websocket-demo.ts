import type { FastifyInstance } from 'fastify';
import { countRoomMembers, emitIncidentUpdated } from './incidents/socket.js';

// Dev trigger for the fan-out test: any authenticated REST caller can push an
// update into an incident room, which is exactly how real incident mutations
// will reach connected clients.
export default async function websocketDemoRoutes(app: FastifyInstance) {
  app.post('/incidents/:incidentId/update', { preHandler: [app.authenticate] }, async (req) => {
    const { incidentId } = req.params as { incidentId: string };
    const payload = { incidentId, ...(req.body as object), at: new Date().toISOString() };
    emitIncidentUpdated(app.io, incidentId, payload);
    return { delivered: 'incident:updated', roomMembers: await countRoomMembers(app.io, incidentId) };
  });
}
