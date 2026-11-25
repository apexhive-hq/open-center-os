import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOpenCenterServer } from '../src/app.js';
import { OpenCenterDb } from '../src/db.js';
import { renderStudentPassSvg } from '../src/qr-svg.js';
import { seedDemoData } from '../src/seed.js';

function signTestToken(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  tier: 'sponsor15' | 'sponsor49' | 'team' | 'chain',
  maxBranches?: number | null
) {
  const prefix = 'OPENCEN-PRO-v1.';
  const payload = {
    v: 1,
    product: 'open-center-os',
    tier,
    ...(maxBranches !== undefined ? { maxBranches } : {}),
    payer: '0x1111111111111111111111111111111111111111',
    txHash: '0x' + 'aa'.repeat(32),
    issuedAt: Date.now(),
    expiresAt: null
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = sign(null, Buffer.from(`${prefix}${payloadB64}`, 'utf8'), privateKey).toString('base64url');
  return `${prefix}${payloadB64}.${sig}`;
}

async function withServer(
  fn: (ctx: { baseUrl: string; db: OpenCenterDb; spkiB64: string; privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'] }) => Promise<void>
) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-center-v21-'));
  const dbPath = path.join(tmpDir, 'center.sqlite');
  const homeDir = path.join(tmpDir, 'home');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spkiB64 = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64');

  const db = new OpenCenterDb(dbPath);
  const server = createOpenCenterServer({ db, homeDir, publicKeySpkiB64: spkiB64 });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await fn({ baseUrl, db, spkiB64, privateKey });
  } finally {
    server.close();
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

test('1. Ethical branch ladder + rename branch + activeLicense health reporting', async () => {
  await withServer(async ({ baseUrl, privateKey }) => {
    const br1 = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'CWB', name: 'Causeway Bay Studio', nameZh: '銅鑼灣旗艦教室', currency: 'HKD' })
    });
    assert.equal(br1.status, 201);
    const br1Body = (await br1.json()) as { branch: { id: string } };

    const renameRes = await fetch(`${baseUrl}/api/branches/${br1Body.branch.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Causeway Bay Flagship' })
    });
    assert.equal(renameRes.status, 200);
    assert.equal(((await renameRes.json()) as { branch: { name: string } }).branch.name, 'Causeway Bay Flagship');

    const br2Blocked = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'MKK', name: 'Mong Kok Studio' })
    });
    assert.equal(br2Blocked.status, 402);
    assert.equal(((await br2Blocked.json()) as { error: string }).error, 'MULTI_BRANCH_LICENSE_REQUIRED');

    const teamToken = signTestToken(privateKey, 'team', 3);
    const badAct = await fetch(`${baseUrl}/api/license/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: teamToken.slice(0, -4) + 'ZZZZ' })
    });
    assert.equal(badAct.status, 403);

    const sponsorRes = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-OpenCenter-License': signTestToken(privateKey, 'sponsor15', 1) },
      body: JSON.stringify({ code: 'MKK', name: 'Mong Kok Studio' })
    });
    assert.equal(sponsorRes.status, 402);

    const okAct = await fetch(`${baseUrl}/api/license/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: teamToken })
    });
    assert.equal(okAct.status, 200);
    assert.equal(((await okAct.json()) as { maxBranches: number }).maxBranches, 3);

    const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as {
      activeLicense: { tier: string; maxBranches: number } | null;
    };
    assert.equal(health.activeLicense?.tier, 'team');

    const br2 = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'MKK', name: 'Mong Kok Studio' })
    });
    const br3 = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'STN', name: 'Shatin Studio' })
    });
    assert.equal(br2.status, 201);
    assert.equal(br3.status, 201);

    const br4Blocked = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'TST', name: 'Tsim Sha Tsui Studio' })
    });
    assert.equal(br4Blocked.status, 402);
    assert.equal(((await br4Blocked.json()) as { error: string }).error, 'CHAIN_LICENSE_REQUIRED');

    const br4Ok = await fetch(`${baseUrl}/api/branches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-OpenCenter-License': signTestToken(privateKey, 'chain', null) },
      body: JSON.stringify({ code: 'TST', name: 'Tsim Sha Tsui Studio' })
    });
    assert.equal(br4Ok.status, 201);
  });
});

test('2. CRM Lead Pipeline + Timetable CRUD & Student Enroll + Teacher Roster (Present/Absent/Makeup) & Student Edit', async () => {
  await withServer(async ({ baseUrl, db }) => {
    const br = db.createBranch({ code: 'CWB', name: 'Causeway Bay Studio' }, 1);
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
      headers: { 'content-type': 'application/json' },
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

    // Update slot room & time
    const slotPatch = await fetch(`${baseUrl}/api/schedule/${slot.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room: 'Room B', startTime: '16:30' })
    });
    assert.equal(slotPatch.status, 200);
    assert.equal(((await slotPatch.json()) as { slot: { room: string } }).slot.room, 'Room B');

    // Lead creation & stage update -> convert Chinese-named student
    const leadRes = await fetch(`${baseUrl}/api/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: 'Trial Done', trialDate: '2026-11-24' })
    });
    assert.equal(patchRes.status, 200);

    const convertRes = await fetch(`${baseUrl}/api/leads/${lead.id}/convert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

    // Edit student details via PATCH /api/students/:id
    const editStu = await fetch(`${baseUrl}/api/students/${converted.student.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contactPhone: '99998888', guardianName: 'Mr. Chan' })
    });
    assert.equal(editStu.status, 200);
    assert.equal(((await editStu.json()) as { student: { contactPhone: string } }).student.contactPhone, '99998888');

    // Explicitly attach pass to slot via POST /api/schedule/:id/enroll
    const enrollSlotRes = await fetch(`${baseUrl}/api/schedule/${slot.id}/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passCode: converted.enrollment.passCode })
    });
    assert.equal(enrollSlotRes.status, 200);

    // Teacher Roster attendance: Present (-1 -> 9), Absent (0 -> 9), Makeup (+1 -> 10)
    const pRes = await fetch(`${baseUrl}/api/schedule/${slot.id}/attendance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enrollmentId: converted.enrollment.id,
        slotKey: '2026-12-09-1630',
        status: 'Makeup'
      })
    });
    assert.equal(mRes.status, 200);
    assert.equal(((await mRes.json()) as { enrollment: { remainingCredits: number } }).enrollment.remainingCredits, 10);

    // Delete temporary slot
    const slot2 = db.createTimetableSlot({
      branchId: br.id,
      courseId: course.id,
      teacherId: teacher.id,
      dayOfWeek: 7,
      startTime: '11:00',
      endTime: '12:00'
    });
    const delSlot = await fetch(`${baseUrl}/api/schedule/${slot2.id}`, { method: 'DELETE' });
    assert.equal(delSlot.status, 200);

    // Manual admin credit ledger adjustment (-8 -> 2 triggers renewal alert)
    const adjRes = await fetch(`${baseUrl}/api/students/${converted.student.id}/adjust`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enrollmentId: converted.enrollment.id,
        delta: -8,
        reason: 'Applied prior month pack offset'
      })
    });
    assert.equal(adjRes.status, 200);
    const ledgerRes = (await (await fetch(`${baseUrl}/api/students/${converted.student.id}/ledger`)).json()) as {
      enrollments: Array<{ remainingCredits: number; lowCreditAlert: boolean }>;
      ledger: Array<{ delta: number; reason: string }>;
    };
    assert.equal(ledgerRes.enrollments[0].remainingCredits, 2);
    assert.equal(ledgerRes.enrollments[0].lowCreditAlert, true);
  });
});

test('3. Multi-Item Touch POS Cart + Pending Mark Paid + Void/Refund Unused Credits + BI & CSV', async () => {
  await withServer(async ({ baseUrl, db }) => {
    const br = db.createBranch({ code: 'CWB', name: 'Causeway Bay Studio' }, 1);
    const student = db.createStudent({ branchId: br.id, fullName: '=Bob Tam', contactPhone: '98887777' });
    const course = db.createCourse({
      branchId: br.id,
      title: 'IELTS Intensive',
      defaultCredits: 8,
      priceCents: 300000
    });

    const catRes = await fetch(`${baseUrl}/api/catalog`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        branchId: br.id,
        sku: 'BK-IELTS',
        title: 'IELTS Practice Workbook',
        kind: 'material',
        priceCents: 20000
      })
    });
    assert.equal(catRes.status, 201);

    // Checkout Pending invoice -> Mark Paid -> Refund (reverses unused credits safely)
    const checkoutRes = await fetch(`${baseUrl}/api/pos/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

    const paidRes = await fetch(`${baseUrl}/api/invoices/${posOut.invoice.id}/pay`, { method: 'POST' });
    assert.equal(paidRes.status, 200);
    assert.equal(((await paidRes.json()) as { invoice: { status: string } }).invoice.status, 'Paid');

    // Use 1 credit before refunding
    await fetch(`${baseUrl}/api/checkin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passCode: posOut.enrollments[0].passCode, slotKey: 'slot-used-1' })
    });

    const refundRes = await fetch(`${baseUrl}/api/invoices/${posOut.invoice.id}/refund`, { method: 'POST' });
    assert.equal(refundRes.status, 200);
    const refunded = (await refundRes.json()) as { invoice: { status: string }; creditsReversed: number };
    assert.equal(refunded.invoice.status, 'Refunded');
    assert.equal(refunded.creditsReversed, 7, 'Refund reverses only the 7 unused credits');

    // Double-void/refund blocked cleanly with 409
    const doubleVoid = await fetch(`${baseUrl}/api/invoices/${posOut.invoice.id}/void`, { method: 'POST' });
    assert.equal(doubleVoid.status, 409);

    // BI excludes refunded revenue from paidRevenueCents
    const biRes = (await (await fetch(`${baseUrl}/api/analytics?branchId=${br.id}`)).json()) as {
      kpis: { paidRevenueCents: number; voidedOrRefundedCents: number };
    };
    assert.equal(biRes.kpis.paidRevenueCents, 0);
    assert.equal(biRes.kpis.voidedOrRefundedCents, 306000);

    const csvText = await (await fetch(`${baseUrl}/api/invoices/export.csv`)).text();
    assert.ok(csvText.includes(posOut.invoice.invoiceNumber));
    assert.ok(csvText.includes("'=Bob Tam"));
  });
});

test('4. Real ISO QR <path> SVG Pass + XSS Escaping + Read-Only Portal + Seed & Embedded UI Serving', async () => {
  await withServer(async ({ baseUrl, db }) => {
    const seeded1 = seedDemoData(db);
    const seeded2 = seedDemoData(db);
    assert.equal(seeded1, true);
    assert.equal(seeded2, false);

    const renewals = (await (await fetch(`${baseUrl}/api/renewals`)).json()) as {
      queue: Array<{ passCode: string; remainingCredits: number }>;
    };
    assert.equal(renewals.queue.length, 1);
    const alicePass = renewals.queue[0].passCode;

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
    const cfg = (await cfgRes.json()) as { ok: boolean; mode: string; supportEmail: string; licensePublicKeySpkiB64: string };
    assert.equal(cfg.ok, true);
    assert.equal(cfg.mode, 'sqlite-server');
    assert.equal(cfg.supportEmail, 'apexhive.hq@proton.me');
    assert.ok(cfg.licensePublicKeySpkiB64.length > 20);

    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('open-center-os'));
    assert.equal(new RegExp('i' + 'staff|i' + 'parent', 'i').test(html), false, 'Zero legacy competitor branding in HTML');
  });
});
