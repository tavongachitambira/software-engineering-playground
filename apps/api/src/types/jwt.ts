export type UserRole = 'Admin' | 'Responder' | 'Viewer';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  organizationId: string;
  jti: string;
  iat: number;
  exp: number;
}