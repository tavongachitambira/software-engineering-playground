import type { FastifyInstance } from 'fastify';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { randomUUID } from 'node:crypto';
import type { UserRole, JwtPayload } from "../../types/jwt"
import { byIpAndRoute } from '../../lib/rate-limit/identifiers';

const ALG = 'RS256';

// Dev-only keys — generate with:
//   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
//   openssl pkey -in private.pem -pubout -out public.pem
// then paste contents (with real newlines) into env vars, or read from
// disk here for a learning example. Never hardcode real keys like this
// outside a toy topic file.
const PRIVATE_KEY_PEM = process.env.JWT_PRIVATE_KEY!;
const PUBLIC_KEY_PEM = process.env.JWT_PUBLIC_KEY!;

let _privateKey: CryptoKey | undefined;
let _publicKey: CryptoKey | undefined;

async function getPrivateKey() {
  _privateKey ??= await importPKCS8(PRIVATE_KEY_PEM, ALG);
  return _privateKey;
}
async function getPublicKey() {
  _publicKey ??= await importSPKI(PUBLIC_KEY_PEM, ALG);
  return _publicKey;
}

// Toy user store — now carries role + org, not just a password
const USERS: Record<string, { password: string; role: UserRole; organizationId: string }> = {
  tavonga: { password: 'hunter2', role: 'Admin', organizationId: 'org_demo' },
  responder1: { password: 'hunter2', role: 'Responder', organizationId: 'org_demo' },
};

const refreshTokens = new Map<string, { username: string; expiresAt: number }>();
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function signAccessToken(username: string, role: UserRole, organizationId: string) {
  return new SignJWT({ role, organizationId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(username)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(await getPrivateKey());
}

function issueRefreshToken(username: string) {
  const token = randomUUID();
  refreshTokens.set(token, { username, expiresAt: Date.now() + REFRESH_TTL_MS });
  return token;
}

// Exported so the RBAC plugin can verify tokens on any route, not just
// the ones defined in this file.
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, await getPublicKey(), { algorithms: [ALG] });
  return payload as unknown as JwtPayload;
}

export default async function jwtAuthRoutes(app: FastifyInstance) {
  app.post('/login', {
    preHandler: [app.rateLimit({
    algorithm: 'sliding-window-log',
    limit: 5,
    windowMs: 60_000,
    identifier: byIpAndRoute('login'),
    keyPrefix: 'auth',
    failMode: 'closed',
  })],
  }, async (req, reply) => {
    const { username, password } = req.body as { username: string; password: string };
    const user = USERS[username];

    if (!user || user.password !== password) {
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    const accessToken = await signAccessToken(username, user.role, user.organizationId);
    const refreshToken = issueRefreshToken(username);

    return { accessToken, refreshToken };
  });

  app.get('/protected', async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing bearer token' });
      return;
    }
    try {
      const payload = await verifyAccessToken(header.slice('Bearer '.length));
      return { message: `Welcome, ${payload.sub}. Token is valid.`, claims: payload };
    } catch {
      reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });

  app.post('/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const record = refreshTokens.get(refreshToken);

    if (!record || record.expiresAt < Date.now()) {
      refreshTokens.delete(refreshToken);
      reply.code(401).send({ error: 'Invalid or expired refresh token' });
      return;
    }

    refreshTokens.delete(refreshToken); // rotation

    const user = USERS[record.username];
    const newAccessToken = await signAccessToken(record.username, user.role, user.organizationId);
    const newRefreshToken = issueRefreshToken(record.username);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  });
}