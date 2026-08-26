# System Design Interview Notes: Distributed Rate Limiter

This document synthesizes core architectural patterns, algorithm comparisons, and distributed systems considerations for designing a production-grade API Rate Limiter, specifically grounded in insights from the **ByteByteGo System Design** [77] and **Witty Coder's production engineering guides** [257].

---

## 1. System Requirements & Business Value

### Why Enforce Rate Limiting?
In production systems, rate limiting serves as a critical reliability safeguard rather than just a simple blocking tool [199]. It adds negligible latency (less than 1 ms of overhead) while preventing cascading failures [258, 259]:
*   **Preventing Resource Starvation (DoS/DDoS Protection)**: Ensures a single malicious actor or a run-away script cannot overwhelm application servers or exhaust database connections [78, 258, 260]. (e.g., Twitter enforces a limit of 300 tweets per 3 hours [78]; Google Docs API defaults to 300 read requests per user per 60 seconds [78]).
*   **Cost Management**: Prevents expensive billing spikes in systems that consume paid third-party APIs (such as payment processors, credit check agencies, or LLMs) [78].
*   **Infrastructure Traffic Smoothing**: Filters out garbage traffic from scrapers, automated bots, and misbehaving clients before it hits expensive downstream services [78, 260].

### System Design Requirements
*   **Strict Limit Enforcement**: Accurately throttle excessive requests based on diverse properties (IP address, User ID, API Token, etc.) [79, 81].
*   **Ultra-Low Latency**: The limiter must run on hot request paths and cannot slow down HTTP response times [81].
*   **High Fault Tolerance**: If the rate-limiting tier or Redis cache goes offline, it must not take down the entire API [81, 251, 272].
*   **Minimal Memory Footprint**: Scalable to millions of active users without causing high memory overhead on cache clusters [81].
*   **Distributed State Consistency**: Counter states must be shared reliably and consistently across geographically distributed application servers [80, 81, 107].

---

## 2. Architectural Placement: Where to Enforce Limits?

Selecting where to place your rate-limiting logic is an essential architectural decision [84]:


[ Client ] ---> [ Edge / API Gateway ] ---> [ App Servers ] ---> [ Redis Cache ]
                   (Rate Limiter)


| Placement Option | Mechanics & Considerations | Trade-offs & Selection Criteria |
| :--- | :--- | :--- |
| **Client-Side** | Handled in client code (e.g., SDKs or web app) [82]. | **Unreliable**. Highly prone to tampering, reverse-engineering, and bypasses [82]. Good for practicing self-regulation (e.g., client caching, back-off retry loops) but never for security boundaries [82, 110]. |
| **Server-Side** | Implemented directly as application middleware [83, 100]. | **Full Algorithmic Control**. Gives backend developers maximum customization over rules and logic [85]. However, implementing from scratch consumes development resources and consumes application server CPU/memory [85]. |
| **API Gateway / Middleware** | Enforced at a centralized gateway (e.g., Kong, Zuplo) or cloud edge (e.g., Cloudflare) [84, 108, 219]. | **Highly Recommended for Microservices**. Gateways naturally handle authentication, SSL termination, and IP whitelisting [84]. This decouples rate-limiting code from business logic [125]. |

---

## 3. Core Rate-Limiting Algorithms

Choosing the right rate-limiting algorithm requires balancing **accuracy**, **memory consumption**, and **burst tolerance** [24, 197].

### 1. Token Bucket
*   **How it Works**: A virtual bucket of capacity $C$ accumulates tokens at a steady refill rate $R$ tokens per second [87, 261]. When a request arrives, it attempts to draw 1 token [87, 261]. If tokens are available, the request is allowed [87, 261]. If empty, the request is dropped with an HTTP 429 [87, 261].
*   **Parameters**: Bucket Size/Capacity ($C$) and Refill Rate ($R$) [88].
*   **Pros**: Highly memory efficient ($O(1)$) [89, 270]. Extremely flexible because it naturally allows **controlled bursts of traffic** (absorbing spikes up to capacity $C$) while maintaining a stable long-term average rate [89, 204].
*   **Cons**: Hard to fine-tune both parameters simultaneously for diverse traffic profiles [89].
*   **Best For**: General-purpose, developer-facing public APIs [198, 208].

### 2. Leaky Bucket
*   **How it Works**: Represents a FIFO queue of size $B$ that drains/drips at a constant outflow rate [89, 262]. Requests fill the queue [262]. If the queue is full, new requests are rejected [90, 262]. 
    *   *Policing Variant (Meter)*: Rejects overflow immediately without delay [55].
    *   *Shaping Variant (Queue)*: Delays requests, queueing them to ensure they trickle out at a perfectly uniform pace [55, 56].
*   **Parameters**: Queue Capacity/Bucket Size and Outflow/Drain Rate [90].
*   **Pros**: Smooths traffic into a perfectly steady constant flow, protecting sensitive downstream endpoints [91, 198, 205].
*   **Cons**: Spikes in traffic can fill the queue with stale requests, artificially delaying or rate-limiting more critical, recent requests [91].
*   **Best For**: Downstream database operations, billing systems, and payment processor integrations where steady trickle is required [58, 262, 273].

### 3. Fixed Window Counter
*   **How it Works**: Divides time into non-overlapping windows of size $W$ (e.g., 1-minute blocks) and assigns a simple counter to each window [32, 92]. When a counter exceeds the limit, requests are blocked until the next window boundary resets the counter to 0 [32, 92].
*   **Pros**: Dead-simple to implement, minimal memory footprint ($O(1)$) [36, 94].
*   **Cons**: **Boundary Spikes**. A client can exploit boundaries by sending its full quota right at the end of Window A and again at the start of Window B [36, 93, 200].
    *   *Example*: A limit of 5 requests per minute. A client sends 5 requests at 12:00:59 (allowed) and 5 requests at 12:01:01 (allowed) [93]. The server receives **10 requests in 2 seconds**, doubling the intended limit [93].
*   **Best For**: Internal services or low-risk systems where approximate limits are acceptable [65, 273].

### 4. Sliding Window Log
*   **How it Works**: Keeps an exact log of request timestamps for each user (typically stored in a Redis Sorted Set) [38, 94]. On each request, it prunes all timestamps older than the sliding window boundary ($t - W$) [37, 94]. If the remaining log size is less than the limit, the new request timestamp is added and allowed [37, 94].
*   **Pros**: **100% Mathematically Accurate**. Eliminates boundary bursts completely [36, 42].
*   **Cons**: **Extremely High Memory Cost**. The log size grows linearly with request volume ($O(N)$) since even rejected request timestamps are logged [42, 96]. Under an active DoS attack, the log can experience rapid memory expansion [202].
*   **Best For**: Critical, high-security, low-traffic endpoints (e.g., Login, Password Reset, 2FA) [38, 267].

The Sliding Window Counter is a high-performance rate-limiting algorithm that blends current and previous window counts using a weighted average. 
How it Works 

• It uses the exact elapsed time of the current window to calculate a rolling estimate. 
• Formula: $\text{Estimated Requests} = \text{Current Count} + \text{Previous Count} \times \left(1 - \frac{\text{Elapsed Time in Window}}{\text{Window Size}}\right)$ 

Example 

• Limit: 7 requests per minute. 
• Previous window count: 5 requests. 
• Current window count: 3 requests. 
• Arrival time: 30% into the current window (leaving a 70% overlap with the previous window). 
• Calculation: $\text{Estimated} = 3 + 5 \times (1 - 0.3) = 3 + 5 \times 0.7 = 3 + 3.5 = 6.5 \rightarrow 6 \text{ requests}$ 
• Decision: Since $6 < 7$, the request is allowed. 

Pros 

• Low Memory: $O(1)$ memory footprint because it stores only two counters per user. 
• Smooths Bursts: Effectively smooths boundary bursts without needing to store individual timestamps. 

Cons 

• Approximation: Assumes an even traffic distribution, though it achieves around 98% accuracy in practice. 

Best For 

• Production Scale: Ideal for massive-scale systems used by companies like Stripe, Cloudflare, and GitHub. 

Would you like me to rewrite or format the other rate-limiting algorithms from this guide using the same clean Markdown and LaTeX style? 
AI responses may include mistakes.



---

## 4. Distributed Architecture & Challenges

Scaling a rate limiter to handle millions of requests across multiple application servers introduces distinct challenges [80, 105]:

```
                          [ Client Request ]
                                  |
               +------------------+------------------+
               |                                     |
      [ App Server 1 ]                      [ App Server 2 ]
               |                                     |
               +------------------+------------------+
                                  |
                       [ Central Redis Cluster ]
```

### Challenge 1: The Synchronization Problem
If application servers store counters locally in-memory, a user's requests can be routed to different servers, effectively multiplying the allowed limit by the number of servers [107, 271].
*   *Bad Solution*: Sticky Sessions. It creates uneven load distribution and lacks flexibility [108].
*   *Good Solution*: **Centralized Data Store (Redis)**. All application servers connect to a shared Redis cluster to verify and update counters globally [108, 119].

### Challenge 2: Race Conditions (TOCTOU)
The standard flow involves a **Read-Modify-Write** cycle: Read counter $\rightarrow$ Check if over limit $\rightarrow$ Write incremented counter [105]. In highly concurrent systems, multiple requests can read the same value before any can write it back, allowing requests to slip through past the limit [29, 106].

To solve this, operations must run **atomically** [29, 271]:
1.  **Redis `INCR` + `EXPIRE` Pattern**: For simple fixed window counters, Redis provides atomic single-command increments [99].
2.  **Lua Scripting via `EVAL`**: Redis executes Lua scripts in a single blocking thread, ensuring no other commands interleave between the reads and writes [29, 31]. This is critical for Token Bucket and Sliding Window Counter calculations [31, 57].
3.  **Sorted Sets**: Used for Sliding Window Log to atomically prune and count via `ZREMRANGEBYSCORE` and `ZCARD` inside a script [38, 41].

---

## 5. Key Product Decisions

Rate limiting is not solely a technical problem; it requires crucial product design trade-offs [272].

### Fail-Open vs. Fail-Closed
When Redis goes down or experiences severe network partitioning, how should the API handle rate limiting? [251, 272]

*   **Fail-Open (User-First)**:
    *   *Behavior*: Rate limit checks bypass on error; requests are allowed through to the API servers [272, 292].
    *   *Trade-off*: Prioritizes customer user experience [272]. However, it leaves your core servers vulnerable to abuse or overloading during an outage [272].
    *   *Usage*: Most standard consumer endpoints and web applications [272].
*   **Fail-Closed (Security-First)**:
    *   *Behavior*: Rate limit checks block all incoming requests if Redis is unreachable [272, 292].
    *   *Trade-off*: Protects downstream databases, payment pathways, and system integrity at all costs [272]. However, it completely blocks legitimate users during a cache outage [272].
    *   *Usage*: Security-critical endpoints, login pages, and expensive payment gateways [272].

### Soft vs. Hard Limits
*   **Hard Rate Limiting**: Requests cannot exceed the configured threshold under any circumstance [110].
*   **Soft Rate Limiting (Grace Periods / Overages)**: Allowed to briefly burst above limits during peak traffic or flash sales [6, 110, 244]. For instance, modern SaaS platforms allow customers to exceed monthly limits slightly before hard-blocking, triggering webhook alerts at 80% or 95% utilization [6].

---

## 6. Response Codes, Headers, & Client Best Practices

### Recommended Response Protocol
When a client is throttled, standard REST APIs must reply with:
*   **HTTP Status Code 429 (Too Many Requests)** [5, 83, 219].
*   **Retry-After Header**: Tells the client exactly how many seconds to wait before attempting another request, preventing aggressive "polling storms" [5, 104, 220].

### Standardized Response Headers
Using conventions or the IETF Draft specifications makes limits transparent and machine-readable [4, 221]:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 45
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1719878445
```
*   `X-RateLimit-Limit`: Maximum requests permitted per window [104, 190].
*   `X-RateLimit-Remaining`: Number of requests left in the current window [104, 190].
*   `X-RateLimit-Reset`: Unix timestamp indicating when the window resets [5, 104, 190].

### Client-Side Resiliency Strategies
To gracefully recover from rate-limiting events, well-behaved clients should implement [110]:
1.  **Client-Side Caching**: Cache expensive reads locally to avoid repetitive API hits [110].
2.  **Back-off and Jitter**: If throttled, retry using **exponential backoff** with random noise (jitter) to prevent a "retry storm" from crashing recovery efforts [110].
3.  **Rate Limit Awareness**: Read headers to dynamically scale request rates before hitting limits [4, 110].

---

## Choosing the Right Identifier for Rate Limiting

Choosing the right identifier for your rate limiter depends heavily on whether your endpoints are public or authenticated, who your consumers are (B2C vs. B2B), and what kind of abuse you are trying to prevent.

In most production systems, you don't pick just one—you use a combination of them. Here is how to decide which strategy applies to your specific endpoints.

### 1. Rate Limiting by IP Address
This is your first line of defense at the edge (often handled by an API Gateway, Load Balancer, or WAF like Cloudflare).

* **When to use it:**
  * Unauthenticated endpoints: Login pages, account creation, or public search endpoints where you don't yet know who the user is.
  * Global DDoS mitigation: To stop massive volumetric attacks before they hit your application logic.

* **The Problem:**
  * The NAT problem: Many users (like an entire corporate office, university campus, or coffee shop) often share a single public IPv4 address. If one person acts maliciously, rate limiting by IP might block hundreds of innocent users.
  * Easily bypassed: Attackers can use botnets, rotating proxies, or VPNs to constantly change their IP address.

### 2. Rate Limiting by User ID
Once a user has authenticated (e.g., via a JWT or session cookie), you switch to tracking their specific User ID.

* **When to use it:**
  * B2C Consumer Apps: Social media, e-commerce, or SaaS apps where humans are interacting with the system.
  * Fair usage: Preventing a single heavy user from monopolizing database resources (e.g., limiting a user to 5 posts per minute).

* **The Problem:**
  * Useless for login: You can't use this on a login endpoint because the user hasn't proven their identity yet. If you rate-limit failed logins by User ID, an attacker could lock a legitimate user out of their account simply by spamming wrong passwords (a Denial of Service on a specific account).
  * Sybil attacks: A malicious user can just create multiple free accounts to bypass the limits.

### 3. Rate Limiting by API Key / Client ID
This is the standard for Developer Platforms, B2B services, and Server-to-Server communication.

* **When to use it:**
  * B2B APIs: Services like Stripe, Twilio, or AWS where businesses pay for access.
  * Tiered Pricing: Allowing 100 requests/min for the "Free" tier and 10,000 requests/min for the "Pro" tier. API keys are directly tied to billing.

* **The Problem:**
  * Key leakage: If a client accidentally commits their API key to a public GitHub repo, attackers can drain their quota. You must implement alerting for unusual spikes and allow easy key rotation.

### The Production Standard: A Hybrid Approach
Relying on a single identifier leaves blind spots. Modern system designs use a Defense in Depth strategy, layering these rules:

1. Edge Layer (IP): A blanket limit of 5,000 requests/minute per IP address to stop basic DDoS attacks and scrapers.
2. Auth Layer (IP + Endpoint): Limit the /login endpoint to 5 attempts per minute per IP address to stop brute-forcing.
3. Application Layer (User/API Key): Limit authenticated users to 100 requests/minute based on their User ID or API Key, ensuring fair usage and enforcing pricing tiers.

Use this interactive matrix to see which strategy fits different architectural scenarios:

---

# Day 2: Redis Data Structures & Concurrency (Fixed Window vs. Token Bucket)

This notes document deep-dives into Day 2 of the rate-limiting curriculum, focusing on **Redis data structures**, the naive **fixed-window counter**, and why distributed concurrency creates **atomic race conditions** that require Redis Lua scripting [25, 29, 328].

---

## 1. Naive Fixed-Window Counter (Redis implementation)

### The `INCR` + `EXPIRE` Pattern
A naive fixed-window counter divides time into discrete, non-overlapping intervals (e.g., 1-second or 1-minute blocks) [32, 161, 269]. Each block gets a unique Redis key per client (e.g., `ratelimit:{user_id}:{timestamp_window}`) [32, 33, 140]. 

The algorithm operates on a simple, counter-based mechanism [32, 99]:
1. When a request arrives, the application executes a Redis `INCR` command on the client's key for the current window [33, 35, 100].
2. If the return value of `INCR` is `1`, this is the very first request in the current window [35]. The application immediately sets a Time-To-Live (TTL) on the key using the `EXPIRE` command (e.g., 60 seconds) so that the key auto-cleans when the window ends [33, 35, 280].
3. If the return value is greater than the configured limit, the request is rejected with `HTTP 429 Too Many Requests` [32, 34, 161].
4. If the return value is less than or equal to the limit, the request is allowed [34].

```
Client Request 
     │
     ▼
Execute: INCR key ───► [Redis Server]
                         │
        ┌────────────────┴────────────────┐
        ▼ (returns 1)                     ▼ (returns > 1)
   Key is new!                       Key already exists.
Execute: EXPIRE key                  Is value > limit?
        │                             ┌───┴───┐
        ▼                             ▼ (Yes) ▼ (No)
  Allow Request                     Reject  Allow
                                    (429)   Request
```

### Naive Implementation (Node.js/TypeScript example)
```typescript
import { getRedisClient } from './redis';

const LIMIT = 100;
const WINDOW_SECONDS = 60;

export async function isAllowedFixedWindow(userId: string): Promise<boolean> {
    const redis = await getRedisClient();
    const currentWindow = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    const key = `ratelimit:${userId}:${currentWindow}`;

    // Increment the counter atomically inside Redis
    const count = await redis.incr(key);

    // If it's the first request in this window, set the TTL
    if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS);
    }

    return count <= LIMIT;
}
```

---

## 2. Why `INCR` + `EXPIRE` is Algorithmatically Safe (No Concurrency Race)

In the implementation above, the key-increment and key-expiry are executed as **two separate network calls** to Redis (`INCR` followed by `EXPIRE`) [35, 328]. In distributed environments, running multiple independent commands is typically prone to race conditions [29, 105]. However, the fixed-window `INCR` + `EXPIRE` pattern is **concurrency-safe** from a limit-bypassing perspective [35, 329].

### The Mechanics of Safety
* **Atomicity of `INCR`:** Redis is single-threaded and executes the `INCR` command atomically [25, 280]. Only **one** thread or concurrent application server will ever receive `1` as the return value for a new key [35].
* **No "Double Spending" Limit Bypass:** Even if hundreds of concurrent requests arrive at the exact same millisecond, the Redis server processes the `INCR` calls sequentially [25, 280]. Clients 2 through $N$ will receive `2, 3, ... N` [35]. The limit check (`count <= LIMIT`) is evaluated based on the sequential count returned by Redis [34]. Therefore, it is impossible for multiple concurrent requests to "double spend" or trick the application into bypassing the threshold [29, 283].
* **Safety of Delayed `EXPIRE`:** If the network is slow or if client 1 crashes before issuing the `EXPIRE` command, the only downside is that the key might lose its TTL (remaining in Redis forever unless cleaned) [35]. However, from a **security and throttling perspective**, the client is still correctly limited [35]. 

---

## 3. The Token Bucket State Requirements

While the fixed-window counter only needs to track a single integer per window, the **Token Bucket** algorithm requires a more sophisticated state representation [50, 271, 328]. 

### The Dual Fields
To enforce a steady refill rate while permitting controlled bursts of traffic up to a maximum capacity, the Token Bucket must track **two critical variables** [48, 50, 328]:
1. **`tokens`** (floating-point or decimal): The current number of tokens available in the bucket [50, 271, 281].
2. **`last_refill`** (Unix timestamp): The exact time the bucket was last recalculated [50, 271, 281].

### Why This Dual State is Required
Instead of running a separate background cron job or timer to constantly increment tokens on thousands of active users (which would create massive CPU and scheduling bottlenecks), production systems use **on-demand lazy refilling** [51, 53]. 

When a request arrives at time `now`, the system calculates how many tokens should have refilled since the last request by computing [51, 53]:
$$\text{elapsed\_time} = \text{now} - \text{last\_refill}$$
$$\text{new\_tokens} = \text{elapsed\_time} \times \text{refill\_rate}$$
$$\text{tokens} = \min(\text{capacity}, \text{tokens} + \text{new\_tokens})$$

This lazy-refill pattern depends on knowing the previous `tokens` count and **exactly when that count was recorded** (`last_refill`) [50, 51, 53].

---

## 4. Why Token Bucket Fails Without Server-Side Atomicity

Because the Token Bucket must track and update *two* independent state variables, it is a classic **read-modify-write** pattern [29, 57, 328]. 

### The Concurrency Vulnerability (Double Spending & Lost Updates)
If the application executes the read, compute, and write steps as separate commands from application code, it is highly vulnerable to **TOCTOU (Time-of-Check-Time-of-Use)** race conditions [29]:

1. **Stale Reads:** Client Request A and Client Request B arrive concurrently [29, 106].
2. **Interleaved Fetch:** Both application servers query Redis for the bucket state. They both read `tokens = 1` and `last_refill = T` [29, 106].
3. **Double Throttling Bypass (Double Spend):** 
   * Application Server A calculates that `tokens >= 1`, decrements `tokens` to `0`, updates `last_refill = now`, and **allows** the request [29, 51, 281].
   * Application Server B (having read the stale `tokens = 1`) *also* calculates that `tokens >= 1`, decrements `tokens` to `0`, updates `last_refill = now`, and **allows** the request [29, 51, 281].
4. **Lost Update:** Both servers write back `tokens = 0` to Redis [29]. 

Two requests were permitted to consume a token when only **one** token was actually available [29, 283]. Under high-concurrency traffic spikes (such as automated bot scrapers or DDoS attacks), this synchronization failure allows clients to massively exceed their rate limits [29, 105].

---

## 5. The Solution: Server-Side Atomicity with Redis Lua Scripting

To prevent race conditions in a distributed microservices architecture, the entire **refill-check-consume** transaction must run **atomically** [29, 119, 280]. 

Redis solves this problem using **server-side Lua scripting** via the `EVAL` and `EVALSHA` commands [31, 283, 286].

```
 Application Servers                     Redis Server
┌──────────────────┐                     ┌────────────────────────┐
│ App Server A     │─── EVAL Lua ───────►│ Executes Lua Script    │
└──────────────────┘                     │ (locks keys, runs      │
                                         │  read-compute-write    │
┌──────────────────┐                     │  atomically in 1 pass) │
│ App Server B     │─── (Blocks...) ────►│                        │
└──────────────────┘                     └────────────────────────┘
```

### Why Lua Scripts Offer Perfect Concurrency Control
1. **Blocking Event Loop:** Redis is single-threaded, and executing a Lua script blocks the event loop while it runs [31]. No other command or script can interleave or modify the watched keys between the script's reads and writes [29, 31, 280].
2. **Conditional Branching:** Unlike Redis transactions using `MULTI` / `EXEC` (which queue commands but do not allow branching or inspecting returned values during execution), a Lua script can perform conditional logic (`if/then`) on values it just read [30, 31].
3. **Single Round Trip:** The application sends the arguments once, and the entire transaction executes in a single network round-trip, minimizing latency and eliminating the overhead of optimistic locking (`WATCH` + `MULTI` / `EXEC`) retry loops [30, 31].

---

## Summary: Concurrency Checklist

| Metric / Scenario | Fixed-Window (`INCR`) | Token Bucket (Separate App Commands) | Token Bucket (Redis Lua Script) |
| :--- | :--- | :--- | :--- |
| **State tracked** | 1 integer (counter) [135] | 2 fields (`tokens` + `last_refill`) [50, 271] | 2 fields (`tokens` + `last_refill`) [50, 271] |
| **Race Conditions?** | **No** (sequential `INCR` resolves counts perfectly) [25, 35] | **Yes** (interleaved reads result in stale state bypass) [29, 106] | **No** (execution is fully blocked and atomic) [29, 31, 280] |
| **Limit Overages?** | Exact enforcement (susceptible only to boundary bursts) [36, 161] | High (clients can bypass limits during concurrent spikes) [29] | Exact enforcement (no concurrency-based bypasses) [29, 31] |
| **Complexity** | Extremely Low [33] | Medium [54] | High (requires Lua scripting on Redis server) [54] |