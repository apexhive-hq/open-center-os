import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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
    const html = await htmlRes.text();
    assert.ok(html.includes('open-center-os'));
    assert.ok(html.includes('auth-login-bar'));
  });
});
