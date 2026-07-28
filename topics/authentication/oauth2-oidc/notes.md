# OAuth 2.0 and OpenID Connect — Notes

## What is it?
Authentication is verifying a user is who they claim to be. **OAuth 2.0 is explicitly NOT an authentication method** — it's an **authorization framework**. It answers "can this app access that resource on the user's behalf," not "who is this user."

## What problem does it solve?
Before OAuth, if app A (e.g. Claude.ai) wanted to access your data on service B (e.g. GitHub), the only option was to hand A your actual GitHub password. That's bad: A now holds your full credentials, can do anything your account can do, and revoking access means changing your password everywhere it's used.

OAuth's fix: the third-party app never sees your password. It gets a **scoped, revocable token** that only grants the specific permissions you approved (e.g. "read my repos") — nothing more.

## Core concept
Instead of "here's my password, do whatever," it's "here's a token that lets you do exactly these specific things, and I can take it back whenever I want."

### How to implement it

Implemented: the OAuth 2.0 **client-side** Authorization Code flow against a
real GitHub OAuth App (no fake authorization server — this is the one topic
where a toy version wouldn't teach the real thing).

- `/topics/oauth/login` — generates a `state` value (stored server-side,
  one-time use), redirects the browser to GitHub's `/login/oauth/authorize`
  with `client_id`, `redirect_uri`, `scope`, and `state`.
- `/topics/oauth/callback` — GitHub redirects here with `code` + `state`.
  The route rejects the request if `state` doesn't match a pending one
  (CSRF protection), then exchanges the code for an access token via a
  server-to-server POST to `/login/oauth/access_token`, using
  `client_secret` — this is the step that actually proves the request is
  coming from the registered app, not someone who intercepted the redirect.
  The access token is then used to call `api.github.com/user` as a resource
  server request.

**Not implemented yet:** the OIDC layer (ID tokens). GitHub's OAuth
implementation doesn't support OIDC — Google or Auth0 would be the next
provider to try if I want to build the ID-token verification step and see
the "who is this user" half of the picture, separate from the "what can
this app do" half already working here.

### Common mistakes hit while building this
- `redirect_uri_mismatch` from GitHub — the callback URL registered in the
  OAuth App settings has to match the `redirect_uri` sent in the auth
  request *exactly*, including trailing slashes and protocol.
- Forgot `User-Agent` header on the `api.github.com/user` call initially —
  GitHub's API rejects unauthenticated-looking requests without one.
  
## OpenID Connect (OIDC) — authentication built on top of OAuth2

OAuth2 alone tells an app "you're allowed to access X" — it says nothing reliable about *who* the user is. OIDC is a thin identity layer on top of OAuth2 that adds actual authentication.

## How it works

OAuth 2.0 is an authorization framework, not an authentication method — it
answers "can this app access that resource on the user's behalf," not "who
is this user."

The flow: a client app redirects the user to the resource owner's
authorization server with a `client_id`, requested `scope`, a `redirect_uri`,
and a `state` value (CSRF protection). The user approves on a consent screen,
and the authorization server redirects back with a short-lived authorization
code. The client's backend then exchanges that code — server-to-server, using
its `client_secret` — for an access token. That secret exchange step is what
proves the request is coming from the legitimate registered app, not
whoever happened to intercept the redirect.

OIDC adds authentication on top of this by also returning an **ID token** — a
JWT containing identity claims like `sub` and `email`. The client verifies
the ID token's signature to establish who the user actually is and creates a
session. The access token itself never proves identity — it's the ID token
that does.

### How to implement it
This one's different from the others — implementing it well means acting as
the OAuth **client** against a real provider (GitHub is easiest to register
an OAuth app against), not simulating a fake authorization server. No
meaningful toy version exists here; this is the exception to "smallest
possible implementation" since it requires real network calls end to end.

Not yet implemented — planned next after the access/refresh token pair topic.

**Correction to my original notes:** the thing that gets verified to create the session is specifically the **ID token**, not the access token. The access token is still just for calling APIs on the user's behalf — it doesn't reliably prove identity.

## Common pitfalls
- Third-party access can be revoked by the user at any time from the resource server's settings (e.g. GitHub → Settings → Authorized OAuth Apps) — the Client App has no control over this.
- Access tokens are short-lived (e.g. 15 min) — expiration means the Client App loses access until it uses a refresh token to get a new one.
- Refresh tokens let this renewal happen silently, without the user re-approving anything, until the refresh token itself expires or is revoked.
- Confusing OAuth2 with authentication — a classic mistake. OAuth2 answers "what can this app do," OIDC answers "who is this user."

## When to use this (and when not to)
- **Use** OAuth2/OIDC when your app needs to access a third-party service on the user's behalf, or wants to let users sign in via an external identity provider (Google, GitHub, etc.) instead of managing your own password auth.
- **Don't use** it if there's no third-party service involved — plain session or JWT auth (see `http-auth-fundamentals`) is simpler and sufficient for first-party login.

## Related topics
- `http-auth-fundamentals` — access tokens and refresh tokens here follow the exact same lifecycle pattern described there; ID tokens are JWTs as covered there too.