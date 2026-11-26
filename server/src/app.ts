import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DomainError, OpenCenterDb } from './db.js';
import { renderStudentPassSvg } from './qr-svg.js';

const MAX_BODY_BYTES = 262_144;
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

function resolveAllowedOrigin(req: IncomingMessage, explicitAllowed: string[]): string | null {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== 'string') return null;
  if (explicitAllowed.includes(origin)) return origin;

  const host = req.headers.host;
  if (host) {
    try {
      const parsed = new URL(origin);
      const isLoopback =
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '[::1]';
      if (isLoopback && parsed.host === host && parsed.protocol === 'http:') {
        return origin;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function buildCorsHeaders(req: IncomingMessage, explicitAllowed: string[]): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(req, explicitAllowed);
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
  extraHeaders: Record<string, string> = {}
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...buildCorsHeaders(req, explicitAllowed),
    ...extraHeaders
  });
  res.end(json);
}

function sendSvg(req: IncomingMessage, res: ServerResponse, svg: string, explicitAllowed: string[]): void {
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'no-store',
    ...buildCorsHeaders(req, explicitAllowed)
  });
  res.end(svg);
}

function sha256Equal(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function signSessionToken(role: 'admin', secret: string, ttlMs = SESSION_TTL_MS): { token: string; exp: number } {
  const exp = Date.now() + ttlMs;
  const payloadB64 = Buffer.from(JSON.stringify({ sub: 'admin', role, exp }), 'utf8').toString('base64url');
  const sigHex = createHmac('sha256', secret).update(payloadB64).digest('hex');
  return { token: `${payloadB64}.${sigHex}`, exp };
}

function verifySessionToken(token: string | undefined, secret: string): { role: 'admin'; exp: number } | null {
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
    };
    if (parsed.role !== 'admin' || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
      return null;
    }
    return { role: 'admin', exp: parsed.exp };
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
  passCode: z.string().min(3).max(32).optional()
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

const ScheduleCreateSchema = z.object({
  branchId: z.string().min(3),
  courseId: z.string().min(3),
  teacherId: z.string().min(3),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().min(3).max(10),
  endTime: z.string().min(3).max(10),
  room: z.string().max(60).optional()
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
  passCode: z.string().min(4).max(32),
  slotKey: z.string().min(2).max(64),
  notes: z.string().max(240).optional()
});

export interface OpenCenterServer extends http.Server {
  adminPassword: string;
  generatedPasswordUsed: boolean;
}

export function createOpenCenterServer(options: {
  db: OpenCenterDb;
  adminPassword?: string;
  sessionSecret?: string;
  allowedOrigins?: string[];
}): OpenCenterServer {
  const { db } = options;
  const configuredPassword = options.adminPassword || process.env.OPENCENTER_ADMIN_PASSWORD || '';
  const generatedPasswordUsed = configuredPassword.length === 0;
  const adminPassword = generatedPasswordUsed ? randomBytes(18).toString('base64url') : configuredPassword;
  const sessionSecret = options.sessionSecret || process.env.OPENCENTER_SESSION_SECRET || randomBytes(32).toString('hex');
  const explicitAllowed = (
    options.allowedOrigins ??
    (process.env.OPENCENTER_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const requireAdmin = (req: IncomingMessage): { role: 'admin'; exp: number } => {
    const authHeader = req.headers.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const cookies = parseCookies(req.headers.cookie);
    const session = verifySessionToken(bearer || cookies[SESSION_COOKIE_NAME], sessionSecret);
    if (!session) {
      throw new DomainError(401, 'UNAUTHORIZED', 'Admin authentication required.');
    }
    return session;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname;
      const method = req.method || 'GET';
      const branchIdQuery = url.searchParams.get('branchId') || undefined;

      if (method === 'OPTIONS') {
        const corsHeaders = buildCorsHeaders(req, explicitAllowed);
        if (!corsHeaders['access-control-allow-origin'] && req.headers.origin) {
          res.writeHead(403, { vary: 'Origin' });
          res.end();
          return;
        }
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      if (req.headers.origin && !resolveAllowedOrigin(req, explicitAllowed) && method !== 'GET' && method !== 'HEAD') {
        throw new DomainError(403, 'ORIGIN_NOT_ALLOWED', 'Cross-origin request blocked by CORS policy.');
      }

      if (method === 'GET' && STATIC_ALLOWLIST[pathname]) {
        const asset = STATIC_ALLOWLIST[pathname];
        const buf = resolvePublicFile(asset.file);
        if (buf) {
          res.writeHead(200, {
            'content-type': asset.contentType,
            'cache-control': 'no-store'
          });
          res.end(buf);
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/health') {
        sendJson(
          req,
          res,
          200,
          {
            ok: true,
            service: 'open-center-os',
            mode: 'sqlite-server',
            license: 'MIT',
            authRequired: true
          },
          explicitAllowed
        );
        return;
      }

      if (method === 'GET' && pathname === '/api/config') {
        sendJson(
          req,
          res,
          200,
          {
            ok: true,
            brand: 'ApexHive Labs',
            productId: 'open-center-os',
            license: 'MIT',
            supportEmail: 'apexhive.hq@proton.me',
            mode: 'sqlite-server',
            authRequired: true
          },
          explicitAllowed
        );
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/login') {
        const body = (await readJsonBody(req)) as { password?: string };
        if (!body.password || typeof body.password !== 'string' || !sha256Equal(body.password, adminPassword)) {
          throw new DomainError(401, 'INVALID_CREDENTIALS', 'Invalid admin password.');
        }
        const { token, exp } = signSessionToken('admin', sessionSecret);
        const isHttps =
          req.headers['x-forwarded-proto'] === 'https' ||
          Boolean((req.socket as { encrypted?: boolean })?.encrypted);
        const secureAttr = isHttps ? '; Secure' : '';
        const cookieVal = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureAttr}`;
        sendJson(
          req,
          res,
          200,
          { ok: true, role: 'admin', token, expiresAt: exp },
          explicitAllowed,
          { 'set-cookie': cookieVal }
        );
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/logout') {
        const isHttps =
          req.headers['x-forwarded-proto'] === 'https' ||
          Boolean((req.socket as { encrypted?: boolean })?.encrypted);
        const secureAttr = isHttps ? '; Secure' : '';
        sendJson(
          req,
          res,
          200,
          { ok: true },
          explicitAllowed,
          { 'set-cookie': `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureAttr}` }
        );
        return;
      }

      if (method === 'GET' && pathname === '/api/auth/me') {
        const authHeader = req.headers.authorization;
        const bearer =
          typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7).trim()
            : undefined;
        const cookies = parseCookies(req.headers.cookie);
        const session = verifySessionToken(bearer || cookies[SESSION_COOKIE_NAME], sessionSecret);
        sendJson(
          req,
          res,
          200,
          { ok: true, authenticated: Boolean(session), role: session?.role ?? null },
          explicitAllowed
        );
        return;
      }

      const passSvgMatch = /^\/api\/(?:pass|passes)\/([A-Za-z0-9_-]+)\.svg$/.exec(pathname);
      if (method === 'GET' && passSvgMatch) {
        const enrollment = db.getEnrollmentByPassCode(passSvgMatch[1]);
        if (!enrollment) {
          if (url.searchParams.has('student') || url.searchParams.has('credits') || url.searchParams.has('course')) {
            const svg = renderStudentPassSvg({
              passCode: passSvgMatch[1],
              studentName: url.searchParams.get('student') || 'Member',
              branchName: url.searchParams.get('branch') || 'Main Studio',
              courseTitle: url.searchParams.get('course') || '10-Lesson Package',
              remainingCredits: Number(url.searchParams.get('credits') ?? '10')
            });
            sendSvg(req, res, svg, explicitAllowed);
            return;
          }
          throw new DomainError(404, 'PASS_NOT_FOUND', 'Pass not found.');
        }
        const svg = renderStudentPassSvg({
          passCode: enrollment.passCode,
          studentName: enrollment.studentName || 'Member',
          branchName: enrollment.branchName || 'Branch',
          courseTitle: enrollment.courseTitle || 'Package',
          remainingCredits: enrollment.remainingCredits
        });
        sendSvg(req, res, svg, explicitAllowed);
        return;
      }

      const portalMatch = /^\/api\/portal\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'GET' && portalMatch) {
        const portal = db.getReadOnlyPortal(portalMatch[1]);
        if (!portal) throw new DomainError(404, 'PASS_NOT_FOUND', 'Pass not found.');
        sendJson(req, res, 200, { ok: true, portal }, explicitAllowed);
        return;
      }

      // All operational, financial, POS, CRM, timetable & PII routes require admin auth
      if (pathname.startsWith('/api/')) {
        requireAdmin(req);
      }

      if (method === 'GET' && pathname === '/api/analytics') {
        sendJson(req, res, 200, { ok: true, ...db.getAnalytics(branchIdQuery) }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/branches') {
        sendJson(req, res, 200, { ok: true, branches: db.listBranches() }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/branches') {
        const parsed = BranchInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const branch = db.createBranch(parsed.data);
        sendJson(req, res, 201, { ok: true, branch }, explicitAllowed);
        return;
      }

      const branchPatchMatch = /^\/api\/branches\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && branchPatchMatch) {
        const parsed = BranchPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const branch = db.updateBranch(branchPatchMatch[1], parsed.data);
        sendJson(req, res, 200, { ok: true, branch }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/students') {
        sendJson(req, res, 200, { ok: true, students: db.listStudents(branchIdQuery) }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/students') {
        const parsed = StudentInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const student = db.createStudent(parsed.data);
        sendJson(req, res, 201, { ok: true, student }, explicitAllowed);
        return;
      }

      const studentPatchMatch = /^\/api\/students\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && studentPatchMatch) {
        const parsed = StudentPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const student = db.updateStudent(studentPatchMatch[1], parsed.data);
        sendJson(req, res, 200, { ok: true, student }, explicitAllowed);
        return;
      }

      const ledgerMatch = /^\/api\/students\/([A-Za-z0-9_-]+)\/ledger$/.exec(pathname);
      if (method === 'GET' && ledgerMatch) {
        sendJson(req, res, 200, { ok: true, ...db.getStudentLedger(ledgerMatch[1]) }, explicitAllowed);
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
        sendJson(req, res, 200, { ok: true, ...result }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/courses') {
        sendJson(req, res, 200, { ok: true, courses: db.listCourses(branchIdQuery) }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/courses') {
        const parsed = CourseInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const course = db.createCourse(parsed.data);
        sendJson(req, res, 201, { ok: true, course }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/catalog') {
        sendJson(
          req,
          res,
          200,
          {
            ok: true,
            courses: db.listCourses(branchIdQuery),
            items: db.listCatalogItems(branchIdQuery)
          },
          explicitAllowed
        );
        return;
      }

      if (method === 'POST' && pathname === '/api/catalog') {
        const parsed = CatalogItemSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const item = db.createCatalogItem(parsed.data);
        sendJson(req, res, 201, { ok: true, item }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/enrollments') {
        const parsed = EnrollmentPosSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.createEnrollmentPos(parsed.data);
        sendJson(req, res, 201, { ok: true, ...result }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/pos/checkout') {
        const parsed = PosCheckoutSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.checkoutPosCart(parsed.data);
        sendJson(req, res, 201, { ok: true, ...result }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/leads') {
        sendJson(req, res, 200, { ok: true, leads: db.listLeads(branchIdQuery) }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/leads') {
        const parsed = LeadCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const lead = db.createLead(parsed.data);
        sendJson(req, res, 201, { ok: true, lead }, explicitAllowed);
        return;
      }

      const leadPatchMatch = /^\/api\/leads\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && leadPatchMatch) {
        const parsed = LeadPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const lead = db.updateLead(leadPatchMatch[1], parsed.data);
        sendJson(req, res, 200, { ok: true, lead }, explicitAllowed);
        return;
      }

      const leadConvertMatch = /^\/api\/leads\/([A-Za-z0-9_-]+)\/convert$/.exec(pathname);
      if (method === 'POST' && leadConvertMatch) {
        const parsed = LeadConvertSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.convertLeadToStudent(leadConvertMatch[1], parsed.data);
        sendJson(req, res, 200, { ok: true, ...result }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/schedule') {
        sendJson(req, res, 200, { ok: true, ...db.getSchedule(branchIdQuery) }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/schedule') {
        const parsed = ScheduleCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const slot = db.createTimetableSlot(parsed.data);
        sendJson(req, res, 201, { ok: true, slot }, explicitAllowed);
        return;
      }

      const schedSlotMatch = /^\/api\/schedule\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && schedSlotMatch) {
        const parsed = SchedulePatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const slot = db.updateTimetableSlot(schedSlotMatch[1], parsed.data);
        sendJson(req, res, 200, { ok: true, slot }, explicitAllowed);
        return;
      }
      if (method === 'DELETE' && schedSlotMatch) {
        db.deleteTimetableSlot(schedSlotMatch[1]);
        sendJson(req, res, 200, { ok: true }, explicitAllowed);
        return;
      }

      const schedEnrollMatch = /^\/api\/schedule\/([A-Za-z0-9_-]+)\/enroll$/.exec(pathname);
      if (method === 'POST' && schedEnrollMatch) {
        const parsed = ScheduleEnrollSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const enrolled = db.enrollStudentInSlot(schedEnrollMatch[1], parsed.data);
        sendJson(req, res, 200, { ok: true, ...enrolled }, explicitAllowed);
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
        sendJson(req, res, 200, { ok: true, ...result }, explicitAllowed);
        return;
      }

      if (method === 'POST' && pathname === '/api/checkin') {
        const parsed = CheckinSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.checkInByPass(parsed.data);
        sendJson(req, res, 200, { ok: true, ...result }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/renewals') {
        const rawThresh = Number(url.searchParams.get('threshold') || '2');
        const threshold = Number.isFinite(rawThresh) ? Math.max(0, Math.min(20, Math.floor(rawThresh))) : 2;
        sendJson(req, res, 200, { ok: true, queue: db.getRenewalQueue(threshold, branchIdQuery) }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/invoices') {
        sendJson(req, res, 200, { ok: true, invoices: db.listInvoices(branchIdQuery) }, explicitAllowed);
        return;
      }

      if (method === 'GET' && pathname === '/api/invoices/export.csv') {
        const csv = db.exportInvoicesCsv();
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="open-center-invoices.csv"',
          'cache-control': 'no-store',
          ...buildCorsHeaders(req, explicitAllowed)
        });
        res.end(csv);
        return;
      }

      const paidMatch = /^\/api\/invoices\/([A-Za-z0-9_-]+)\/pay$/.exec(pathname);
      if (method === 'POST' && paidMatch) {
        const invoice = db.markInvoicePaid(paidMatch[1]);
        sendJson(req, res, 200, { ok: true, invoice }, explicitAllowed);
        return;
      }

      const voidRefundMatch = /^\/api\/invoices\/([A-Za-z0-9_-]+)\/(void|refund)$/.exec(pathname);
      if (method === 'POST' && voidRefundMatch) {
        const targetStatus = voidRefundMatch[2] === 'refund' ? 'Refunded' : 'Voided';
        const result = db.voidOrRefundInvoice(voidRefundMatch[1], targetStatus);
        sendJson(req, res, 200, { ok: true, ...result }, explicitAllowed);
        return;
      }

      sendJson(req, res, 404, { error: 'NOT_FOUND' }, explicitAllowed);
    } catch (err) {
      if (err instanceof DomainError) {
        sendJson(req, res, err.status, { error: err.code, message: err.message }, explicitAllowed);
        return;
      }
      sendJson(req, res, 500, { error: 'INTERNAL_ERROR' }, explicitAllowed);
    }
  }) as OpenCenterServer;

  server.adminPassword = adminPassword;
  server.generatedPasswordUsed = generatedPasswordUsed;
  return server;
}
