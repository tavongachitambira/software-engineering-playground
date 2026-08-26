// All four algorithms need atomic read-modify-write except plain fixed-window
// (INCR is atomic on its own — see notes.md for why that one's the exception).

export const TOKEN_BUCKET_SCRIPT = `
-- KEYS[1] = bucket key
-- ARGV[1] = capacity, ARGV[2] = refillRatePerSecond, ARGV[3] = now (seconds, float), ARGV[4] = requested tokens
local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

if tokens == nil then
  tokens = capacity
  last_refill = now
end

local elapsed = math.max(0, now - last_refill)
tokens = math.min(capacity, tokens + elapsed * refill_rate)

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call('HMSET', KEYS[1], 'tokens', tokens, 'last_refill', now)
redis.call('EXPIRE', KEYS[1], math.ceil(capacity / refill_rate) * 2)

return { allowed, tostring(tokens) }
`;

export const SLIDING_WINDOW_COUNTER_SCRIPT = `
-- KEYS[1] = current window key, KEYS[2] = previous window key
-- ARGV[1] = limit, ARGV[2] = elapsedFraction (0..1 into current window), ARGV[3] = windowSeconds
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local previous = tonumber(redis.call('GET', KEYS[2]) or '0')
local limit = tonumber(ARGV[1])
local elapsed_fraction = tonumber(ARGV[2])
local window_seconds = tonumber(ARGV[3])

local estimated = current + previous * (1 - elapsed_fraction)

if estimated >= limit then
  return { 0, tostring(estimated) }
end

local new_current = redis.call('INCR', KEYS[1])
if new_current == 1 then
  redis.call('EXPIRE', KEYS[1], window_seconds * 2)
end

return { 1, tostring(estimated) }
`;

export const SLIDING_WINDOW_LOG_SCRIPT = `
-- KEYS[1] = sorted-set key
-- ARGV[1] = now (ms), ARGV[2] = windowMs, ARGV[3] = limit, ARGV[4] = unique member id
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
local count = redis.call('ZCARD', KEYS[1])

if count >= tonumber(ARGV[3]) then
  return 0
end

redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('EXPIRE', KEYS[1], math.ceil(tonumber(ARGV[2]) / 1000))

return 1
`;