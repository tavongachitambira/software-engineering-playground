// Atomically claim an idempotency key, or detect: duplicate-in-flight,
// param mismatch, or an already-completed result to replay.
//
// KEYS[1] = idempotency:{key}
// ARGV[1] = requestHash (sha256 of the normalized request body)
// ARGV[2] = ttlSeconds (24h, per Stripe's stated key lifetime)
// ARGV[3] = now (unix seconds)
// ARGV[4] = staleAfterSeconds — if a claim has been "in-progress" longer
//           than this, treat it as an abandoned/crashed request and
//           allow reclaiming rather than leaving the key stuck forever.
//           This isn't in Stripe's public docs — it's a deliberate
//           addition for this implementation to handle server crashes
//           mid-request, since Stripe's own crash-recovery internals
//           aren't published.
export const CLAIM_SCRIPT = `
local key = KEYS[1]
local requestHash = ARGV[1]
local ttl = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local staleAfter = tonumber(ARGV[4])

local existing = redis.call('HGETALL', key)

if #existing == 0 then
  redis.call('HSET', key, 'status', 'in-progress', 'requestHash', requestHash, 'claimedAt', now)
  redis.call('EXPIRE', key, ttl)
  return { 'claimed' }
end

local data = {}
for i = 1, #existing, 2 do
  data[existing[i]] = existing[i + 1]
end

if data['requestHash'] ~= requestHash then
  return { 'mismatch' }
end

if data['status'] == 'in-progress' then
  local claimedAt = tonumber(data['claimedAt']) or 0
  if now - claimedAt > staleAfter then
    redis.call('HSET', key, 'status', 'in-progress', 'claimedAt', now)
    return { 'claimed' }
  end
  return { 'in-progress' }
end

return { 'completed', data['statusCode'], data['body'] }
`;