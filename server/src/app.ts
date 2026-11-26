import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DomainError, OpenCenterDb } from './db.js';
import { renderStudentPassSvg } from './qr-svg.js';

const MAX_BODY_BYTES = 262_144;
const DEFAULT_MAX_RATE_LIMIT_ENTRIES = 10_000;
const SESSION_COOKIE_NAME = 'oc_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CANDIDATE_PUBLIC_DIRS = [
  join(__dirname, '..', 'public'),
  join(__dirname, '..', '..', 'public')
];

const STATIC_ALLOWLIST: Record<string, { file: string; contentType: string }> = {
  '/': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', contentType: 'application/javascript; charset=utf-8' },
  '/favicon.svg': { file: 'favicon.svg', contentType: 'image/svg+xml; charset=utf-8' },
  '/favicon.ico': { file: 'favicon.svg', contentType: 'image/svg+xml; charset=utf-8' }
};

function resolvePublicFile(fileName: string): Buffer | null {
  for (const dir of CANDIDATE_PUBLIC_DIRS) {
    const full = join(dir, fileName);
    if (existsSync(full)) {
      return readFileSync(full);
    }
  }
  return null;
}

function buildSecurityHeaders(kind: 'html' | 'api' | 'svg' | 'asset'): Record<string, string> {
  const csp =
    kind === 'html'
      ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
      : kind === 'asset'
        ? "default-src 'none'; frame-ancestors 'none'"
        : "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
  return {
    'content-security-policy': csp,
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  };
}

function resolveAllowedOrigin(req: IncomingMessage, explicitAllowed: string[], trustProxy: boolean, trustedProxyHops = 1): string | null {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== 'string') return null;
  if (explicitAllowed.includes(origin)) return origin;

  const host = req.headers.host;
  if (host) {
    try {
      const parsed = new URL(origin);
      const expectedProto = isHttpsRequest(req, trustProxy, trustedProxyHops) ? 'https:' : 'http:';
      if (parsed.host.toLowerCase() === host.toLowerCase() && parsed.protocol === expectedProto) {
        return origin;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function buildCorsHeaders(
  req: IncomingMessage,
  explicitAllowed: string[],
  trustProxy: boolean,
  trustedProxyHops = 1
): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(req, explicitAllowed, trustProxy, trustedProxyHops);
  if (!allowedOrigin) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    vary: 'Origin'
  };
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
  explicitAllowed: string[],
  trustProxy: boolean,
  trustedProxyHops: number,
  extraHeaders: Record<string, string> = {}
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...buildSecurityHeaders('api'),
    ...buildCorsHeaders(req, explicitAllowed, trustProxy, trustedProxyHops),
    ...extraHeaders
  });
  res.end(json);
}

function sendSvg(
  req: IncomingMessage,
  res: ServerResponse,
  svg: string,
  explicitAllowed: string[],
  trustProxy: boolean,
  trustedProxyHops: number
): void {
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'no-store',
    ...buildSecurityHeaders('svg'),
    ...buildCorsHeaders(req, explicitAllowed, trustProxy, trustedProxyHops)
  });
  res.end(svg);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function getClientIp(req: IncomingMessage, trustProxy: boolean, trustedProxyHops = 1): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
      if (hops.length > 0) {
        const idx = Math.max(0, hops.length - Math.max(1, trustedProxyHops));
        return hops[idx];
      }
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isHttpsRequest(req: IncomingMessage, trustProxy: boolean, trustedProxyHops = 1): boolean {
  if (Boolean((req.socket as { encrypted?: boolean })?.encrypted)) {
    return true;
  }
  if (!trustProxy) return false;
  const xfProto = req.headers['x-forwarded-proto'];
  if (typeof xfProto !== 'string') return false;
  const hops = xfProto.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (hops.length === 0) return false;
  const idx = Math.max(0, hops.length - Math.max(1, trustedProxyHops));
  return hops[idx] === 'https';
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      // Ignore malformed percent-encoding instead of crashing with URIError
      out[k] = v;
    }
  }
  return out;
}

function signSessionToken(
  username: string,
  role: 'admin',
  secret: string,
  ttlMs = SESSION_TTL_MS
): { token: string; jti: string; exp: number } {
  const exp = Date.now() + ttlMs;
  const jti = randomBytes(16).toString('hex');
  const payloadB64 = Buffer.from(JSON.stringify({ sub: username, role, jti, exp }), 'utf8').toString('base64url');
  const sigHex = createHmac('sha256', secret).update(payloadB64).digest('hex');
  return { token: `${payloadB64}.${sigHex}`, jti, exp };
}

function verifySessionToken(
  token: string | undefined,
  secret: string,
  db: OpenCenterDb
): { role: 'admin'; exp: number; jti: string } | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/i.test(sigHex)) return null;
  const expected = createHmac('sha256', secret).update(payloadB64).digest();
  const actual = Buffer.from(sigHex, 'hex');
  if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      role?: string;
      exp?: number;
      jti?: string;
    };
    if (
      parsed.role !== 'admin' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now() ||
      typeof parsed.jti !== 'string' ||
      !parsed.jti
    ) {
      return null;
    }
    if (!db.isSessionActive(parsed.jti, sha256Hex(token))) {
      return null;
    }
    return { role: 'admin', exp: parsed.exp, jti: parsed.jti };
  } catch {
    return null;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new DomainError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 256 KB limit.');
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

const BranchInputSchema = z.object({
  code: z.string().min(2).max(24),
  name: z.string().min(1).max(120),
  nameZh: z.string().max(120).optional(),
  address: z.string().max(240).optional(),
  currency: z.string().min(3).max(6).optional()
});

const BranchPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  nameZh: z.string().max(120).optional(),
  address: z.string().max(240).optional(),
  currency: z.string().min(3).max(6).optional()
});

const StudentPatchSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  fullNameZh: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  guardianName: z.string().max(120).optional()
});

const SchedulePatchSchema = z.object({
  courseId: z.string().min(3).optional(),
  teacherId: z.string().min(3).optional(),
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  startTime: z.string().min(3).max(10).optional(),
  endTime: z.string().min(3).max(10).optional(),
  room: z.string().max(60).optional()
});

const ScheduleEnrollSchema = z.object({
  enrollmentId: z.string().min(3).optional(),
  passCode: z.string().min(3).max(64).optional()
});

const StudentInputSchema = z.object({
  branchId: z.string().min(3),
  fullName: z.string().min(1).max(120),
  fullNameZh: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  guardianName: z.string().max(120).optional()
});

const CourseInputSchema = z.object({
  branchId: z.string().min(3),
  title: z.string().min(1).max(120),
  titleZh: z.string().max(120).optional(),
  category: z.enum(['education', 'studio']).optional(),
  defaultCredits: z.number().int().positive().max(500),
  priceCents: z.number().int().min(0),
  currency: z.string().min(3).max(6).optional()
});

const CatalogItemSchema = z.object({
  branchId: z.string().min(3),
  sku: z.string().max(32).optional(),
  title: z.string().min(1).max(120),
  titleZh: z.string().max(120).optional(),
  kind: z.enum(['course', 'material']),
  defaultCredits: z.number().int().min(0).max(500).optional(),
  priceCents: z.number().int().min(0),
  currency: z.string().min(3).max(6).optional()
});

const EnrollmentPosSchema = z.object({
  branchId: z.string().min(3),
  studentId: z.string().min(3),
  courseId: z.string().min(3),
  credits: z.number().int().positive().max(500).optional(),
  amountCents: z.number().int().min(0).optional(),
  paymentMethod: z.enum(['cash', 'fps', 'card', 'usdc', 'bank']).optional(),
  paymentStatus: z.enum(['Paid', 'Pending']).optional(),
  issuedDate: z.string().optional()
});

const PosCheckoutSchema = z.object({
  branchId: z.string().min(3),
  studentId: z.string().min(3),
  items: z
    .array(
      z.object({
        courseId: z.string().optional(),
        title: z.string().min(1).max(120),
        titleZh: z.string().max(120).optional(),
        kind: z.enum(['course', 'material']),
        qty: z.number().int().positive().max(100),
        unitPriceCents: z.number().int().min(0),
        creditsPerUnit: z.number().int().positive().max(500).optional()
      })
    )
    .min(1)
    .max(50),
  discountType: z.enum(['fixed', 'percent']).optional(),
  discountValue: z.number().min(0).optional(),
  paymentMethod: z.enum(['cash', 'fps', 'card', 'usdc', 'bank']).optional(),
  paymentStatus: z.enum(['Paid', 'Pending']).optional(),
  issuedDate: z.string().optional()
});

const LeadCreateSchema = z.object({
  branchId: z.string().min(3),
  fullName: z.string().min(1).max(120),
  fullNameZh: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  source: z.string().max(60).optional(),
  interestedCourse: z.string().max(120).optional(),
  stage: z.enum(['Inquiry', 'Trial Scheduled', 'Trial Done', 'Enrolled']).optional(),
  trialDate: z.string().max(32).optional(),
  notes: z.string().max(500).optional()
});

const LeadPatchSchema = z.object({
  stage: z.enum(['Inquiry', 'Trial Scheduled', 'Trial Done', 'Enrolled']).optional(),
  trialDate: z.string().max(32).optional(),
  notes: z.string().max(500).optional(),
  interestedCourse: z.string().max(120).optional()
});

const LeadConvertSchema = z.object({
  courseId: z.string().min(3).optional(),
  paymentMethod: z.enum(['cash', 'fps', 'card', 'usdc', 'bank']).optional()
});

const ScheduleCreateSchema = z
  .object({
    branchId: z.string().min(3),
    courseId: z.string().min(3).optional(),
    courseTitle: z.string().min(1).max(120).optional(),
    teacherId: z.string().min(3).optional(),
    teacherName: z.string().min(1).max(120).optional(),
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: z.string().min(3).max(10),
    endTime: z.string().min(3).max(10),
    room: z.string().max(60).optional()
  })
  .refine((d) => Boolean(d.courseId || d.courseTitle), { message: 'courseId or courseTitle is required.' })
  .refine((d) => Boolean(d.teacherId || d.teacherName), { message: 'teacherId or teacherName is required.' });

const TeacherCreateSchema = z.object({
  branchId: z.string().min(3),
  fullName: z.string().min(1).max(120),
  fullNameZh: z.string().max(120).optional(),
  specialty: z.string().max(120).optional()
});

const ScheduleAttendanceSchema = z.object({
  passCode: z.string().optional(),
  enrollmentId: z.string().optional(),
  slotKey: z.string().min(2).max(64),
  status: z.enum(['Present', 'Absent', 'Makeup']),
  notes: z.string().max(240).optional()
});

const CreditAdjustSchema = z.object({
  enrollmentId: z.string().min(3),
  delta: z.number().int().min(-100).max(100),
  reason: z.string().min(1).max(200)
});

const CheckinSchema = z.object({
  passCode: z.string().min(4).max(64),
  slotKey: z.string().min(2).max(64),
  notes: z.string().max(240).optional()
});

export interface OpenCenterServer extends http.Server {
  adminPassword: string;
  generatedPasswordUsed: boolean;
  rateLimitCounts: () => { login: number; portal: number };
}

export function createOpenCenterServer(options: {
  db: OpenCenterDb;
  adminPassword?: string;
  sessionSecret?: string;
  allowedOrigins?: string[];
  trustProxy?: boolean;
  trustedProxyHops?: number;
  rateLimit?: {
    loginMaxFailures?: number;
    loginWindowMs?: number;
    loginBaseLockMs?: number;
    portalMaxRequests?: number;
    portalWindowMs?: number;
    maxEntries?: number;
  };
}): OpenCenterServer {
  const { db } = options;
  const configuredPassword = options.adminPassword || process.env.OPENCENTER_ADMIN_PASSWORD || '';
  const generatedPasswordUsed = configuredPassword.length === 0;
  const adminPassword = generatedPasswordUsed ? randomBytes(18).toString('base64url') : configuredPassword;
  const sessionSecret = options.sessionSecret || process.env.OPENCENTER_SESSION_SECRET || randomBytes(32).toString('hex');
  const trustProxy = options.trustProxy ?? (process.env.TRUST_PROXY === 'true');
  const parsedHops = Number(options.trustedProxyHops ?? process.env.TRUSTED_PROXY_HOPS ?? '1');
  const trustedProxyHops = Number.isFinite(parsedHops) && parsedHops >= 1 ? Math.floor(parsedHops) : 1;
  const explicitAllowed = (
    options.allowedOrigins ??
    (process.env.OPENCENTER_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const loginMaxFailures = options.rateLimit?.loginMaxFailures ?? 5;
  const loginWindowMs = options.rateLimit?.loginWindowMs ?? 15 * 60_000;
  const loginBaseLockMs = options.rateLimit?.loginBaseLockMs ?? 30_000;
  const portalMaxRequests = options.rateLimit?.portalMaxRequests ?? 60;
  const portalWindowMs = options.rateLimit?.portalWindowMs ?? 60_000;
  const maxRateLimitEntries = Math.max(2, options.rateLimit?.maxEntries ?? DEFAULT_MAX_RATE_LIMIT_ENTRIES);

  const loginAttempts = new Map<string, { failures: number; windowStart: number; lockedUntil: number }>();
  const portalRequests = new Map<string, { count: number; windowStart: number }>();

  const pruneAndCapMap = <T>(
    map: Map<string, T>,
    isExpired: (val: T) => boolean,
    incomingKey: string
  ): void => {
    if (map.size >= maxRateLimitEntries && !map.has(incomingKey)) {
      for (const [k, v] of map.entries()) {
        if (isExpired(v)) {
          map.delete(k);
        }
      }
      while (map.size >= maxRateLimitEntries) {
        const oldestKey = map.keys().next().value;
        if (oldestKey === undefined) break;
        map.delete(oldestKey);
      }
    }
  };

  db.upsertAdminPasswordSync('admin', adminPassword);

  const checkLoginRateLimit = (ip: string, username: string): number | null => {
    const now = Date.now();
    for (const key of [`${ip}::${username}`, `ip:${ip}`]) {
      const entry = loginAttempts.get(key);
      if (!entry) continue;
      if (entry.lockedUntil > now) {
        return Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000));
      }
      if (now - entry.windowStart > loginWindowMs) {
        loginAttempts.delete(key);
      }
    }
    return null;
  };

  const recordLoginFailure = (ip: string, username: string): void => {
    const now = Date.now();
    const bump = (key: string, maxFailures: number) => {
      const prev = loginAttempts.get(key);
      const entry = !prev || now - prev.windowStart > loginWindowMs
        ? { failures: 0, windowStart: now, lockedUntil: 0 }
        : prev;
      entry.failures += 1;
      if (entry.failures >= maxFailures) {
        const backoff = Math.min(15 * 60_000, loginBaseLockMs * 2 ** (entry.failures - maxFailures));
        entry.lockedUntil = now + backoff;
      }
      pruneAndCapMap(
        loginAttempts,
        (v) => v.lockedUntil <= now && now - v.windowStart > loginWindowMs,
        key
      );
      loginAttempts.delete(key);
      loginAttempts.set(key, entry);
    };
    bump(`${ip}::${username}`, loginMaxFailures);
    bump(`ip:${ip}`, loginMaxFailures * 3);
  };

  const clearLoginFailures = (ip: string, username: string): void => {
    loginAttempts.delete(`${ip}::${username}`);
  };

  const enforcePortalRateLimit = (req: IncomingMessage): void => {
    const now = Date.now();
    const ip = getClientIp(req, trustProxy, trustedProxyHops);
    const prev = portalRequests.get(ip);
    const entry = !prev || now - prev.windowStart >= portalWindowMs
      ? { count: 0, windowStart: now }
      : prev;
    entry.count += 1;
    pruneAndCapMap(
      portalRequests,
      (v) => now - v.windowStart >= portalWindowMs,
      ip
    );
    portalRequests.delete(ip);
    portalRequests.set(ip, entry);
    if (entry.count > portalMaxRequests) {
      const retryAfter = Math.max(1, Math.ceil((entry.windowStart + portalWindowMs - now) / 1000));
      throw new DomainError(429, 'RATE_LIMITED', `Too many requests. Retry after ${retryAfter}s.`, {
        'retry-after': String(retryAfter)
      });
    }
  };

  const extractSessionToken = (req: IncomingMessage): string | undefined => {
    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const cookies = parseCookies(req.headers.cookie);
    return bearer || cookies[SESSION_COOKIE_NAME];
  };

  const requireAdmin = (req: IncomingMessage): { role: 'admin'; exp: number; jti: string } => {
    const session = verifySessionToken(extractSessionToken(req), sessionSecret, db);
    if (!session) {
      throw new DomainError(401, 'UNAUTHORIZED', 'Admin authentication required.');
    }
    return session;
  };

  const server = http.createServer(async (req, res) => {
    const jsonReply = (status: number, body: unknown, extraHeaders?: Record<string, string>) => {
      sendJson(req, res, status, body, explicitAllowed, trustProxy, trustedProxyHops, extraHeaders);
    };
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname;
      const method = req.method || 'GET';
      const branchIdQuery = url.searchParams.get('branchId') || undefined;

      if (method === 'OPTIONS') {
        const corsHeaders = buildCorsHeaders(req, explicitAllowed, trustProxy, trustedProxyHops);
        if (!corsHeaders['access-control-allow-origin'] && req.headers.origin) {
          res.writeHead(403, { ...buildSecurityHeaders('api'), vary: 'Origin' });
          res.end();
          return;
        }
        res.writeHead(204, { ...buildSecurityHeaders('api'), ...corsHeaders });
        res.end();
        return;
      }

      if (
        req.headers.origin &&
        !resolveAllowedOrigin(req, explicitAllowed, trustProxy, trustedProxyHops) &&
        method !== 'GET' &&
        method !== 'HEAD'
      ) {
        throw new DomainError(403, 'ORIGIN_NOT_ALLOWED', 'Cross-origin request blocked by CORS policy.');
      }

      if (method === 'GET' && STATIC_ALLOWLIST[pathname]) {
        const asset = STATIC_ALLOWLIST[pathname];
        const buf = resolvePublicFile(asset.file);
        if (buf) {
          const secKind = asset.file.endsWith('.html') ? 'html' : asset.file.endsWith('.svg') ? 'svg' : 'asset';
          res.writeHead(200, {
            'content-type': asset.contentType,
            'cache-control': 'no-store',
            ...buildSecurityHeaders(secKind)
          });
          res.end(buf);
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/health') {
        jsonReply(200, {
          ok: true,
          service: 'open-center-os',
          mode: 'sqlite-server',
          license: 'MIT',
          authRequired: true
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/config') {
        jsonReply(200, {
          ok: true,
          brand: 'ApexHive Labs',
          productId: 'open-center-os',
          license: 'MIT',
          supportEmail: 'apexhive.hq@proton.me',
          mode: 'sqlite-server',
          authRequired: true
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/login') {
        const body = (await readJsonBody(req)) as { username?: string; password?: string };
        const username =
          typeof body.username === 'string' && body.username.trim()
            ? body.username.trim().toLowerCase()
            : 'admin';
        const clientIp = getClientIp(req, trustProxy, trustedProxyHops);
        const lockedSeconds = checkLoginRateLimit(clientIp, username);
        if (lockedSeconds !== null) {
          jsonReply(
            429,
            {
              error: 'LOGIN_RATE_LIMITED',
              message: `Too many failed login attempts. Retry in ${lockedSeconds}s.`,
              retryAfterSeconds: lockedSeconds
            },
            { 'retry-after': String(lockedSeconds) }
          );
          return;
        }
        const valid =
          typeof body.password === 'string' &&
          body.password.length > 0 &&
          (await db.verifyAdminLogin(username, body.password));
        if (!valid) {
          recordLoginFailure(clientIp, username);
          throw new DomainError(401, 'INVALID_CREDENTIALS', 'Invalid admin password.');
        }
        clearLoginFailures(clientIp, username);
        const { token, jti, exp } = signSessionToken(username, 'admin', sessionSecret);
        db.createSession({
          id: jti,
          tokenHash: sha256Hex(token),
          username,
          role: 'admin',
          expiresAt: exp
        });
        const secureAttr = isHttpsRequest(req, trustProxy, trustedProxyHops) ? '; Secure' : '';
        const cookieVal = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureAttr}`;
        jsonReply(200, { ok: true, role: 'admin', token, expiresAt: exp }, { 'set-cookie': cookieVal });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/logout') {
        const authHeader = req.headers.authorization;
        const bearer =
          typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7).trim()
            : undefined;
        const cookies = parseCookies(req.headers.cookie);
        for (const t of [bearer, cookies[SESSION_COOKIE_NAME]]) {
          if (t) db.revokeSessionByTokenHash(sha256Hex(t));
        }
        const secureAttr = isHttpsRequest(req, trustProxy, trustedProxyHops) ? '; Secure' : '';
        jsonReply(
          200,
          { ok: true },
          { 'set-cookie': `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureAttr}` }
        );
        return;
      }

      if (method === 'GET' && pathname === '/api/auth/me') {
        const session = verifySessionToken(extractSessionToken(req), sessionSecret, db);
        jsonReply(200, { ok: true, authenticated: Boolean(session), role: session?.role ?? null });
        return;
      }

      const passSvgMatch = /^\/api\/(?:pass|passes)\/([A-Za-z0-9_-]+)\.svg$/.exec(pathname);
      if (method === 'GET' && passSvgMatch) {
        enforcePortalRateLimit(req);
        const enrollment = db.getEnrollmentByPassCode(passSvgMatch[1]);
        if (!enrollment) {
          throw new DomainError(404, 'PASS_NOT_FOUND', 'Pass not found.');
        }
        const svg = renderStudentPassSvg({
          passCode: enrollment.passCode,
          studentName: enrollment.studentName || 'Member',
          branchName: enrollment.branchName || 'Branch',
          courseTitle: enrollment.courseTitle || 'Package',
          remainingCredits: enrollment.remainingCredits
        });
        sendSvg(req, res, svg, explicitAllowed, trustProxy, trustedProxyHops);
        return;
      }

      const portalMatch = /^\/api\/portal\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'GET' && portalMatch) {
        enforcePortalRateLimit(req);
        const portal = db.getReadOnlyPortal(portalMatch[1]);
        if (!portal) throw new DomainError(404, 'PASS_NOT_FOUND', 'Pass not found.');
        jsonReply(200, { ok: true, portal });
        return;
      }

      // All operational, financial, POS, CRM, timetable & PII routes require admin auth
      if (pathname.startsWith('/api/')) {
        requireAdmin(req);
      }

      if (method === 'GET' && pathname === '/api/analytics') {
        jsonReply(200, { ok: true, ...db.getAnalytics(branchIdQuery) });
        return;
      }

      if (method === 'GET' && pathname === '/api/branches') {
        jsonReply(200, { ok: true, branches: db.listBranches() });
        return;
      }

      if (method === 'POST' && pathname === '/api/branches') {
        const parsed = BranchInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const branch = db.createBranch(parsed.data);
        jsonReply(201, { ok: true, branch });
        return;
      }

      const branchPatchMatch = /^\/api\/branches\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && branchPatchMatch) {
        const parsed = BranchPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const branch = db.updateBranch(branchPatchMatch[1], parsed.data);
        jsonReply(200, { ok: true, branch });
        return;
      }

      if (method === 'GET' && pathname === '/api/students') {
        jsonReply(200, { ok: true, students: db.listStudents(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/students') {
        const parsed = StudentInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const student = db.createStudent(parsed.data);
        jsonReply(201, { ok: true, student });
        return;
      }

      const studentPatchMatch = /^\/api\/students\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && studentPatchMatch) {
        const parsed = StudentPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const student = db.updateStudent(studentPatchMatch[1], parsed.data);
        jsonReply(200, { ok: true, student });
        return;
      }

      const ledgerMatch = /^\/api\/students\/([A-Za-z0-9_-]+)\/ledger$/.exec(pathname);
      if (method === 'GET' && ledgerMatch) {
        jsonReply(200, { ok: true, ...db.getStudentLedger(ledgerMatch[1]) });
        return;
      }

      const adjustMatch = /^\/api\/students\/([A-Za-z0-9_-]+)\/adjust$/.exec(pathname);
      if (method === 'POST' && adjustMatch) {
        const parsed = CreditAdjustSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.adjustStudentCredits({
          studentId: adjustMatch[1],
          ...parsed.data
        });
        jsonReply(200, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && pathname === '/api/courses') {
        jsonReply(200, { ok: true, courses: db.listCourses(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/courses') {
        const parsed = CourseInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const course = db.createCourse(parsed.data);
        jsonReply(201, { ok: true, course });
        return;
      }

      if (method === 'GET' && pathname === '/api/catalog') {
        jsonReply(200, {
          ok: true,
          courses: db.listCourses(branchIdQuery),
          items: db.listCatalogItems(branchIdQuery)
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/catalog') {
        const parsed = CatalogItemSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const item = db.createCatalogItem(parsed.data);
        jsonReply(201, { ok: true, item });
        return;
      }

      if (method === 'POST' && pathname === '/api/enrollments') {
        const parsed = EnrollmentPosSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.createEnrollmentPos(parsed.data);
        jsonReply(201, { ok: true, ...result });
        return;
      }

      if (method === 'POST' && pathname === '/api/pos/checkout') {
        const parsed = PosCheckoutSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.checkoutPosCart(parsed.data);
        jsonReply(201, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && pathname === '/api/leads') {
        jsonReply(200, { ok: true, leads: db.listLeads(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/leads') {
        const parsed = LeadCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const lead = db.createLead(parsed.data);
        jsonReply(201, { ok: true, lead });
        return;
      }

      const leadPatchMatch = /^\/api\/leads\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && leadPatchMatch) {
        const parsed = LeadPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const lead = db.updateLead(leadPatchMatch[1], parsed.data);
        jsonReply(200, { ok: true, lead });
        return;
      }

      const leadConvertMatch = /^\/api\/leads\/([A-Za-z0-9_-]+)\/convert$/.exec(pathname);
      if (method === 'POST' && leadConvertMatch) {
        const parsed = LeadConvertSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.convertLeadToStudent(leadConvertMatch[1], parsed.data);
        jsonReply(200, { ok: true, ...result });
        return;
      }

      if (method === 'POST' && pathname === '/api/teachers') {
        const parsed = TeacherCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const teacher = db.createTeacher(parsed.data);
        jsonReply(201, { ok: true, teacher });
        return;
      }

      if (method === 'GET' && pathname === '/api/schedule') {
        jsonReply(200, { ok: true, ...db.getSchedule(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/schedule') {
        const parsed = ScheduleCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const { branchId, dayOfWeek, startTime, endTime, room } = parsed.data;
        let courseId = parsed.data.courseId;
        if (!courseId && parsed.data.courseTitle) {
          const existingCourse = db.findCourseByTitle(branchId, parsed.data.courseTitle);
          courseId = existingCourse
            ? existingCourse.id
            : db.createCourse({
                branchId,
                title: parsed.data.courseTitle,
                defaultCredits: 10,
                priceCents: 0
              }).id;
        }
        let teacherId = parsed.data.teacherId;
        if (!teacherId && parsed.data.teacherName) {
          const existingTeacher = db.findTeacherByName(branchId, parsed.data.teacherName);
          teacherId = existingTeacher
            ? existingTeacher.id
            : db.createTeacher({
                branchId,
                fullName: parsed.data.teacherName
              }).id;
        }
        const slot = db.createTimetableSlot({
          branchId,
          courseId: courseId!,
          teacherId: teacherId!,
          dayOfWeek,
          startTime,
          endTime,
          room
        });
        jsonReply(201, { ok: true, slot });
        return;
      }

      const schedSlotMatch = /^\/api\/schedule\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && schedSlotMatch) {
        const parsed = SchedulePatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const slot = db.updateTimetableSlot(schedSlotMatch[1], parsed.data);
        jsonReply(200, { ok: true, slot });
        return;
      }
      if (method === 'DELETE' && schedSlotMatch) {
        db.deleteTimetableSlot(schedSlotMatch[1]);
        jsonReply(200, { ok: true });
        return;
      }

      const schedEnrollMatch = /^\/api\/schedule\/([A-Za-z0-9_-]+)\/enroll$/.exec(pathname);
      if (method === 'POST' && schedEnrollMatch) {
        const parsed = ScheduleEnrollSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const enrolled = db.enrollStudentInSlot(schedEnrollMatch[1], parsed.data);
        jsonReply(200, { ok: true, ...enrolled });
        return;
      }

      const schedAttMatch = /^\/api\/schedule\/([A-Za-z0-9_-]+)\/attendance$/.exec(pathname);
      if (method === 'POST' && schedAttMatch) {
        const parsed = ScheduleAttendanceSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.markScheduleAttendance({
          timetableSlotId: schedAttMatch[1],
          ...parsed.data
        });
        jsonReply(200, { ok: true, ...result });
        return;
      }

      if (method === 'POST' && pathname === '/api/checkin') {
        const parsed = CheckinSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.checkInByPass(parsed.data);
        jsonReply(200, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && pathname === '/api/renewals') {
        const rawThresh = Number(url.searchParams.get('threshold') || '2');
        const threshold = Number.isFinite(rawThresh) ? Math.max(0, Math.min(20, Math.floor(rawThresh))) : 2;
        jsonReply(200, { ok: true, queue: db.getRenewalQueue(threshold, branchIdQuery) });
        return;
      }

      if (method === 'GET' && pathname === '/api/invoices') {
        jsonReply(200, { ok: true, invoices: db.listInvoices(branchIdQuery) });
        return;
      }

      if (method === 'GET' && pathname === '/api/invoices/export.csv') {
        const csv = db.exportInvoicesCsv(branchIdQuery);
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="open-center-invoices.csv"',
          'cache-control': 'no-store',
          ...buildSecurityHeaders('api'),
          ...buildCorsHeaders(req, explicitAllowed, trustProxy, trustedProxyHops)
        });
        res.end(csv);
        return;
      }

      const paidMatch = /^\/api\/invoices\/([A-Za-z0-9_-]+)\/pay$/.exec(pathname);
      if (method === 'POST' && paidMatch) {
        const invoice = db.markInvoicePaid(paidMatch[1]);
        jsonReply(200, { ok: true, invoice });
        return;
      }

      const voidRefundMatch = /^\/api\/invoices\/([A-Za-z0-9_-]+)\/(void|refund)$/.exec(pathname);
      if (method === 'POST' && voidRefundMatch) {
        const targetStatus = voidRefundMatch[2] === 'refund' ? 'Refunded' : 'Voided';
        const result = db.voidOrRefundInvoice(voidRefundMatch[1], targetStatus);
        jsonReply(200, { ok: true, ...result });
        return;
      }

      jsonReply(404, { error: 'NOT_FOUND' });
    } catch (err) {
      if (err instanceof DomainError) {
        sendJson(req, res, err.status, { error: err.code, message: err.message }, explicitAllowed, trustProxy, trustedProxyHops, err.headers);
        return;
      }
      sendJson(req, res, 500, { error: 'INTERNAL_ERROR' }, explicitAllowed, trustProxy, trustedProxyHops);
    }
  }) as OpenCenterServer;

  server.adminPassword = adminPassword;
  server.generatedPasswordUsed = generatedPasswordUsed;
  server.rateLimitCounts = () => ({ login: loginAttempts.size, portal: portalRequests.size });
  return server;
}
