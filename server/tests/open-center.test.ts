import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOpenCenterServer } from '../src/app.js';
import { OpenCenterDb } from '../src/db.js';
import { renderStudentPassSvg } from '../src/qr-svg.js';
import { seedDemoData } from '../src/seed.js';

const TEST_ADMIN_PASSWORD = 'test-admin-secret-2026';

async function withServer(
  fn: (ctx: {
    baseUrl: string;
    db: OpenCenterDb;
    authHeaders: Record<string, string>;
    cookieHeader: string;
  }) => Promise<void>
) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-center-v22-'));
  const dbPath = path.join(tmpDir, 'center.sqlite');

  const db = new OpenCenterDb(dbPath);
  const server = createOpenCenterServer({
    db,
    adminPassword: TEST_ADMIN_PASSWORD,
    allowedOrigins: ['https://trusted.open-center.local']
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: TEST_ADMIN_PASSWORD })
  });
  assert.equal(loginRes.status, 200);
  const loginJson = (await loginRes.json()) as { ok: boolean; token: string };
  assert.equal(loginJson.ok, true);
  const setCookie = loginRes.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('SameSite=Lax'));
  const cookieHeader = setCookie.split(';')[0] || '';
  const authHeaders = {
    'content-type': 'application/json',
    authorization: `Bearer ${loginJson.token}`
  };

  try {
    await fn({ baseUrl, db, authHeaders, cookieHeader });
  } finally {
    server.close();
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test('1. Enforces admin auth (401 unauthenticated), strict CORS (zero wildcard *), and free unlimited MIT multi-branch', async () => {
  await withServer(async ({ baseUrl, authHeaders, cookieHeader }) => {
    // Wrong password rejected with 401
    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' })
    });
    assert.equal(badLogin.status, 401);

    // Every PII / POS / ledger / branch endpoint rejects unauthenticated requests with 401
    for (const [method, endpoint] of [
      ['GET', '/api/branches'],
      ['POST', '/api/branches'],
      ['GET', '/api/students'],
      ['GET', '/api/leads'],
      ['GET', '/api/invoices'],
      ['GET', '/api/invoices/export.csv'],
      ['GET', '/api/analytics'],
      ['POST', '/api/pos/checkout']
    ] as const) {
      const unauth = await fetch(`${baseUrl}${endpoint}`, {
        method,
        ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {})
      });
      assert.equal(unauth.status, 401, `Expected 401 for unauthenticated ${method} ${endpoint}`);
    }

    // Disallowed cross-origin never gets Access-Control-Allow-Origin: * and mutating request returns 403
    const evilGet = await fetch(`${baseUrl}/api/health`, {
      headers: { origin: 'https://evil.example' }
    });
    assert.equal(evilGet.status, 200);
    assert.equal(evilGet.headers.get('access-control-allow-origin'), null);

    const evilMutate = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { ...authHeaders, origin: 'https://evil.example' },
      body: JSON.stringify({ code: 'EVL', name: 'Evil' })
    });
    assert.equal(evilMutate.status, 403);

    // Explicitly allowed origin receives exact reflected CORS header (not *)
    const trustedPreflight = await fetch(`${baseUrl}/api/branches`, {
      method: 'OPTIONS',
      headers: { origin: 'https://trusted.open-center.local' }
    });
    assert.equal(trustedPreflight.status, 204);
    assert.equal(trustedPreflight.headers.get('access-control-allow-origin'), 'https://trusted.open-center.local');

    // Cookie auth works cleanly & unlimited MIT multi-branch creation (4+ branches) succeeds free with 201
    for (const [code, name] of [
      ['CWB', 'Causeway Bay Flagship'],
      ['MKK', 'Mong Kok Studio'],
      ['STN', 'Shatin Studio'],
      ['TST', 'Tsim Sha Tsui Studio']
    ]) {
      const brRes = await fetch(`${baseUrl}/api/branches`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieHeader },
        body: JSON.stringify({ code, name, currency: 'HKD' })
      });
      assert.equal(brRes.status, 201, `MIT unlimited branches should allow ${code}`);
    }

    const listRes = await fetch(`${baseUrl}/api/branches`, { headers: authHeaders });
    assert.equal(listRes.status, 200);
    const listed = (await listRes.json()) as { branches: Array<{ id: string; code: string }> };
    assert.equal(listed.branches.length, 4);

    const renameRes = await fetch(`${baseUrl}/api/branches/${listed.branches[0].id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Causeway Bay HQ' })
    });
    assert.equal(renameRes.status, 200);
    assert.equal(((await renameRes.json()) as { branch: { name: string } }).branch.name, 'Causeway Bay HQ');
  });
});

test('2. CRM Lead Pipeline + Timetable CRUD & Student Enroll + Teacher Roster (Present/Absent/Makeup) & Student Edit', async () => {
  await withServer(async ({ baseUrl, db, authHeaders }) => {
    const br = db.createBranch({ code: 'CWB', name: 'Causeway Bay Studio' });
    const course = db.createCourse({
      branchId: br.id,
      title: 'Piano Grade 5',
      titleZh: '五級鋼琴',
      defaultCredits: 10,
      priceCents: 380000
    });
    const teacher = db.createTeacher({
      branchId: br.id,
      fullName: 'Miss Vivian Chan',
      fullNameZh: '陳詠詩老師'
    });

    const slotRes = await fetch(`${baseUrl}/api/schedule`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        branchId: br.id,
        courseId: course.id,
        teacherId: teacher.id,
        dayOfWeek: 3,
        startTime: '16:00',
        endTime: '17:00',
        room: 'Room A'
      })
    });
    assert.equal(slotRes.status, 201);
    const { slot } = (await slotRes.json()) as { slot: { id: string } };

    const slotPatch = await fetch(`${baseUrl}/api/schedule/${slot.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ room: 'Room B', startTime: '16:30' })
    });
    assert.equal(slotPatch.status, 200);
    assert.equal(((await slotPatch.json()) as { slot: { room: string } }).slot.room, 'Room B');

    const leadRes = await fetch(`${baseUrl}/api/leads`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        branchId: br.id,
        fullName: '陳大文',
        fullNameZh: '陳大文',
        contactPhone: '93456789',
        source: 'Instagram',
        interestedCourse: 'Piano Grade 5'
      })
    });
    assert.equal(leadRes.status, 201);
    const { lead } = (await leadRes.json()) as { lead: { id: string; stage: string } };

    const patchRes = await fetch(`${baseUrl}/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ stage: 'Trial Done', trialDate: '2026-11-24' })
    });
    assert.equal(patchRes.status, 200);

    const convertRes = await fetch(`${baseUrl}/api/leads/${lead.id}/convert`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ courseId: course.id, paymentMethod: 'fps' })
    });
    assert.equal(convertRes.status, 200);
    const converted = (await convertRes.json()) as {
      lead: { stage: string };
      student: { id: string };
      enrollment: { id: string; passCode: string; remainingCredits: number };
    };
    assert.equal(converted.lead.stage, 'Enrolled');
    assert.equal(converted.enrollment.remainingCredits, 10);

    const editStu = await fetch(`${baseUrl}/api/students/${converted.student.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ contactPhone: '99998888', guardianName: 'Mr. Chan' })
    });
    assert.equal(editStu.status, 200);
    assert.equal(((await editStu.json()) as { student: { contactPhone: string } }).student.contactPhone, '99998888');

    const enrollSlotRes = await fetch(`${baseUrl}/api/schedule/${slot.id}/enroll`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ passCode: converted.enrollment.passCode })
    });
    assert.equal(enrollSlotRes.status, 200);

    const pRes = await fetch(`${baseUrl}/api/schedule/${slot.id}/attendance`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        enrollmentId: converted.enrollment.id,
        slotKey: '2026-11-25-1630',
        status: 'Present'
      })
    });
    assert.equal(pRes.status, 200);
    assert.equal(((await pRes.json()) as { enrollment: { remainingCredits: number } }).enrollment.remainingCredits, 9);

    const aRes = await fetch(`${baseUrl}/api/schedule/${slot.id}/attendance`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        enrollmentId: converted.enrollment.id,
        slotKey: '2026-12-02-1630',
        status: 'Absent'
      })
    });
    assert.equal(aRes.status, 200);
    assert.equal(((await aRes.json()) as { enrollment: { remainingCredits: number } }).enrollment.remainingCredits, 9);

    const mRes = await fetch(`${baseUrl}/api/schedule/${slot.id}/attendance`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        enrollmentId: converted.enrollment.id,
        slotKey: '2026-12-09-1630',
        status: 'Makeup'
      })
    });
    assert.equal(mRes.status, 200);
    assert.equal(((await mRes.json()) as { enrollment: { remainingCredits: number } }).enrollment.remainingCredits, 10);

    const slot2 = db.createTimetableSlot({
      branchId: br.id,
      courseId: course.id,
      teacherId: teacher.id,
      dayOfWeek: 7,
      startTime: '11:00',
      endTime: '12:00'
    });
    const delSlot = await fetch(`${baseUrl}/api/schedule/${slot2.id}`, { method: 'DELETE', headers: authHeaders });
    assert.equal(delSlot.status, 200);

    const adjRes = await fetch(`${baseUrl}/api/students/${converted.student.id}/adjust`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        enrollmentId: converted.enrollment.id,
        delta: -8,
        reason: 'Applied prior month pack offset'
      })
    });
    assert.equal(adjRes.status, 200);
    const ledgerRes = (await (await fetch(`${baseUrl}/api/students/${converted.student.id}/ledger`, { headers: authHeaders })).json()) as {
      enrollments: Array<{ remainingCredits: number; lowCreditAlert: boolean }>;
    };
    assert.equal(ledgerRes.enrollments[0].remainingCredits, 2);
    assert.equal(ledgerRes.enrollments[0].lowCreditAlert, true);
  });
});

test('3. Multi-Item Touch POS Cart + Pending Mark Paid + Void/Refund Unused Credits + BI & CSV', async () => {
  await withServer(async ({ baseUrl, db, authHeaders }) => {
    const br = db.createBranch({ code: 'CWB', name: 'Causeway Bay Studio' });
    const student = db.createStudent({ branchId: br.id, fullName: '=Bob Tam', contactPhone: '98887777' });
    const course = db.createCourse({
      branchId: br.id,
      title: 'IELTS Intensive',
      defaultCredits: 8,
      priceCents: 300000
    });

    const catRes = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        branchId: br.id,
        sku: 'BK-IELTS',
        title: 'IELTS Practice Workbook',
        kind: 'material',
        priceCents: 20000
      })
    });
    assert.equal(catRes.status, 201);

    const checkoutRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        branchId: br.id,
        studentId: student.id,
        items: [
          { courseId: course.id, title: course.title, kind: 'course', qty: 1, unitPriceCents: 300000, creditsPerUnit: 8 },
          { title: 'IELTS Practice Workbook', kind: 'material', qty: 2, unitPriceCents: 20000 }
        ],
        discountType: 'percent',
        discountValue: 10,
        paymentMethod: 'usdc',
        paymentStatus: 'Pending'
      })
    });
    assert.equal(checkoutRes.status, 201);
    const posOut = (await checkoutRes.json()) as {
      invoice: { id: string; invoiceNumber: string; amountCents: number; status: string };
      enrollments: Array<{ passCode: string; remainingCredits: number }>;
    };
    assert.equal(posOut.invoice.amountCents, 306000);
    assert.equal(posOut.invoice.status, 'Pending');

    const paidRes = await fetch(`${baseUrl}/api/invoices/${posOut.invoice.id}/pay`, { method: 'POST', headers: authHeaders });
    assert.equal(paidRes.status, 200);
    assert.equal(((await paidRes.json()) as { invoice: { status: string } }).invoice.status, 'Paid');

    await fetch(`${baseUrl}/api/checkin`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ passCode: posOut.enrollments[0].passCode, slotKey: 'slot-used-1' })
    });

    const refundRes = await fetch(`${baseUrl}/api/invoices/${posOut.invoice.id}/refund`, { method: 'POST', headers: authHeaders });
    assert.equal(refundRes.status, 200);
    const refunded = (await refundRes.json()) as { invoice: { status: string }; creditsReversed: number };
    assert.equal(refunded.invoice.status, 'Refunded');
    assert.equal(refunded.creditsReversed, 7, 'Refund reverses only the 7 unused credits');

    const doubleVoid = await fetch(`${baseUrl}/api/invoices/${posOut.invoice.id}/void`, { method: 'POST', headers: authHeaders });
    assert.equal(doubleVoid.status, 409);

    const biRes = (await (await fetch(`${baseUrl}/api/analytics?branchId=${br.id}`, { headers: authHeaders })).json()) as {
      kpis: { paidRevenueCents: number; voidedOrRefundedCents: number };
    };
    assert.equal(biRes.kpis.paidRevenueCents, 0);
    assert.equal(biRes.kpis.voidedOrRefundedCents, 306000);

    const csvText = await (await fetch(`${baseUrl}/api/invoices/export.csv`, { headers: authHeaders })).text();
    assert.ok(csvText.includes(posOut.invoice.invoiceNumber));
    assert.ok(csvText.includes("'=Bob Tam"));
  });
});

test('4. Public Read-Only Portal & ISO QR <path> SVG Pass + XSS Escaping + Embedded UI Serving', async () => {
  await withServer(async ({ baseUrl, db, authHeaders }) => {
    const seeded1 = seedDemoData(db);
    const seeded2 = seedDemoData(db);
    assert.equal(seeded1, true);
    assert.equal(seeded2, false);

    const renewals = (await (await fetch(`${baseUrl}/api/renewals`, { headers: authHeaders })).json()) as {
      queue: Array<{ passCode: string; remainingCredits: number }>;
    };
    assert.equal(renewals.queue.length, 1);
    const alicePass = renewals.queue[0].passCode;

    // Public endpoints: QR pass SVG and read-only parent portal
    const svgRes = await fetch(`${baseUrl}/api/pass/${alicePass}.svg`);
    assert.equal(svgRes.status, 200);
    assert.equal(svgRes.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    const svgText = await svgRes.text();
    assert.ok(svgText.includes('<path d="M'));

    const xssSvg = renderStudentPassSvg({
      passCode: 'PASS-XSS',
      studentName: '<script>alert(1)</script>',
      branchName: 'Main',
      courseTitle: 'Piano',
      remainingCredits: 4
    });
    assert.ok(!xssSvg.includes('<script>'));
    assert.ok(xssSvg.includes('&lt;script&gt;'));

    const portalRes = (await (await fetch(`${baseUrl}/api/portal/${alicePass}`)).json()) as {
      portal: { readOnly: boolean; maskedContact: string; remainingCredits: number };
    };
    assert.equal(portalRes.portal.readOnly, true);
    assert.equal(portalRes.portal.maskedContact, '****4567');
    assert.equal(portalRes.portal.remainingCredits, 2);

    const cfgRes = await fetch(`${baseUrl}/api/config`);
    assert.equal(cfgRes.status, 200);
    const cfg = (await cfgRes.json()) as { ok: boolean; mode: string; license: string; authRequired: boolean; supportEmail: string };
    assert.equal(cfg.ok, true);
    assert.equal(cfg.mode, 'sqlite-server');
    assert.equal(cfg.license, 'MIT');
    assert.equal(cfg.authRequired, true);
    assert.equal(cfg.supportEmail, 'apexhive.hq@proton.me');

    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    assert.equal(htmlRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(htmlRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(htmlRes.headers.get('referrer-policy'), 'no-referrer');
    assert.ok((htmlRes.headers.get('content-security-policy') || '').includes("script-src 'self'"));
    const html = await htmlRes.text();
    assert.ok(html.includes('open-center-os'));
    assert.ok(html.includes('auth-login-bar'));
    assert.ok(html.includes('Trilingual UI (EN/繁中/簡中)'));
    assert.ok(html.includes('bilingual EN/ZH printable receipts'));
    assert.ok(html.includes('qr-upload-btn'));
    assert.ok(!html.includes('2026-11-25-1400'));
    assert.ok(!html.includes('Tip (Base USDC)'));
    assert.ok(!/0x[0-9a-fA-F]{40}/.test(html));

    assert.equal(svgRes.headers.get('x-frame-options'), 'DENY');
    assert.equal(svgRes.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((svgRes.headers.get('content-security-policy') || '').includes("default-src 'none'"));
  });
});

test('5. Malformed percent-encoded cookies never cause 500 URIError crash', async () => {
  await withServer(async ({ baseUrl }) => {
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: 'oc_session=%E0%A4%A; broken=%ZZ; valid=ok' }
    });
    assert.equal(meRes.status, 200);
    const meJson = (await meRes.json()) as { ok: boolean; authenticated: boolean };
    assert.equal(meJson.ok, true);
    assert.equal(meJson.authenticated, false);

    const apiRes = await fetch(`${baseUrl}/api/branches`, {
      headers: { cookie: 'oc_session=%E0%A4%A' }
    });
    assert.equal(apiRes.status, 401);
  });
});

test('6. Rejects unauthenticated forged pass SVG query-string fallback & uses >=128-bit passCode entropy', async () => {
  await withServer(async ({ baseUrl, db }) => {
    const forged = await fetch(
      `${baseUrl}/api/pass/PASS-FORGED999.svg?student=Mallory&credits=999&course=VIP&branch=Fake`
    );
    assert.equal(forged.status, 404);

    const br = db.createBranch({ code: 'MKK', name: 'Mong Kok Studio' });
    const st = db.createStudent({ branchId: br.id, fullName: 'Real Student' });
    const crs = db.createCourse({ branchId: br.id, title: 'Guitar Pack', defaultCredits: 6, priceCents: 240000 });
    const { enrollment } = db.createEnrollmentPos({ branchId: br.id, studentId: st.id, courseId: crs.id });

    assert.match(enrollment.passCode, /^PASS-[0-9A-F]{32}$/);

    // Even if query params are supplied on a valid passCode, SVG must render only DB values
    const validSvgRes = await fetch(
      `${baseUrl}/api/pass/${enrollment.passCode}.svg?student=Mallory&credits=999`
    );
    assert.equal(validSvgRes.status, 200);
    const svg = await validSvgRes.text();
    assert.ok(svg.includes('Real Student'));
    assert.ok(svg.includes('6 LEFT'));
    assert.ok(!svg.includes('Mallory'));
    assert.ok(!svg.includes('999 LEFT'));
  });
});

test('7. Server-side session revocation on logout & scrypt password storage + legacy SHA-256 migration', async () => {
  await withServer(async ({ baseUrl, db, authHeaders, cookieHeader }) => {
    // Password stored in admin_users is salted scrypt, never plaintext or unsalted SHA-256
    const stored = db.db.prepare('SELECT password_hash FROM admin_users WHERE username = ?').get('admin') as {
      password_hash: string;
    };
    assert.ok(stored.password_hash.startsWith('scrypt$'));

    // Before logout, both Bearer and Cookie authenticate
    assert.equal((await fetch(`${baseUrl}/api/branches`, { headers: authHeaders })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/branches`, { headers: { cookie: cookieHeader } })).status, 200);

    // Logout revokes the token server-side
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: authHeaders.authorization, cookie: cookieHeader }
    });
    assert.equal(logoutRes.status, 200);

    // Replay of previously valid Bearer token and Cookie must now fail with 401
    assert.equal((await fetch(`${baseUrl}/api/branches`, { headers: authHeaders })).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/branches`, { headers: { cookie: cookieHeader } })).status, 401);

    const meAfter = (await (
      await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: authHeaders.authorization } })
    ).json()) as { authenticated: boolean };
    assert.equal(meAfter.authenticated, false);

    // Legacy unsalted sha256$ hash migrates transparently to scrypt$ on successful login
    const legacyHash = `sha256$${createHash('sha256').update(TEST_ADMIN_PASSWORD, 'utf8').digest('hex')}`;
    db.db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(legacyHash, 'admin');

    const migratedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: TEST_ADMIN_PASSWORD })
    });
    assert.equal(migratedLogin.status, 200);

    const upgraded = db.db.prepare('SELECT password_hash FROM admin_users WHERE username = ?').get('admin') as {
      password_hash: string;
    };
    assert.ok(upgraded.password_hash.startsWith('scrypt$'));
  });
});

test('8. Login rate-limit lockout, TRUST_PROXY guard for x-forwarded-proto, and /api/portal rate limit', async () => {
  // Part A: Default trustProxy=false ignores spoofed x-forwarded-proto: https
  await withServer(async ({ baseUrl }) => {
    const spoofed = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ password: TEST_ADMIN_PASSWORD })
    });
    assert.equal(spoofed.status, 200);
    const setCookie = spoofed.headers.get('set-cookie') || '';
    assert.ok(!setCookie.includes('; Secure'));

    // 5 failed attempts lock out the 6th attempt even with valid password
    for (let i = 0; i < 5; i += 1) {
      const fail = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: `wrong-${i}` })
      });
      assert.equal(fail.status, 401);
    }

    const locked = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: TEST_ADMIN_PASSWORD })
    });
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) >= 1);
  });

  // Part B: trustProxy=true honors x-forwarded-proto: https & /api/portal enforces rate limit
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-center-rl-'));
  const db = new OpenCenterDb(path.join(tmpDir, 'center.sqlite'));
  const server = createOpenCenterServer({
    db,
    adminPassword: TEST_ADMIN_PASSWORD,
    trustProxy: true,
    rateLimit: { portalMaxRequests: 3, portalWindowMs: 60_000 }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const trustedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ password: TEST_ADMIN_PASSWORD })
    });
    assert.equal(trustedLogin.status, 200);
    assert.ok((trustedLogin.headers.get('set-cookie') || '').includes('; Secure'));

    seedDemoData(db);
    const passCode = db.getRenewalQueue(10)[0].passCode;

    for (let i = 0; i < 3; i += 1) {
      const okRes = await fetch(`${baseUrl}/api/portal/${passCode}`);
      assert.equal(okRes.status, 200);
    }
    const rateLimited = await fetch(`${baseUrl}/api/portal/${passCode}`);
    assert.equal(rateLimited.status, 429);
    assert.ok(Number(rateLimited.headers.get('retry-after')) >= 1);
  } finally {
    server.close();
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('9. Rightmost X-Forwarded-For hop, bounded rate-limit Maps, non-loopback same-origin Host, and schedule title/teacher binding', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-center-proxy-'));
  const db = new OpenCenterDb(path.join(tmpDir, 'center.sqlite'));
  const server = createOpenCenterServer({
    db,
    adminPassword: TEST_ADMIN_PASSWORD,
    trustProxy: true,
    rateLimit: { maxEntries: 4, portalMaxRequests: 2, portalWindowMs: 60_000 }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Non-loopback Docker/LAN same-origin Host + Origin succeeds (not 403), cross-origin blocked (403)
    const rawPost = (headers: Record<string, string>, payload: unknown) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const bodyStr = JSON.stringify(payload);
        const r = http.request(
          {
            hostname: '127.0.0.1',
            port: addr.port,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'content-length': String(Buffer.byteLength(bodyStr)),
              ...headers
            }
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
          }
        );
        r.on('error', reject);
        r.end(bodyStr);
      });

    const dockerSameOrigin = await rawPost(
      {
        host: 'erp.internal:3800',
        origin: 'http://erp.internal:3800',
        'x-forwarded-for': '198.51.100.10'
      },
      { password: TEST_ADMIN_PASSWORD }
    );
    assert.equal(dockerSameOrigin.status, 200);
    const { token } = JSON.parse(dockerSameOrigin.body) as { token: string };

    const evilCrossOrigin = await rawPost(
      {
        host: 'erp.internal:3800',
        origin: 'http://evil.example'
      },
      { password: TEST_ADMIN_PASSWORD }
    );
    assert.equal(evilCrossOrigin.status, 403);

    // Spoofed leftmost x-forwarded-proto 'https, http' uses rightmost 'http' -> no Secure cookie
    const protoDowngrade = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-proto': 'https, http',
        'x-forwarded-for': '198.51.100.11'
      },
      body: JSON.stringify({ password: TEST_ADMIN_PASSWORD })
    });
    assert.equal(protoDowngrade.status, 200);
    assert.ok(!(protoDowngrade.headers.get('set-cookie') || '').includes('; Secure'));

    // Spoofing leftmost X-Forwarded-For IP cannot bypass rate limit; rightmost hop (203.0.113.50) is enforced
    for (let i = 0; i < 5; i += 1) {
      const failRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `10.0.0.${i}, 203.0.113.50`
        },
        body: JSON.stringify({ username: 'admin', password: `bad-${i}` })
      });
      assert.equal(failRes.status, 401);
    }
    const stillLocked = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '192.0.2.99, 203.0.113.50'
      },
      body: JSON.stringify({ username: 'admin', password: TEST_ADMIN_PASSWORD })
    });
    assert.equal(stillLocked.status, 429);

    // Rate-limit Maps are strictly bounded by maxEntries (4)
    seedDemoData(db);
    const passCode = db.getRenewalQueue(10)[0].passCode;
    for (let i = 0; i < 8; i += 1) {
      await fetch(`${baseUrl}/api/portal/${passCode}`, {
        headers: { 'x-forwarded-for': `198.51.100.${50 + i}` }
      });
      await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${100 + i}` },
        body: JSON.stringify({ username: 'admin', password: 'wrong' })
      });
    }
    const counts = server.rateLimitCounts();
    assert.ok(counts.portal <= 4, `Expected portal map <= 4, got ${counts.portal}`);
    assert.ok(counts.login <= 4, `Expected login map <= 4, got ${counts.login}`);

    // POST /api/schedule binds custom courseTitle and teacherName cleanly
    const br = db.listBranches()[0];
    const customSlotRes = await fetch(`${baseUrl}/api/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        branchId: br.id,
        courseTitle: 'Violin Grade 3',
        teacherName: 'Mr. Derek Wong',
        dayOfWeek: 2,
        startTime: '17:00',
        endTime: '18:00',
        room: 'Room C'
      })
    });
    assert.equal(customSlotRes.status, 201);
    const customSlotJson = (await customSlotRes.json()) as {
      slot: { courseTitle: string; teacherName: string; room: string };
    };
    assert.equal(customSlotJson.slot.courseTitle, 'Violin Grade 3');
    assert.equal(customSlotJson.slot.teacherName, 'Mr. Derek Wong');
    assert.equal(customSlotJson.slot.room, 'Room C');

    // Verify no hardcoded 2026-11-xx dates remain in app.js or seed.ts
    const appJs = await fs.readFile(path.join(process.cwd(), 'public', 'app.js'), 'utf8');
    const seedTs = await fs.readFile(path.join(process.cwd(), 'src', 'seed.ts'), 'utf8');
    assert.ok(!/2026-11-\d{2}/.test(appJs), 'app.js must not contain hardcoded 2026-11-xx dates');
    assert.ok(!/2026-11-\d{2}/.test(seedTs), 'seed.ts must not contain hardcoded 2026-11-xx dates');
    assert.ok(appJs.includes('clearAuthenticatedState()'));
  } finally {
    server.close();
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('10. Enforces strict multi-branch isolation on schedule updates/enroll/attendance, analytics attendance rate, and CSV export', async () => {
  await withServer(async ({ baseUrl, db, authHeaders }) => {
    const brA = db.createBranch({ code: 'BRA', name: 'Branch Alpha' });
    const brB = db.createBranch({ code: 'BRB', name: 'Branch Beta' });

    const crsA = db.createCourse({ branchId: brA.id, title: 'Alpha Piano', defaultCredits: 5, priceCents: 100000 });
    const crsB = db.createCourse({ branchId: brB.id, title: 'Beta Guitar', defaultCredits: 5, priceCents: 120000 });
    const tchA = db.createTeacher({ branchId: brA.id, fullName: 'Teacher Alpha' });
    const tchB = db.createTeacher({ branchId: brB.id, fullName: 'Teacher Beta' });

    const slotA = db.createTimetableSlot({
      branchId: brA.id,
      courseId: crsA.id,
      teacherId: tchA.id,
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '11:00'
    });
    const slotB = db.createTimetableSlot({
      branchId: brB.id,
      courseId: crsB.id,
      teacherId: tchB.id,
      dayOfWeek: 2,
      startTime: '11:00',
      endTime: '12:00'
    });

    const stuA = db.createStudent({ branchId: brA.id, fullName: 'Alice Alpha' });
    const stuB = db.createStudent({ branchId: brB.id, fullName: 'Bob Beta' });
    const posA = db.createEnrollmentPos({ branchId: brA.id, studentId: stuA.id, courseId: crsA.id });
    const posB = db.createEnrollmentPos({ branchId: brB.id, studentId: stuB.id, courseId: crsB.id });

    // Cross-branch updateTimetableSlot (course or teacher from Branch B onto Branch A slot) rejected
    const badPatchCourse = await fetch(`${baseUrl}/api/schedule/${slotA.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ courseId: crsB.id })
    });
    assert.equal(badPatchCourse.status, 404);

    const badPatchTeacher = await fetch(`${baseUrl}/api/schedule/${slotA.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ teacherId: tchB.id })
    });
    assert.equal(badPatchTeacher.status, 404);

    // Cross-branch enrollStudentInSlot and markScheduleAttendance rejected with 409 BRANCH_MISMATCH
    const badEnroll = await fetch(`${baseUrl}/api/schedule/${slotA.id}/enroll`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ passCode: posB.enrollment.passCode })
    });
    assert.equal(badEnroll.status, 409);

    const badAtt = await fetch(`${baseUrl}/api/schedule/${slotA.id}/attendance`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        passCode: posB.enrollment.passCode,
        slotKey: '2026-12-01-1000',
        status: 'Present'
      })
    });
    assert.equal(badAtt.status, 409);

    // Record 1 Present + 1 Absent in Branch A (50%) and 1 Present in Branch B (100%)
    assert.equal(
      (
        await fetch(`${baseUrl}/api/schedule/${slotA.id}/attendance`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ enrollmentId: posA.enrollment.id, slotKey: 'a-1', status: 'Present' })
        })
      ).status,
      200
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/schedule/${slotA.id}/attendance`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ enrollmentId: posA.enrollment.id, slotKey: 'a-2', status: 'Absent' })
        })
      ).status,
      200
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/schedule/${slotB.id}/attendance`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ enrollmentId: posB.enrollment.id, slotKey: 'b-1', status: 'Present' })
        })
      ).status,
      200
    );

    const biA = (await (await fetch(`${baseUrl}/api/analytics?branchId=${brA.id}`, { headers: authHeaders })).json()) as {
      kpis: { attendanceRatePct: number };
    };
    const biB = (await (await fetch(`${baseUrl}/api/analytics?branchId=${brB.id}`, { headers: authHeaders })).json()) as {
      kpis: { attendanceRatePct: number };
    };
    assert.equal(biA.kpis.attendanceRatePct, 50);
    assert.equal(biB.kpis.attendanceRatePct, 100);

    // CSV export filtered by branchId includes only that branch's invoices
    const csvA = await (await fetch(`${baseUrl}/api/invoices/export.csv?branchId=${brA.id}`, { headers: authHeaders })).text();
    assert.ok(csvA.includes('Alice Alpha'));
    assert.ok(!csvA.includes('Bob Beta'));
  });
});
