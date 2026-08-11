# HTTP & Token Auth Fundamentals — Notes


### WHAT PROBLEM THIS SOLVES
In early web systems, applications needed a standardized way to restrict access to resources without forcing developers to invent custom, non-interoperable login forms and authentication systems. State-tracking authentication mechanisms solve this by keeping a record of the user's logged-in status on the server so they do not have to authenticate on every request. However, stateful sessions introduce a massive scaling bottleneck, prompting stateless protocol methods that let clients securely present credentials with every request without taxing the server’s database with constant state lookups.

### THE CORE MECHANISM

#### 1. Basic Authentication

* Sequence of Steps:

  1. Client sends a request to a protected resource without authorization.

  2. Server responds with a 401 Unauthorized status and challenges the client.

     * Header: `WWW-Authenticate: Basic realm="<realm_name>"`

  3. Client prompts the user for credentials, joins them as `username:password`, encodes the string in Base64, and resends the request.

     * Header: `Authorization: Basic <base64_encoded_string>`

  4. Server decodes the Base64 string, validates the credentials against its store, and grants access if valid.

#### 2. HTTP Digest Authentication (RFC 7616)

* Sequence of Steps:

  1. Client sends a request to a protected resource without credentials.

  2. Server challenges the client with a 401 Unauthorized response containing challenge parameters.

     * Header: `WWW-Authenticate: Digest realm="<realm>", nonce="<server_nonce>", opaque="<opaque_value>", qop="auth"`

  3. Client calculates the response digest using cryptographic hashes to protect the password in transit:

     * A1: `username:realm:password`
     * A2: `METHOD:URI` (e.g., `GET:/protected/resource`)
     * Hashed A1: `H(A1)` (commonly using MD5, SHA-256, or SHA-512)
     * Hashed A2: `H(A2)`
     * Response Hash: `H(H(A1) : nonce : nc : cnonce : qop : H(A2))` where `nc` is the nonce count formatted as an 8-digit hexadecimal string (e.g., `00000001`), and `cnonce` is a client-generated nonce.

  4. Client sends the request with the constructed response.

     * Header: `Authorization: Digest username="testuser", realm="Restricted Area", nonce="dcd98a6af457f989b7e46189a0481d5a", uri="/protected/resource", response="9b4e07392176548567f5c14293708127", opaque="5ccc069c403ebaf946046fcd977d62e4", cnonce="e37e34b9059c216f", nc="00000001", qop="auth"`

  5. Server performs the identical calculation using its stored copy of the user's password and grants access if they match.

#### 3. Session-Based (Stateful) Authentication

* Sequence of Steps:

  1. Client submits credentials via a POST request to the server's login endpoint.

  2. Server validates credentials, generates a unique, high-entropy session identifier, and saves this identifier in its memory or database.

  3. Server returns the session identifier to the client in the HTTP response.

     * Header: `Set-Cookie: session_id=<session_id>; Secure; HttpOnly; SameSite=Strict`

  4. Client's browser automatically appends the session identifier cookie to subsequent requests.

     * Header: `Cookie: session_id=<session_id>`

  5. Server extracts the session identifier, looks it up in its session store to verify active session state, and maps it to the associated user context to handle the request.

### SECURITY CONSIDERATIONS

* **Basic Authentication Vulnerability:** Base64 is purely an encoding mechanism, not encryption, meaning any entity capturing the request can decode the credentials instantly. Using Basic Authentication over an insecure HTTP channel exposes plain passwords to packet sniffing and Man-in-the-Middle (MitM) interception.

* **Digest Authentication Weaknesses:** While Digest Auth prevents plaintext password transmission by hashing credentials on the client, it does not encrypt the actual HTTP payload. Consequently, the rest of the request remains exposed to tampering and MitM eavesdropping unless paired with TLS/SSL. Modern implementations should enforce SHA-256 or SHA-512 instead of MD5 to mitigate cryptographic hash collision attacks. Additionally, the server must store the cleartext passwords or pre-computed hashes of `username:realm:password`, making the credential database a highly sensitive target.

* **Session Scaling Problem:** Stateful sessions scale poorly because they couple the application server to a session database or cache that must be checked for every incoming request, creating a central database bottleneck and complicating horizontal autoscaling. Cookie-based session identifiers are also subject to Cross-Site Request Forgery (CSRF) unless strict protection measures like `HttpOnly` and `SameSite` flags are implemented.

### COMMON MISCONCEPTIONS

* **Base64 is a security layer in Basic Authentication:** Base64 encoding is easily decoded by any standard tool and offers zero cryptographic security. It exists solely to safely package credentials into standard HTTP header characters, not to protect them.

* **Digest Authentication encrypts the request:** Digest Authentication only obfuscates the password using a hashed challenge-response exchange. The actual request body, URL path, and other headers remain completely visible in plaintext. It is not a substitute for transport-layer encryption (HTTPS/TLS).

* **Stateful sessions are the only way to manage auth:** Developers often assume that login states must be kept on the server. However, stateless token architectures (like JWTs) remove the server session lookup completely by encapsulating the authentication state directly inside a cryptographically signed token.


---

### Stateless server 
When applications scale horizontally across distributed servers, traditional session-based authentication creates a massive bottleneck because every server must constantly query a central database or shared cache to verify a user's logged-in status. JSON Web Tokens (JWTs) solve this scaling bottleneck by enabling stateless authentication, where the user's identity and access permissions are cryptographically signed and stored directly in a self-contained token on the client. This allows any server in a microservice network to instantly validate incoming requests in memory using cryptographic keys, entirely eliminating the need for server-side session stores or repetitive database lookups. Split access and refresh token architectures further solve the security window problem: short-lived access tokens limit the damage of token theft, while long-lived refresh tokens allow the client to silently request new access tokens without forcing the user to re-authenticate.

### THE CORE MECHANISM

#### 1. The Anatomy of a Signed JWT (JWS Compact Serialization)
A signed JSON Web Token is represented as a string consisting of three Base64url-encoded segments separated by period (`.`) characters:

* **Header:** A JSON object containing metadata about the cryptographic operations applied to the token.

  ```json
  {
    "typ": "JWT",
    "alg": "RS256",
    "kid": "key_2026_q3"
  }
  ```

  * `typ`: Tells the validator that this complete object is a JWT.
  * `alg`: The cryptographic algorithm used to sign the token (typically HS256 for symmetric or RS256 for asymmetric).
  * `kid`: Key Identifier, used by the validator to look up the correct public key from a key set.

* **Payload:** A JSON object containing "claims," which are statements about the user and the token's validity.

  ```json
  {
    "iss": "https://auth.example.com",
    "sub": "usr_8a7b9c2d1e3f",
    "aud": "https://api.example.com",
    "exp": 1786311100,
    "iat": 1786310200,
    "jti": "9b4e0739-2176-5485-67f5-c14293708127"
  }
  ```

  * `iss` (Issuer): URL identifying the authentication server that generated the token.
  * `sub` (Subject): Stable, unique identifier for the user (e.g., a UUID).
  * `aud` (Audience): Identifier indicating which API or resource server this token is intended for.
  * `exp` (Expiration Time): Epoch timestamp representing when the token becomes invalid.
  * `iat` (Issued At): Epoch timestamp when the token was created.
  * `jti` (JWT ID): A unique string identifier for the token used to detect token reuse and replay attacks.


* **Signature:** Cryptographically binds the header and payload together to guarantee integrity.
* **Symmetric (HS256):** Generated using a shared secret.
  $$\text{Signature} = \text{HMAC-SHA256}(\text{Base64url}(\text{Header}) + "." + \text{Base64url}(\text{Payload}), \text{Shared\_Secret\_Key})$$
* **Asymmetric (RS256):** Generated using a private key and verified using a public key.
  $$\text{Signature} = \text{RSA-Sign}(\text{SHA-256}(\text{Base64url}(\text{Header}) + "." + \text{Base64url}(\text{Payload})), \text{Private\_Key})$$
#### 2. Protocol and Request/Response Flow

1. **Authentication:** The client sends user credentials to the Authorization Server's `/login` endpoint.

2. **Token Issuance:** The server validates credentials, generates a short-lived Access Token (e.g., 15m lifetime) and a long-lived Refresh Token (e.g., 7d lifetime) containing a unique `jti`. The server returns them in a JSON payload or places the Refresh Token in a cookie:

   * Header: `Set-Cookie: refresh_token=<token_string>; Secure; HttpOnly; SameSite=Strict; Path=/refresh`

3. **Authenticated Requests:** To access protected resources, the client attaches the Access Token to the standard HTTP request header:

   * Header: `Authorization: Bearer <access_token>`

4. **Verification:** The Resource Server intercepts the request, parses the token, cryptographically validates the signature, and rejects the request if the token has expired (`exp`) or if it targets a different audience (`aud`).

5. **Refresh Token Rotation Flow:** When the Access Token expires, the client sends a POST request to `/refresh` with the Refresh Token.

   * **Normal Verification:** The server extracts the Refresh Token, validates its signature, and checks its `jti` against a whitelist/blacklist store. If valid, the server marks the old `jti` as used. It then generates a brand-new Access Token and a brand-new rotated Refresh Token (with a new `jti`) and returns them to the client.

   * **Reuse Detection (Replay Attempt):** If a client submits a Refresh Token whose `jti` is already marked as "used" in the database, the server MUST immediately deny the request. To mitigate an active attack, the server should invalidate the entire refresh token family (all refresh tokens descended from that original login) to instantly terminate the session.

### SECURITY CONSIDERATIONS

* **JWS is transparent (postcard security):** Standard signed JWTs are encoded, not encrypted. Anyone who intercepts a token can instantly decode and read the claims. Never store passwords, database keys, or sensitive personally identifiable information (PII) inside a standard JWT payload.

* **The Shared Secret Bottleneck (HS256 vs. RS256):**

  * With HS256, both the server that issues the token and every microservice that validates it must share the exact same secret key. This means a compromise of any single downstream service leaks the secret, allowing an attacker to forge valid tokens for any service in the entire system.

  * With RS256, only the central identity server holds the private key to sign tokens. Downstream services only receive the public key (often fetched dynamically from a JWKS endpoint) to verify signatures, meaning a compromised service cannot forge new tokens.

* **Algorithm Confusion / Downgrade Attack:** If your validation endpoint dynamically trusts the algorithm specified in the incoming token's header (`alg`), an attacker can extract your RS256 public key, modify the header to `"alg": "HS256"`, sign the token using your public key as the symmetric HMAC secret, and bypass signature verification. You must explicitly hardcode/pin the expected verification algorithm (e.g., enforcing `algorithms: ["RS256"]`) in your verification code.

* **The "none" Algorithm:** An Unsecured JWT utilizes `"alg": "none"` and omits the signature. Your implementation must explicitly reject `"none"` headers to prevent attackers from bypassing signature validation entirely.

* **Browser Storage Policies:** Storing JWTs in browser `localStorage` leaves them completely vulnerable to theft via Cross-Site Scripting (XSS) attacks. Access tokens should live in-memory, and refresh tokens should be stored in cookies configured with `Secure`, `HttpOnly`, and `SameSite=Strict` attributes to protect them from XSS and Cross-Site Request Forgery (CSRF).

### COMMON MISCONCEPTIONS

* **Misconception 1:** A signed JWT (JWS) hides or encrypts the user's data.  
  * **Reality:** Signing only guarantees integrity and authenticity (preventing tampering); it does not provide confidentiality. The payload is simply base64url-encoded and is completely public to anyone who intercepts the token. Confidentiality requires JSON Web Encryption (JWE).

* **Misconception 2:** You can immediately revoke a stateless JWT at any time.  
  * **Reality:** Because the Resource Server validates the token state independently (by verifying the signature and expiration locally), an issued JWT remains cryptographically valid until its `exp` timestamp passes. Deleting it from a client application does not stop it from being accepted by APIs. Immediate revocation requires maintaining a fast-access blacklist cache (e.g., in Redis) of revoked `jti` identifiers.

* **Misconception 3:** Symmetric signing (HS256) is more secure because it is faster.  
  * **Reality:** While HMAC-SHA256 is computationally faster, RS256/ES256 is significantly more secure in distributed architectures because it operates on a model of directional trust. Asymmetric signing separates signing authority from verification authority, minimizing the risk of a global key compromise.


