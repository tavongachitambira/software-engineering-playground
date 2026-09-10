// Run: pnpm tsx src/scripts/presence-subscriber.ts <incidentId>
import Redis from 'ioredis';

const incidentId = process.argv[2] ?? 'demo-incident';
const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const channel = `presence-channel:${incidentId}`;

sub.subscribe(channel, (err) => {
  if (err) {
    console.error('Failed to subscribe:', err);
    process.exit(1);
  }
  console.log(`Subscribed to ${channel}, waiting for messages...`);
});

sub.on('message', (chan, message) => {
  console.log(`[${new Date().toISOString()}] ${chan}:`, message);
});