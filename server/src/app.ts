import { existsSync, readFileSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DomainError, OpenCenterDb } from './db.js';
import {
  DEFAULT_OPEN_CENTER_PUBLIC_KEY_SPKI_B64,
  getMaxAllowedBranches,
  isMultiBranchAuthorized,
  loadActiveLicense,
  saveActivatedLicense
} from './license.js';
import { renderStudentPassSvg } from './qr-svg.js';

const MAX_BODY_BYTES = 262_144;
const __dirname = dirname(fileURLToPath(import.meta.url));
const CANDIDATE_PUBLIC_DIRS = [
  join(__dirname, '..', 'public'),
  join(__dirname, '..', '..', 'public'),
  join(__dirname, '..', '..', '..', 'storefront', 'public')
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, X-OpenCenter-License'
  });
  res.end(json);
}

function sendSvg(res: ServerResponse, svg: string): void {
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  });
  res.end(svg);
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

export function createOpenCenterServer(options: {
  db: OpenCenterDb;
  homeDir?: string;
  publicKeySpkiB64?: string;
}) {
  const { db, homeDir, publicKeySpkiB64 } = options;

  const getEffectiveLicense = (req: IncomingMessage) => {
    const headerToken = req.headers['x-opencenter-license'];
    const inlineToken = typeof headerToken === 'string' ? headerToken.trim() : undefined;
    return loadActiveLicense({ homeDir, publicKeySpkiB64, inlineToken });
  };

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': 'Content-Type, X-OpenCenter-License'
        });
        res.end();
        return;
      }

      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname;
      const method = req.method || 'GET';
      const branchIdQuery = url.searchParams.get('branchId') || undefined;

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
        const license = getEffectiveLicense(req);
        sendJson(res, 200, {
          ok: true,
          service: 'open-center-os',
          mode: 'sqlite-server',
          licenseModel: 'MIT Single-Branch Free ($0)',
          activeBranches: db.countActiveBranches(),
          maxAllowedBranches: getMaxAllowedBranches(license),
          multiBranchAuthorized: isMultiBranchAuthorized(license),
          activeLicense: license && license.valid && license.payload
            ? { tier: license.payload.tier, maxBranches: getMaxAllowedBranches(license) }
            : null
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/config') {
        sendJson(res, 200, {
          ok: true,
          brand: 'ApexHive Labs',
          productId: 'open-center-os',
          tokenPrefix: 'OPENCEN-PRO-v1.',
          licensePublicKeySpkiB64:
            publicKeySpkiB64 || process.env.OPEN_CENTER_PUBLIC_KEY || DEFAULT_OPEN_CENTER_PUBLIC_KEY_SPKI_B64,
          supportEmail: 'apexhive.hq@proton.me',
          mode: 'sqlite-server'
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/analytics') {
        sendJson(res, 200, { ok: true, ...db.getAnalytics(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/license/activate') {
        const body = (await readJsonBody(req)) as { token?: string };
        if (!body.token || typeof body.token !== 'string') {
          throw new DomainError(400, 'MISSING_TOKEN', 'Provide license token string.');
        }
        try {
          const { verification } = saveActivatedLicense(body.token, { homeDir, publicKeySpkiB64 });
          sendJson(res, 200, {
            ok: true,
            tier: verification.payload?.tier,
            maxBranches: getMaxAllowedBranches(verification),
            multiBranchAuthorized: isMultiBranchAuthorized(verification)
          });
        } catch (err) {
          throw new DomainError(403, 'INVALID_LICENSE_TOKEN', err instanceof Error ? err.message : 'Invalid token.');
        }
        return;
      }

      if (method === 'GET' && pathname === '/api/branches') {
        sendJson(res, 200, { ok: true, branches: db.listBranches() });
        return;
      }

      if (method === 'POST' && pathname === '/api/branches') {
        const parsed = BranchInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);

        const license = getEffectiveLicense(req);
        if (req.headers['x-opencenter-license'] && (!license || !license.valid)) {
          throw new DomainError(403, 'INVALID_LICENSE_TOKEN', license?.reason ?? 'Invalid license token.');
        }
        const branch = db.createBranch(parsed.data, getMaxAllowedBranches(license));
        sendJson(res, 201, { ok: true, branch });
        return;
      }

      const branchPatchMatch = /^\/api\/branches\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && branchPatchMatch) {
        const parsed = BranchPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const branch = db.updateBranch(branchPatchMatch[1], parsed.data);
        sendJson(res, 200, { ok: true, branch });
        return;
      }

      if (method === 'GET' && pathname === '/api/students') {
        sendJson(res, 200, { ok: true, students: db.listStudents(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/students') {
        const parsed = StudentInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const student = db.createStudent(parsed.data);
        sendJson(res, 201, { ok: true, student });
        return;
      }

      const studentPatchMatch = /^\/api\/students\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && studentPatchMatch) {
        const parsed = StudentPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const student = db.updateStudent(studentPatchMatch[1], parsed.data);
        sendJson(res, 200, { ok: true, student });
        return;
      }

      const ledgerMatch = /^\/api\/students\/([A-Za-z0-9_-]+)\/ledger$/.exec(pathname);
      if (method === 'GET' && ledgerMatch) {
        sendJson(res, 200, { ok: true, ...db.getStudentLedger(ledgerMatch[1]) });
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
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && pathname === '/api/courses') {
        sendJson(res, 200, { ok: true, courses: db.listCourses(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/courses') {
        const parsed = CourseInputSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const course = db.createCourse(parsed.data);
        sendJson(res, 201, { ok: true, course });
        return;
      }

      if (method === 'GET' && pathname === '/api/catalog') {
        sendJson(res, 200, {
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
        sendJson(res, 201, { ok: true, item });
        return;
      }

      if (method === 'POST' && pathname === '/api/enrollments') {
        const parsed = EnrollmentPosSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.createEnrollmentPos(parsed.data);
        sendJson(res, 201, { ok: true, ...result });
        return;
      }

      if (method === 'POST' && pathname === '/api/pos/checkout') {
        const parsed = PosCheckoutSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.checkoutPosCart(parsed.data);
        sendJson(res, 201, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && pathname === '/api/leads') {
        sendJson(res, 200, { ok: true, leads: db.listLeads(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/leads') {
        const parsed = LeadCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const lead = db.createLead(parsed.data);
        sendJson(res, 201, { ok: true, lead });
        return;
      }

      const leadPatchMatch = /^\/api\/leads\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && leadPatchMatch) {
        const parsed = LeadPatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const lead = db.updateLead(leadPatchMatch[1], parsed.data);
        sendJson(res, 200, { ok: true, lead });
        return;
      }

      const leadConvertMatch = /^\/api\/leads\/([A-Za-z0-9_-]+)\/convert$/.exec(pathname);
      if (method === 'POST' && leadConvertMatch) {
        const parsed = LeadConvertSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.convertLeadToStudent(leadConvertMatch[1], parsed.data);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && pathname === '/api/schedule') {
        sendJson(res, 200, { ok: true, ...db.getSchedule(branchIdQuery) });
        return;
      }

      if (method === 'POST' && pathname === '/api/schedule') {
        const parsed = ScheduleCreateSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const slot = db.createTimetableSlot(parsed.data);
        sendJson(res, 201, { ok: true, slot });
        return;
      }

      const schedSlotMatch = /^\/api\/schedule\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'PATCH' && schedSlotMatch) {
        const parsed = SchedulePatchSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const slot = db.updateTimetableSlot(schedSlotMatch[1], parsed.data);
        sendJson(res, 200, { ok: true, slot });
        return;
      }
      if (method === 'DELETE' && schedSlotMatch) {
        db.deleteTimetableSlot(schedSlotMatch[1]);
        sendJson(res, 200, { ok: true });
        return;
      }

      const schedEnrollMatch = /^\/api\/schedule\/([A-Za-z0-9_-]+)\/enroll$/.exec(pathname);
      if (method === 'POST' && schedEnrollMatch) {
        const parsed = ScheduleEnrollSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const enrolled = db.enrollStudentInSlot(schedEnrollMatch[1], parsed.data);
        sendJson(res, 200, { ok: true, ...enrolled });
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
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (method === 'POST' && pathname === '/api/checkin') {
        const parsed = CheckinSchema.safeParse(await readJsonBody(req));
        if (!parsed.success) throw new DomainError(400, 'INVALID_INPUT', parsed.error.message);
        const result = db.checkInByPass(parsed.data);
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && pathname === '/api/renewals') {
        const rawThresh = Number(url.searchParams.get('threshold') || '2');
        const threshold = Number.isFinite(rawThresh) ? Math.max(0, Math.min(20, Math.floor(rawThresh))) : 2;
        sendJson(res, 200, { ok: true, queue: db.getRenewalQueue(threshold, branchIdQuery) });
        return;
      }

      if (method === 'GET' && pathname === '/api/invoices') {
        sendJson(res, 200, { ok: true, invoices: db.listInvoices(branchIdQuery) });
        return;
      }

      if (method === 'GET' && pathname === '/api/invoices/export.csv') {
        const csv = db.exportInvoicesCsv();
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="open-center-invoices.csv"',
          'cache-control': 'no-store'
        });
        res.end(csv);
        return;
      }

      const paidMatch = /^\/api\/invoices\/([A-Za-z0-9_-]+)\/pay$/.exec(pathname);
      if (method === 'POST' && paidMatch) {
        const invoice = db.markInvoicePaid(paidMatch[1]);
        sendJson(res, 200, { ok: true, invoice });
        return;
      }

      const voidRefundMatch = /^\/api\/invoices\/([A-Za-z0-9_-]+)\/(void|refund)$/.exec(pathname);
      if (method === 'POST' && voidRefundMatch) {
        const targetStatus = voidRefundMatch[2] === 'refund' ? 'Refunded' : 'Voided';
        const result = db.voidOrRefundInvoice(voidRefundMatch[1], targetStatus);
        sendJson(res, 200, { ok: true, ...result });
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
            sendSvg(res, svg);
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
        sendSvg(res, svg);
        return;
      }

      const portalMatch = /^\/api\/portal\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (method === 'GET' && portalMatch) {
        const portal = db.getReadOnlyPortal(portalMatch[1]);
        if (!portal) throw new DomainError(404, 'PASS_NOT_FOUND', 'Pass not found.');
        sendJson(res, 200, { ok: true, portal });
        return;
      }

      sendJson(res, 404, { error: 'NOT_FOUND' });
    } catch (err) {
      if (err instanceof DomainError) {
        sendJson(res, err.status, { error: err.code, message: err.message });
        return;
      }
      sendJson(res, 500, { error: 'INTERNAL_ERROR' });
    }
  });
}
