import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AttendanceRecord,
  AttendanceStatus,
  BranchRecord,
  CatalogItemRecord,
  CourseRecord,
  CreditLedgerEntry,
  EnrollmentRecord,
  InvoiceLine,
  InvoiceRecord,
  LeadRecord,
  LeadStage,
  StudentRecord,
  TeacherRecord,
  TimetableSlotRecord
} from './types.js';

export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers?: Record<string, string>;

  constructor(status: number, code: string, message: string, headers?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function makePassCode(): string {
  return `PASS-${randomBytes(16).toString('hex').toUpperCase()}`;
}

function scryptDerive(password: string, saltHex: string, keyLen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, saltHex, keyLen, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPasswordScrypt(password: string): Promise<string> {
  const saltHex = randomBytes(16).toString('hex');
  const derived = await scryptDerive(password, saltHex, 64);
  return `scrypt$${saltHex}$${derived.toString('hex')}`;
}

export function hashPasswordScryptSync(password: string): string {
  const saltHex = randomBytes(16).toString('hex');
  const derived = scryptSync(password, saltHex, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${saltHex}$${derived.toString('hex')}`;
}

export async function verifyPasswordHash(
  password: string,
  storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return { valid: false, needsRehash: false };
    const [, saltHex, keyHex] = parts;
    if (!saltHex || !/^[0-9a-f]+$/i.test(keyHex)) {
      return { valid: false, needsRehash: false };
    }
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scryptDerive(password, saltHex, expected.byteLength);
    if (actual.byteLength !== expected.byteLength) {
      return { valid: false, needsRehash: false };
    }
    return { valid: timingSafeEqual(actual, expected), needsRehash: false };
  }

  // Legacy unsalted SHA-256 backward-migration support
  const legacyHex = storedHash.startsWith('sha256$') ? storedHash.slice(7) : storedHash;
  if (/^[0-9a-f]{64}$/i.test(legacyHex)) {
    const expected = Buffer.from(legacyHex, 'hex');
    const actual = createHash('sha256').update(password, 'utf8').digest();
    const valid = actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

function escapeCsvCell(raw: unknown): string {
  let str = String(raw ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function maskPhone(phone: string): string {
  const digits = phone.trim();
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export class OpenCenterDb {
  readonly db: DatabaseSync;
  private txDepth = 0;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        name_zh TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'HKD',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL,
        full_name_zh TEXT NOT NULL DEFAULT '',
        contact_phone TEXT NOT NULL DEFAULT '',
        guardian_name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        title_zh TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL CHECK(category IN ('education', 'studio')),
        default_credits INTEGER NOT NULL CHECK(default_credits > 0),
        price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'HKD',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalog_items (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        title TEXT NOT NULL,
        title_zh TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK(kind IN ('course', 'material')),
        default_credits INTEGER NOT NULL DEFAULT 0 CHECK(default_credits >= 0),
        price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'HKD',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS enrollments (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        pass_code TEXT NOT NULL UNIQUE,
        total_credits INTEGER NOT NULL CHECK(total_credits > 0),
        remaining_credits INTEGER NOT NULL CHECK(remaining_credits >= 0),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'paused')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS teachers (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL,
        full_name_zh TEXT NOT NULL DEFAULT '',
        specialty TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS timetable_slots (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        room TEXT NOT NULL DEFAULT 'Room A',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS slot_enrollments (
        id TEXT PRIMARY KEY,
        slot_id TEXT NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
        enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        UNIQUE(slot_id, enrollment_id)
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
        timetable_slot_id TEXT REFERENCES timetable_slots(id) ON DELETE SET NULL,
        pass_code TEXT NOT NULL,
        slot_key TEXT NOT NULL,
        attendance_status TEXT NOT NULL DEFAULT 'Present' CHECK(attendance_status IN ('Present', 'Absent', 'Makeup')),
        credits_deducted INTEGER NOT NULL DEFAULT 1 CHECK(credits_deducted >= 0),
        notes TEXT NOT NULL DEFAULT '',
        checked_in_at TEXT NOT NULL,
        UNIQUE(enrollment_id, slot_key)
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        enrollment_id TEXT REFERENCES enrollments(id) ON DELETE SET NULL,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_cents >= 0),
        discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents >= 0),
        amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'HKD',
        payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'fps', 'card', 'usdc', 'bank')),
        status TEXT NOT NULL CHECK(status IN ('Paid', 'Pending', 'Voided', 'Refunded')),
        item_label TEXT NOT NULL,
        item_label_zh TEXT NOT NULL DEFAULT '',
        lines_json TEXT NOT NULL DEFAULT '[]',
        issued_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL,
        full_name_zh TEXT NOT NULL DEFAULT '',
        contact_phone TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'Walk-in',
        interested_course TEXT NOT NULL DEFAULT '',
        stage TEXT NOT NULL DEFAULT 'Inquiry' CHECK(stage IN ('Inquiry', 'Trial Scheduled', 'Trial Done', 'Enrolled')),
        trial_date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        converted_student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'system',
        ref_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL DEFAULT 'admin',
        role TEXT NOT NULL DEFAULT 'admin',
        expires_at INTEGER NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  upsertAdminPasswordSync(username: string, password: string): void {
    const normalized = username.trim().toLowerCase() || 'admin';
    const hash = hashPasswordScryptSync(password);
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT id FROM admin_users WHERE username = ?').get(normalized);
    if (existing) {
      this.db
        .prepare('UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE username = ?')
        .run(hash, now, normalized);
      return;
    }
    this.db
      .prepare('INSERT INTO admin_users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(makeId('usr'), normalized, hash, 'admin', now, now);
  }

  async upsertAdminPassword(username: string, password: string): Promise<void> {
    const normalized = username.trim().toLowerCase() || 'admin';
    const hash = await hashPasswordScrypt(password);
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT id FROM admin_users WHERE username = ?').get(normalized);
    if (existing) {
      this.db
        .prepare('UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE username = ?')
        .run(hash, now, normalized);
      return;
    }
    this.db
      .prepare('INSERT INTO admin_users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(makeId('usr'), normalized, hash, 'admin', now, now);
  }

  async verifyAdminLogin(username: string, password: string): Promise<boolean> {
    const normalized = username.trim().toLowerCase() || 'admin';
    const row = this.db
      .prepare('SELECT password_hash FROM admin_users WHERE username = ?')
      .get(normalized) as { password_hash?: string } | undefined;
    if (!row || typeof row.password_hash !== 'string') return false;
    const check = await verifyPasswordHash(password, row.password_hash);
    if (check.valid && check.needsRehash) {
      const upgraded = await hashPasswordScrypt(password);
      this.db
        .prepare('UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE username = ?')
        .run(upgraded, new Date().toISOString(), normalized);
    }
    return check.valid;
  }

  createSession(params: {
    id: string;
    tokenHash: string;
    username: string;
    role: 'admin';
    expiresAt: number;
  }): void {
    const now = Date.now();
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.db
      .prepare('INSERT INTO sessions (id, token_hash, username, role, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)')
      .run(params.id, params.tokenHash, params.username, params.role, params.expiresAt, new Date(now).toISOString());
  }

  isSessionActive(id: string, tokenHash: string): boolean {
    const row = this.db
      .prepare('SELECT revoked_at, expires_at FROM sessions WHERE id = ? AND token_hash = ?')
      .get(id, tokenHash) as { revoked_at?: string | null; expires_at?: number } | undefined;
    if (!row) return false;
    if (row.revoked_at !== null && row.revoked_at !== undefined) return false;
    return Number(row.expires_at ?? 0) > Date.now();
  }

  revokeSessionByTokenHash(tokenHash: string): void {
    this.db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), tokenHash);
  }

  private runInTransaction<T>(fn: () => T): T {
    if (this.txDepth === 0) {
      this.db.exec('BEGIN IMMEDIATE;');
    } else {
      this.db.exec(`SAVEPOINT sp_${this.txDepth};`);
    }
    this.txDepth += 1;
    try {
      const result = fn();
      this.txDepth -= 1;
      if (this.txDepth === 0) {
        this.db.exec('COMMIT;');
      } else {
        this.db.exec(`RELEASE SAVEPOINT sp_${this.txDepth};`);
      }
      return result;
    } catch (err) {
      this.txDepth -= 1;
      try {
        if (this.txDepth === 0) {
          this.db.exec('ROLLBACK;');
        } else {
          this.db.exec(`ROLLBACK TO SAVEPOINT sp_${this.txDepth};`);
          this.db.exec(`RELEASE SAVEPOINT sp_${this.txDepth};`);
        }
      } catch {
        // already rolled back
      }
      throw err;
    }
  }

  private nextInvoiceNumber(issuedDate: string): string {
    const yyyymmdd = issuedDate.replace(/-/g, '');
    const seqRow = this.db.prepare('SELECT COUNT(*) AS cnt FROM invoices WHERE issued_date = ?').get(issuedDate);
    const seq = Number(seqRow?.cnt ?? 0) + 1;
    return `INV-${yyyymmdd}-${String(seq).padStart(3, '0')}`;
  }

  private recordLedgerEntry(params: {
    branchId: string;
    studentId: string;
    enrollmentId: string;
    delta: number;
    reason: string;
    actor?: string;
    refId?: string;
  }): CreditLedgerEntry {
    const entry: CreditLedgerEntry = {
      id: makeId('led'),
      branchId: params.branchId,
      studentId: params.studentId,
      enrollmentId: params.enrollmentId,
      delta: params.delta,
      reason: params.reason,
      actor: params.actor ?? 'staff',
      refId: params.refId ?? '',
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        'INSERT INTO credit_ledger (id, branch_id, student_id, enrollment_id, delta, reason, actor, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        entry.id,
        entry.branchId,
        entry.studentId,
        entry.enrollmentId,
        entry.delta,
        entry.reason,
        entry.actor,
        entry.refId,
        entry.createdAt
      );
    return entry;
  }

  countActiveBranches(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS cnt FROM branches WHERE active = 1').get();
    return Number(row?.cnt ?? 0);
  }

  listBranches(): BranchRecord[] {
    const rows = this.db
      .prepare('SELECT id, code, name, name_zh, address, currency, created_at FROM branches WHERE active = 1 ORDER BY created_at ASC')
      .all();
    return rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      nameZh: String(r.name_zh),
      address: String(r.address),
      currency: String(r.currency),
      createdAt: String(r.created_at)
    }));
  }

  createBranch(
    input: { code: string; name: string; nameZh?: string; address?: string; currency?: string }
  ): BranchRecord {
    const id = makeId('br');
    const createdAt = new Date().toISOString();
    const record: BranchRecord = {
      id,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      nameZh: (input.nameZh ?? input.name).trim(),
      address: (input.address ?? '').trim(),
      currency: (input.currency ?? 'HKD').trim().toUpperCase(),
      createdAt
    };
    try {
      this.db
        .prepare('INSERT INTO branches (id, code, name, name_zh, address, currency, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        .run(record.id, record.code, record.name, record.nameZh, record.address, record.currency, record.createdAt);
    } catch (err) {
      if (err instanceof Error && /UNIQUE/i.test(err.message)) {
        throw new DomainError(409, 'BRANCH_CODE_EXISTS', `Branch code ${record.code} already exists.`);
      }
      throw err;
    }
    return record;
  }

  updateBranch(
    branchId: string,
    patch: { name?: string; nameZh?: string; address?: string; currency?: string }
  ): BranchRecord {
    const existing = this.db
      .prepare('SELECT id, code, name, name_zh, address, currency, created_at FROM branches WHERE id = ? AND active = 1')
      .get(branchId);
    if (!existing) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

    const next: BranchRecord = {
      id: String(existing.id),
      code: String(existing.code),
      name: patch.name !== undefined ? patch.name.trim() : String(existing.name),
      nameZh: patch.nameZh !== undefined ? patch.nameZh.trim() : String(existing.name_zh),
      address: patch.address !== undefined ? patch.address.trim() : String(existing.address),
      currency: patch.currency !== undefined ? patch.currency.trim().toUpperCase() : String(existing.currency),
      createdAt: String(existing.created_at)
    };
    this.db
      .prepare('UPDATE branches SET name = ?, name_zh = ?, address = ?, currency = ? WHERE id = ?')
      .run(next.name, next.nameZh, next.address, next.currency, branchId);
    return next;
  }

  updateStudent(
    studentId: string,
    patch: { fullName?: string; fullNameZh?: string; contactPhone?: string; guardianName?: string }
  ): StudentRecord {
    const existing = this.db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!existing) throw new DomainError(404, 'STUDENT_NOT_FOUND', 'Student not found.');

    const next: StudentRecord = {
      id: String(existing.id),
      branchId: String(existing.branch_id),
      fullName: patch.fullName !== undefined ? patch.fullName.trim() : String(existing.full_name),
      fullNameZh: patch.fullNameZh !== undefined ? patch.fullNameZh.trim() : String(existing.full_name_zh),
      contactPhone: patch.contactPhone !== undefined ? patch.contactPhone.trim() : String(existing.contact_phone),
      guardianName: patch.guardianName !== undefined ? patch.guardianName.trim() : String(existing.guardian_name),
      createdAt: String(existing.created_at)
    };
    this.db
      .prepare('UPDATE students SET full_name = ?, full_name_zh = ?, contact_phone = ?, guardian_name = ? WHERE id = ?')
      .run(next.fullName, next.fullNameZh, next.contactPhone, next.guardianName, studentId);
    return next;
  }

  listStudents(branchId?: string) {
    const rows = branchId
      ? this.db.prepare('SELECT * FROM students WHERE branch_id = ? ORDER BY created_at DESC').all(branchId)
      : this.db.prepare('SELECT * FROM students ORDER BY created_at DESC').all();
    return rows.map((r) => {
      const enrollments = this.db
        .prepare(
          `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                  c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
           FROM enrollments e
           JOIN students s ON s.id = e.student_id
           JOIN courses c ON c.id = e.course_id
           JOIN branches b ON b.id = e.branch_id
           WHERE e.student_id = ? ORDER BY e.created_at DESC`
        )
        .all(String(r.id))
        .map((er) => this.mapEnrollmentRow(er));

      return {
        id: String(r.id),
        branchId: String(r.branch_id),
        fullName: String(r.full_name),
        fullNameZh: String(r.full_name_zh),
        contactPhone: String(r.contact_phone),
        guardianName: String(r.guardian_name),
        createdAt: String(r.created_at),
        totalRemainingCredits: enrollments.reduce((sum, e) => sum + e.remainingCredits, 0),
        enrollments
      };
    });
  }

  createStudent(input: {
    branchId: string;
    fullName: string;
    fullNameZh?: string;
    contactPhone?: string;
    guardianName?: string;
  }): StudentRecord {
    const branch = this.db.prepare('SELECT id FROM branches WHERE id = ?').get(input.branchId);
    if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

    const record: StudentRecord = {
      id: makeId('stu'),
      branchId: input.branchId,
      fullName: input.fullName.trim(),
      fullNameZh: (input.fullNameZh ?? input.fullName).trim(),
      contactPhone: (input.contactPhone ?? '').trim(),
      guardianName: (input.guardianName ?? '').trim(),
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        'INSERT INTO students (id, branch_id, full_name, full_name_zh, contact_phone, guardian_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        record.id,
        record.branchId,
        record.fullName,
        record.fullNameZh,
        record.contactPhone,
        record.guardianName,
        record.createdAt
      );
    return record;
  }

  listCourses(branchId?: string): CourseRecord[] {
    const rows = branchId
      ? this.db.prepare('SELECT * FROM courses WHERE branch_id = ? ORDER BY created_at ASC').all(branchId)
      : this.db.prepare('SELECT * FROM courses ORDER BY created_at ASC').all();
    return rows.map((r) => ({
      id: String(r.id),
      branchId: String(r.branch_id),
      title: String(r.title),
      titleZh: String(r.title_zh),
      category: String(r.category) as CourseRecord['category'],
      defaultCredits: Number(r.default_credits),
      priceCents: Number(r.price_cents),
      currency: String(r.currency),
      createdAt: String(r.created_at)
    }));
  }

  findCourseByTitle(branchId: string, title: string): CourseRecord | null {
    const normalized = title.trim().toLowerCase();
    return (
      this.listCourses(branchId).find(
        (c) => c.title.trim().toLowerCase() === normalized || c.titleZh.trim().toLowerCase() === normalized
      ) ?? null
    );
  }

  findTeacherByName(branchId: string, fullName: string): TeacherRecord | null {
    const normalized = fullName.trim().toLowerCase();
    const rows = this.db.prepare('SELECT * FROM teachers WHERE branch_id = ? ORDER BY created_at ASC').all(branchId);
    for (const r of rows) {
      if (
        String(r.full_name).trim().toLowerCase() === normalized ||
        String(r.full_name_zh).trim().toLowerCase() === normalized
      ) {
        return {
          id: String(r.id),
          branchId: String(r.branch_id),
          fullName: String(r.full_name),
          fullNameZh: String(r.full_name_zh),
          specialty: String(r.specialty),
          createdAt: String(r.created_at)
        };
      }
    }
    return null;
  }

  createCourse(input: {
    branchId: string;
    title: string;
    titleZh?: string;
    category?: 'education' | 'studio';
    defaultCredits: number;
    priceCents: number;
    currency?: string;
  }): CourseRecord {
    const branch = this.db.prepare('SELECT id, currency FROM branches WHERE id = ?').get(input.branchId);
    if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

    const record: CourseRecord = {
      id: makeId('crs'),
      branchId: input.branchId,
      title: input.title.trim(),
      titleZh: (input.titleZh ?? input.title).trim(),
      category: input.category === 'studio' ? 'studio' : 'education',
      defaultCredits: input.defaultCredits,
      priceCents: input.priceCents,
      currency: (input.currency ?? String(branch.currency)).trim().toUpperCase(),
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        'INSERT INTO courses (id, branch_id, title, title_zh, category, default_credits, price_cents, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        record.id,
        record.branchId,
        record.title,
        record.titleZh,
        record.category,
        record.defaultCredits,
        record.priceCents,
        record.currency,
        record.createdAt
      );
    return record;
  }

  listCatalogItems(branchId?: string): CatalogItemRecord[] {
    const rows = branchId
      ? this.db.prepare('SELECT * FROM catalog_items WHERE branch_id = ? ORDER BY created_at ASC').all(branchId)
      : this.db.prepare('SELECT * FROM catalog_items ORDER BY created_at ASC').all();
    return rows.map((r) => ({
      id: String(r.id),
      branchId: String(r.branch_id),
      sku: String(r.sku),
      title: String(r.title),
      titleZh: String(r.title_zh),
      kind: String(r.kind) as CatalogItemRecord['kind'],
      defaultCredits: Number(r.default_credits),
      priceCents: Number(r.price_cents),
      currency: String(r.currency),
      createdAt: String(r.created_at)
    }));
  }

  createCatalogItem(input: {
    branchId: string;
    sku?: string;
    title: string;
    titleZh?: string;
    kind: 'course' | 'material';
    defaultCredits?: number;
    priceCents: number;
    currency?: string;
  }): CatalogItemRecord {
    const branch = this.db.prepare('SELECT id, currency FROM branches WHERE id = ?').get(input.branchId);
    if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

    const record: CatalogItemRecord = {
      id: makeId('cat'),
      branchId: input.branchId,
      sku: (input.sku ?? `SKU-${randomBytes(3).toString('hex').toUpperCase()}`).trim(),
      title: input.title.trim(),
      titleZh: (input.titleZh ?? input.title).trim(),
      kind: input.kind === 'material' ? 'material' : 'course',
      defaultCredits: input.kind === 'material' ? 0 : Math.max(1, Number(input.defaultCredits ?? 10)),
      priceCents: Math.max(0, Math.floor(input.priceCents)),
      currency: (input.currency ?? String(branch.currency)).trim().toUpperCase(),
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        'INSERT INTO catalog_items (id, branch_id, sku, title, title_zh, kind, default_credits, price_cents, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        record.id,
        record.branchId,
        record.sku,
        record.title,
        record.titleZh,
        record.kind,
        record.defaultCredits,
        record.priceCents,
        record.currency,
        record.createdAt
      );
    return record;
  }

  createEnrollmentPos(input: {
    branchId: string;
    studentId: string;
    courseId: string;
    credits?: number;
    amountCents?: number;
    paymentMethod?: 'cash' | 'fps' | 'card' | 'usdc' | 'bank';
    paymentStatus?: 'Paid' | 'Pending';
    issuedDate?: string;
  }): { enrollment: EnrollmentRecord; invoice: InvoiceRecord } {
    return this.runInTransaction(() => {
      const student = this.db
        .prepare('SELECT id, full_name, full_name_zh FROM students WHERE id = ? AND branch_id = ?')
        .get(input.studentId, input.branchId);
      if (!student) throw new DomainError(404, 'STUDENT_NOT_FOUND', 'Student not found in branch.');

      const course = this.db
        .prepare('SELECT id, title, title_zh, default_credits, price_cents, currency FROM courses WHERE id = ? AND branch_id = ?')
        .get(input.courseId, input.branchId);
      if (!course) throw new DomainError(404, 'COURSE_NOT_FOUND', 'Course/service package not found in branch.');

      const branch = this.db.prepare('SELECT id, name, name_zh FROM branches WHERE id = ?').get(input.branchId);
      if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

      const credits = input.credits ?? Number(course.default_credits);
      const amountCents = input.amountCents ?? Number(course.price_cents);
      const createdAt = new Date().toISOString();
      const issuedDate = (input.issuedDate && /^\d{4}-\d{2}-\d{2}$/.test(input.issuedDate))
        ? input.issuedDate
        : createdAt.slice(0, 10);
      const invoiceNumber = this.nextInvoiceNumber(issuedDate);

      const enrollment: EnrollmentRecord = {
        id: makeId('enr'),
        branchId: input.branchId,
        studentId: input.studentId,
        courseId: input.courseId,
        passCode: makePassCode(),
        totalCredits: credits,
        remainingCredits: credits,
        status: 'active',
        lowCreditAlert: credits <= 2,
        createdAt,
        studentName: String(student.full_name),
        studentNameZh: String(student.full_name_zh),
        courseTitle: String(course.title),
        courseTitleZh: String(course.title_zh),
        branchName: String(branch.name)
      };

      this.db
        .prepare(
          'INSERT INTO enrollments (id, branch_id, student_id, course_id, pass_code, total_credits, remaining_credits, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          enrollment.id,
          enrollment.branchId,
          enrollment.studentId,
          enrollment.courseId,
          enrollment.passCode,
          enrollment.totalCredits,
          enrollment.remainingCredits,
          enrollment.status,
          enrollment.createdAt
        );

      this.recordLedgerEntry({
        branchId: enrollment.branchId,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        delta: credits,
        reason: `Enrollment Package: ${String(course.title)}`,
        actor: 'pos',
        refId: invoiceNumber
      });

      const line: InvoiceLine = {
        title: `${String(course.title)} (${credits} sessions)`,
        titleZh: `${String(course.title_zh)}（${credits}堂套票）`,
        kind: 'course',
        qty: 1,
        unitPriceCents: amountCents,
        lineTotalCents: amountCents
      };

      const invoice: InvoiceRecord = {
        id: makeId('inv'),
        invoiceNumber,
        branchId: input.branchId,
        enrollmentId: enrollment.id,
        studentId: input.studentId,
        subtotalCents: amountCents,
        discountCents: 0,
        amountCents,
        currency: String(course.currency),
        paymentMethod: input.paymentMethod ?? 'fps',
        status: input.paymentStatus === 'Pending' ? 'Pending' : 'Paid',
        itemLabel: line.title,
        itemLabelZh: line.titleZh ?? line.title,
        lines: [line],
        issuedDate,
        createdAt,
        studentName: String(student.full_name),
        studentNameZh: String(student.full_name_zh),
        branchName: String(branch.name),
        branchNameZh: String(branch.name_zh)
      };

      this.db
        .prepare(
          'INSERT INTO invoices (id, invoice_number, branch_id, enrollment_id, student_id, subtotal_cents, discount_cents, amount_cents, currency, payment_method, status, item_label, item_label_zh, lines_json, issued_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          invoice.id,
          invoice.invoiceNumber,
          invoice.branchId,
          invoice.enrollmentId,
          invoice.studentId,
          invoice.subtotalCents,
          invoice.discountCents,
          invoice.amountCents,
          invoice.currency,
          invoice.paymentMethod,
          invoice.status,
          invoice.itemLabel,
          invoice.itemLabelZh,
          JSON.stringify(invoice.lines),
          invoice.issuedDate,
          invoice.createdAt
        );

      return { enrollment, invoice };
    });
  }

  checkoutPosCart(input: {
    branchId: string;
    studentId: string;
    items: Array<{
      courseId?: string;
      title: string;
      titleZh?: string;
      kind: 'course' | 'material';
      qty: number;
      unitPriceCents: number;
      creditsPerUnit?: number;
    }>;
    discountType?: 'fixed' | 'percent';
    discountValue?: number;
    paymentMethod?: 'cash' | 'fps' | 'card' | 'usdc' | 'bank';
    paymentStatus?: 'Paid' | 'Pending';
    issuedDate?: string;
  }): { invoice: InvoiceRecord; enrollments: EnrollmentRecord[] } {
    if (!input.items.length) {
      throw new DomainError(400, 'EMPTY_CART', 'Provide at least 1 cart item for POS checkout.');
    }

    return this.runInTransaction(() => {
      const student = this.db
        .prepare('SELECT id, full_name, full_name_zh FROM students WHERE id = ? AND branch_id = ?')
        .get(input.studentId, input.branchId);
      if (!student) throw new DomainError(404, 'STUDENT_NOT_FOUND', 'Student not found in branch.');

      const branch = this.db.prepare('SELECT id, name, name_zh, currency FROM branches WHERE id = ?').get(input.branchId);
      if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

      const createdAt = new Date().toISOString();
      const issuedDate = (input.issuedDate && /^\d{4}-\d{2}-\d{2}$/.test(input.issuedDate))
        ? input.issuedDate
        : createdAt.slice(0, 10);
      const invoiceNumber = this.nextInvoiceNumber(issuedDate);

      let subtotalCents = 0;
      const lines: InvoiceLine[] = [];
      const createdEnrollments: EnrollmentRecord[] = [];

      for (const item of input.items) {
        const qty = Math.max(1, Math.floor(item.qty));
        const unitPriceCents = Math.max(0, Math.floor(item.unitPriceCents));
        const lineTotalCents = qty * unitPriceCents;
        subtotalCents += lineTotalCents;

        lines.push({
          title: `${item.title.trim()} x${qty}`,
          titleZh: `${(item.titleZh ?? item.title).trim()} x${qty}`,
          kind: item.kind,
          qty,
          unitPriceCents,
          lineTotalCents
        });

        if (item.kind === 'course') {
          let courseId = item.courseId;
          let courseTitle = item.title.trim();
          let courseTitleZh = (item.titleZh ?? item.title).trim();

          if (courseId) {
            const c = this.db.prepare('SELECT id, title, title_zh FROM courses WHERE id = ? AND branch_id = ?').get(courseId, input.branchId);
            if (!c) throw new DomainError(404, 'COURSE_NOT_FOUND', `Course ${courseId} not found in branch.`);
            courseTitle = String(c.title);
            courseTitleZh = String(c.title_zh);
          } else {
            const autoCourse = this.createCourse({
              branchId: input.branchId,
              title: courseTitle,
              titleZh: courseTitleZh,
              defaultCredits: Math.max(1, Math.floor(item.creditsPerUnit ?? 10)),
              priceCents: unitPriceCents
            });
            courseId = autoCourse.id;
          }

          const totalCredits = Math.max(1, Math.floor(item.creditsPerUnit ?? 10) * qty);
          const enrollment: EnrollmentRecord = {
            id: makeId('enr'),
            branchId: input.branchId,
            studentId: input.studentId,
            courseId,
            passCode: makePassCode(),
            totalCredits,
            remainingCredits: totalCredits,
            status: 'active',
            lowCreditAlert: totalCredits <= 2,
            createdAt,
            studentName: String(student.full_name),
            studentNameZh: String(student.full_name_zh),
            courseTitle,
            courseTitleZh,
            branchName: String(branch.name)
          };

          this.db
            .prepare(
              'INSERT INTO enrollments (id, branch_id, student_id, course_id, pass_code, total_credits, remaining_credits, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )
            .run(
              enrollment.id,
              enrollment.branchId,
              enrollment.studentId,
              enrollment.courseId,
              enrollment.passCode,
              enrollment.totalCredits,
              enrollment.remainingCredits,
              enrollment.status,
              enrollment.createdAt
            );

          this.recordLedgerEntry({
            branchId: input.branchId,
            studentId: input.studentId,
            enrollmentId: enrollment.id,
            delta: totalCredits,
            reason: `POS Cart Purchase: ${courseTitle}`,
            actor: 'pos',
            refId: invoiceNumber
          });

          createdEnrollments.push(enrollment);
        }
      }

      let discountCents = 0;
      const dVal = Number(input.discountValue ?? 0);
      if (Number.isFinite(dVal) && dVal > 0) {
        if (input.discountType === 'percent') {
          const pct = Math.max(0, Math.min(100, dVal));
          discountCents = Math.round((subtotalCents * pct) / 100);
        } else {
          discountCents = Math.min(subtotalCents, Math.round(dVal));
        }
      }
      const amountCents = Math.max(0, subtotalCents - discountCents);

      const summaryTitle = lines.map((l) => l.title).join(' + ');
      const summaryTitleZh = lines.map((l) => l.titleZh ?? l.title).join(' + ');

      const invoice: InvoiceRecord = {
        id: makeId('inv'),
        invoiceNumber,
        branchId: input.branchId,
        enrollmentId: createdEnrollments[0]?.id ?? null,
        studentId: input.studentId,
        subtotalCents,
        discountCents,
        amountCents,
        currency: String(branch.currency),
        paymentMethod: input.paymentMethod ?? 'fps',
        status: input.paymentStatus === 'Pending' ? 'Pending' : 'Paid',
        itemLabel: summaryTitle,
        itemLabelZh: summaryTitleZh,
        lines,
        issuedDate,
        createdAt,
        studentName: String(student.full_name),
        studentNameZh: String(student.full_name_zh),
        branchName: String(branch.name),
        branchNameZh: String(branch.name_zh)
      };

      this.db
        .prepare(
          'INSERT INTO invoices (id, invoice_number, branch_id, enrollment_id, student_id, subtotal_cents, discount_cents, amount_cents, currency, payment_method, status, item_label, item_label_zh, lines_json, issued_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          invoice.id,
          invoice.invoiceNumber,
          invoice.branchId,
          invoice.enrollmentId,
          invoice.studentId,
          invoice.subtotalCents,
          invoice.discountCents,
          invoice.amountCents,
          invoice.currency,
          invoice.paymentMethod,
          invoice.status,
          invoice.itemLabel,
          invoice.itemLabelZh,
          JSON.stringify(invoice.lines),
          invoice.issuedDate,
          invoice.createdAt
        );

      return { invoice, enrollments: createdEnrollments };
    });
  }

  markInvoicePaid(invoiceId: string): InvoiceRecord {
    const existing = this.getInvoice(invoiceId);
    if (!existing) throw new DomainError(404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
    if (existing.status === 'Voided' || existing.status === 'Refunded') {
      throw new DomainError(409, 'INVOICE_ALREADY_CLOSED', `Cannot mark ${existing.status.toLowerCase()} invoice as paid.`);
    }
    this.db.prepare("UPDATE invoices SET status = 'Paid' WHERE id = ?").run(invoiceId);
    return { ...existing, status: 'Paid' };
  }

  voidOrRefundInvoice(invoiceId: string, targetStatus: 'Voided' | 'Refunded'): {
    invoice: InvoiceRecord;
    creditsReversed: number;
  } {
    return this.runInTransaction(() => {
      const existing = this.getInvoice(invoiceId);
      if (!existing) throw new DomainError(404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
      if (existing.status === 'Voided' || existing.status === 'Refunded') {
        throw new DomainError(409, 'INVOICE_ALREADY_CLOSED', `Invoice ${existing.invoiceNumber} is already ${existing.status}.`);
      }

      const ledgerPurchaseRows = this.db
        .prepare('SELECT enrollment_id, delta FROM credit_ledger WHERE ref_id = ? AND delta > 0')
        .all(existing.invoiceNumber);

      let creditsReversed = 0;
      for (const lr of ledgerPurchaseRows) {
        const enrId = String(lr.enrollment_id);
        const purchased = Number(lr.delta);
        const enrRow = this.db.prepare('SELECT id, branch_id, student_id, remaining_credits FROM enrollments WHERE id = ?').get(enrId);
        if (!enrRow) continue;
        const remaining = Number(enrRow.remaining_credits);
        const reverseAmt = Math.min(remaining, purchased);
        if (reverseAmt > 0) {
          const nextRemaining = remaining - reverseAmt;
          const nextStatus = nextRemaining === 0 ? 'paused' : 'active';
          this.db
            .prepare('UPDATE enrollments SET remaining_credits = ?, status = ? WHERE id = ?')
            .run(nextRemaining, nextStatus, enrId);
          this.recordLedgerEntry({
            branchId: String(enrRow.branch_id),
            studentId: String(enrRow.student_id),
            enrollmentId: enrId,
            delta: -reverseAmt,
            reason: `Invoice ${targetStatus}: ${existing.invoiceNumber}`,
            actor: 'admin',
            refId: existing.invoiceNumber
          });
          creditsReversed += reverseAmt;
        }
      }

      this.db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(targetStatus, invoiceId);
      return {
        invoice: { ...existing, status: targetStatus },
        creditsReversed
      };
    });
  }

  getInvoice(invoiceId: string): InvoiceRecord | null {
    const row = this.db
      .prepare(
        `SELECT i.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                b.name AS branch_name, b.name_zh AS branch_name_zh
         FROM invoices i
         JOIN students s ON s.id = i.student_id
         JOIN branches b ON b.id = i.branch_id
         WHERE i.id = ?`
      )
      .get(invoiceId);
    if (!row) return null;
    return this.mapInvoiceRow(row);
  }

  listInvoices(branchId?: string): InvoiceRecord[] {
    const sql = branchId
      ? `SELECT i.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                b.name AS branch_name, b.name_zh AS branch_name_zh
         FROM invoices i
         JOIN students s ON s.id = i.student_id
         JOIN branches b ON b.id = i.branch_id
         WHERE i.branch_id = ?
         ORDER BY i.created_at DESC`
      : `SELECT i.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                b.name AS branch_name, b.name_zh AS branch_name_zh
         FROM invoices i
         JOIN students s ON s.id = i.student_id
         JOIN branches b ON b.id = i.branch_id
         ORDER BY i.created_at DESC`;
    const rows = branchId ? this.db.prepare(sql).all(branchId) : this.db.prepare(sql).all();
    return rows.map((r) => this.mapInvoiceRow(r));
  }

  exportInvoicesCsv(branchId?: string): string {
    const headers = [
      'invoiceNumber',
      'issuedDate',
      'branch',
      'student',
      'item',
      'subtotal',
      'discount',
      'amount',
      'currency',
      'paymentMethod',
      'status'
    ];
    const lines = [headers.join(',')];
    for (const inv of this.listInvoices(branchId)) {
      lines.push(
        [
          inv.invoiceNumber,
          inv.issuedDate,
          inv.branchName ?? inv.branchId,
          inv.studentName ?? inv.studentId,
          inv.itemLabel,
          (inv.subtotalCents / 100).toFixed(2),
          (inv.discountCents / 100).toFixed(2),
          (inv.amountCents / 100).toFixed(2),
          inv.currency,
          inv.paymentMethod,
          inv.status
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    return lines.join('\n') + '\n';
  }

  listLeads(branchId?: string): LeadRecord[] {
    const rows = branchId
      ? this.db.prepare('SELECT * FROM leads WHERE branch_id = ? ORDER BY created_at DESC').all(branchId)
      : this.db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
    return rows.map((r) => this.mapLeadRow(r));
  }

  createLead(input: {
    branchId: string;
    fullName: string;
    fullNameZh?: string;
    contactPhone?: string;
    source?: string;
    interestedCourse?: string;
    stage?: LeadStage;
    trialDate?: string;
    notes?: string;
  }): LeadRecord {
    const branch = this.db.prepare('SELECT id FROM branches WHERE id = ?').get(input.branchId);
    if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

    const lead: LeadRecord = {
      id: makeId('lead'),
      branchId: input.branchId,
      fullName: input.fullName.trim(),
      fullNameZh: (input.fullNameZh ?? input.fullName).trim(),
      contactPhone: (input.contactPhone ?? '').trim(),
      source: (input.source ?? 'Walk-in').trim(),
      interestedCourse: (input.interestedCourse ?? '').trim(),
      stage: input.stage ?? 'Inquiry',
      trialDate: (input.trialDate ?? '').trim(),
      notes: (input.notes ?? '').trim(),
      convertedStudentId: null,
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare(
        'INSERT INTO leads (id, branch_id, full_name, full_name_zh, contact_phone, source, interested_course, stage, trial_date, notes, converted_student_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        lead.id,
        lead.branchId,
        lead.fullName,
        lead.fullNameZh,
        lead.contactPhone,
        lead.source,
        lead.interestedCourse,
        lead.stage,
        lead.trialDate,
        lead.notes,
        lead.convertedStudentId,
        lead.createdAt
      );
    return lead;
  }

  updateLead(
    leadId: string,
    patch: { stage?: LeadStage; trialDate?: string; notes?: string; interestedCourse?: string }
  ): LeadRecord {
    const existing = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
    if (!existing) throw new DomainError(404, 'LEAD_NOT_FOUND', 'Lead not found.');

    const nextStage = patch.stage ?? (String(existing.stage) as LeadStage);
    const nextTrialDate = patch.trialDate !== undefined ? patch.trialDate.trim() : String(existing.trial_date);
    const nextNotes = patch.notes !== undefined ? patch.notes.trim() : String(existing.notes);
    const nextCourse =
      patch.interestedCourse !== undefined ? patch.interestedCourse.trim() : String(existing.interested_course);

    this.db
      .prepare('UPDATE leads SET stage = ?, trial_date = ?, notes = ?, interested_course = ? WHERE id = ?')
      .run(nextStage, nextTrialDate, nextNotes, nextCourse, leadId);

    const updated = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId)!;
    return this.mapLeadRow(updated);
  }

  convertLeadToStudent(
    leadId: string,
    options?: { courseId?: string; paymentMethod?: 'cash' | 'fps' | 'card' | 'usdc' | 'bank' }
  ): { lead: LeadRecord; student: StudentRecord; enrollment?: EnrollmentRecord; invoice?: InvoiceRecord } {
    return this.runInTransaction(() => {
      const existing = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
      if (!existing) throw new DomainError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      if (existing.converted_student_id) {
        throw new DomainError(409, 'LEAD_ALREADY_CONVERTED', 'Lead was already converted to a student.');
      }

      const student = this.createStudent({
        branchId: String(existing.branch_id),
        fullName: String(existing.full_name),
        fullNameZh: String(existing.full_name_zh),
        contactPhone: String(existing.contact_phone)
      });

      this.db
        .prepare("UPDATE leads SET stage = 'Enrolled', converted_student_id = ? WHERE id = ?")
        .run(student.id, leadId);

      const updatedLead = this.mapLeadRow(this.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId)!);

      if (options?.courseId) {
        const posOut = this.createEnrollmentPos({
          branchId: student.branchId,
          studentId: student.id,
          courseId: options.courseId,
          paymentMethod: options.paymentMethod ?? 'fps',
          paymentStatus: 'Paid'
        });
        return { lead: updatedLead, student, enrollment: posOut.enrollment, invoice: posOut.invoice };
      }

      return { lead: updatedLead, student };
    });
  }

  createTeacher(input: { branchId: string; fullName: string; fullNameZh?: string; specialty?: string }): TeacherRecord {
    const branch = this.db.prepare('SELECT id FROM branches WHERE id = ?').get(input.branchId);
    if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

    const teacher: TeacherRecord = {
      id: makeId('tch'),
      branchId: input.branchId,
      fullName: input.fullName.trim(),
      fullNameZh: (input.fullNameZh ?? input.fullName).trim(),
      specialty: (input.specialty ?? '').trim(),
      createdAt: new Date().toISOString()
    };
    this.db
      .prepare('INSERT INTO teachers (id, branch_id, full_name, full_name_zh, specialty, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(teacher.id, teacher.branchId, teacher.fullName, teacher.fullNameZh, teacher.specialty, teacher.createdAt);
    return teacher;
  }

  createTimetableSlot(input: {
    branchId: string;
    courseId: string;
    teacherId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    room?: string;
  }): TimetableSlotRecord {
    const branch = this.db.prepare('SELECT id FROM branches WHERE id = ?').get(input.branchId);
    if (!branch) throw new DomainError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');

    const course = this.db.prepare('SELECT id, title, title_zh FROM courses WHERE id = ? AND branch_id = ?').get(input.courseId, input.branchId);
    if (!course) throw new DomainError(404, 'COURSE_NOT_FOUND', 'Course not found in branch.');

    const teacher = this.db.prepare('SELECT id, full_name, full_name_zh FROM teachers WHERE id = ? AND branch_id = ?').get(input.teacherId, input.branchId);
    if (!teacher) throw new DomainError(404, 'TEACHER_NOT_FOUND', 'Teacher not found in branch.');

    const id = makeId('slot');
    const createdAt = new Date().toISOString();
    const room = (input.room ?? 'Room A').trim();
    this.db
      .prepare(
        'INSERT INTO timetable_slots (id, branch_id, course_id, teacher_id, day_of_week, start_time, end_time, room, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, input.branchId, input.courseId, input.teacherId, input.dayOfWeek, input.startTime, input.endTime, room, createdAt);

    return {
      id,
      branchId: input.branchId,
      courseId: input.courseId,
      teacherId: input.teacherId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      room,
      courseTitle: String(course.title),
      courseTitleZh: String(course.title_zh),
      teacherName: String(teacher.full_name),
      teacherNameZh: String(teacher.full_name_zh),
      createdAt
    };
  }

  updateTimetableSlot(
    slotId: string,
    patch: { dayOfWeek?: number; startTime?: string; endTime?: string; room?: string; teacherId?: string; courseId?: string }
  ): TimetableSlotRecord {
    const existing = this.db.prepare('SELECT * FROM timetable_slots WHERE id = ?').get(slotId);
    if (!existing) throw new DomainError(404, 'SCHEDULE_SLOT_NOT_FOUND', 'Timetable slot not found.');

    const slotBranchId = String(existing.branch_id);
    const nextCourseId = patch.courseId ?? String(existing.course_id);
    const nextTeacherId = patch.teacherId ?? String(existing.teacher_id);
    const course = this.db
      .prepare('SELECT id, title, title_zh FROM courses WHERE id = ? AND branch_id = ?')
      .get(nextCourseId, slotBranchId);
    if (!course) throw new DomainError(404, 'COURSE_NOT_FOUND', 'Course not found in branch.');
    const teacher = this.db
      .prepare('SELECT id, full_name, full_name_zh FROM teachers WHERE id = ? AND branch_id = ?')
      .get(nextTeacherId, slotBranchId);
    if (!teacher) throw new DomainError(404, 'TEACHER_NOT_FOUND', 'Teacher not found in branch.');

    const dayOfWeek = patch.dayOfWeek ?? Number(existing.day_of_week);
    const startTime = patch.startTime !== undefined ? patch.startTime.trim() : String(existing.start_time);
    const endTime = patch.endTime !== undefined ? patch.endTime.trim() : String(existing.end_time);
    const room = patch.room !== undefined ? patch.room.trim() : String(existing.room);

    this.db
      .prepare('UPDATE timetable_slots SET course_id = ?, teacher_id = ?, day_of_week = ?, start_time = ?, end_time = ?, room = ? WHERE id = ?')
      .run(nextCourseId, nextTeacherId, dayOfWeek, startTime, endTime, room, slotId);

    return {
      id: slotId,
      branchId: String(existing.branch_id),
      courseId: nextCourseId,
      teacherId: nextTeacherId,
      dayOfWeek,
      startTime,
      endTime,
      room,
      courseTitle: String(course.title),
      courseTitleZh: String(course.title_zh),
      teacherName: String(teacher.full_name),
      teacherNameZh: String(teacher.full_name_zh),
      createdAt: String(existing.created_at)
    };
  }

  deleteTimetableSlot(slotId: string): void {
    const res = this.db.prepare('DELETE FROM timetable_slots WHERE id = ?').run(slotId);
    if (Number(res.changes) === 0) {
      throw new DomainError(404, 'SCHEDULE_SLOT_NOT_FOUND', 'Timetable slot not found.');
    }
  }

  enrollStudentInSlot(slotId: string, input: { enrollmentId?: string; passCode?: string }): { slotId: string; enrollmentId: string } {
    const slotRow = this.db.prepare('SELECT id, branch_id FROM timetable_slots WHERE id = ?').get(slotId);
    if (!slotRow) throw new DomainError(404, 'SCHEDULE_SLOT_NOT_FOUND', 'Timetable slot not found.');

    const enrRow = input.enrollmentId
      ? this.db.prepare('SELECT id, branch_id FROM enrollments WHERE id = ?').get(input.enrollmentId)
      : this.db
          .prepare('SELECT id, branch_id FROM enrollments WHERE pass_code = ?')
          .get(String(input.passCode ?? '').trim().toUpperCase());
    if (!enrRow) throw new DomainError(404, 'PASS_NOT_FOUND', 'Enrollment pass not found.');
    if (String(enrRow.branch_id) !== String(slotRow.branch_id)) {
      throw new DomainError(409, 'BRANCH_MISMATCH', 'Enrollment pass belongs to a different branch than this timetable slot.');
    }

    const enrollmentId = String(enrRow.id);
    this.db
      .prepare('INSERT OR IGNORE INTO slot_enrollments (id, slot_id, enrollment_id, created_at) VALUES (?, ?, ?, ?)')
      .run(makeId('se'), slotId, enrollmentId, new Date().toISOString());

    return { slotId, enrollmentId };
  }

  getSchedule(branchId?: string) {
    const teachers = (
      branchId
        ? this.db.prepare('SELECT * FROM teachers WHERE branch_id = ? ORDER BY created_at ASC').all(branchId)
        : this.db.prepare('SELECT * FROM teachers ORDER BY created_at ASC').all()
    ).map((r) => ({
      id: String(r.id),
      branchId: String(r.branch_id),
      fullName: String(r.full_name),
      fullNameZh: String(r.full_name_zh),
      specialty: String(r.specialty),
      createdAt: String(r.created_at)
    }));

    const slotSql = branchId
      ? `SELECT ts.*, c.title AS course_title, c.title_zh AS course_title_zh,
                t.full_name AS teacher_name, t.full_name_zh AS teacher_name_zh
         FROM timetable_slots ts
         JOIN courses c ON c.id = ts.course_id
         JOIN teachers t ON t.id = ts.teacher_id
         WHERE ts.branch_id = ?
         ORDER BY ts.day_of_week ASC, ts.start_time ASC`
      : `SELECT ts.*, c.title AS course_title, c.title_zh AS course_title_zh,
                t.full_name AS teacher_name, t.full_name_zh AS teacher_name_zh
         FROM timetable_slots ts
         JOIN courses c ON c.id = ts.course_id
         JOIN teachers t ON t.id = ts.teacher_id
         ORDER BY ts.day_of_week ASC, ts.start_time ASC`;
    const slotRows = branchId ? this.db.prepare(slotSql).all(branchId) : this.db.prepare(slotSql).all();

    const slots = slotRows.map((r) => {
      const roster = this.db
        .prepare(
          `SELECT DISTINCT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                  c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
           FROM enrollments e
           JOIN students s ON s.id = e.student_id
           JOIN courses c ON c.id = e.course_id
           JOIN branches b ON b.id = e.branch_id
           LEFT JOIN slot_enrollments se ON se.enrollment_id = e.id AND se.slot_id = ?
           WHERE (e.course_id = ? AND e.branch_id = ?) OR se.slot_id = ?
           ORDER BY s.full_name ASC`
        )
        .all(String(r.id), String(r.course_id), String(r.branch_id), String(r.id))
        .map((er) => this.mapEnrollmentRow(er));

      return {
        id: String(r.id),
        branchId: String(r.branch_id),
        courseId: String(r.course_id),
        teacherId: String(r.teacher_id),
        dayOfWeek: Number(r.day_of_week),
        startTime: String(r.start_time),
        endTime: String(r.end_time),
        room: String(r.room),
        courseTitle: String(r.course_title),
        courseTitleZh: String(r.course_title_zh),
        teacherName: String(r.teacher_name),
        teacherNameZh: String(r.teacher_name_zh),
        createdAt: String(r.created_at),
        roster
      };
    });

    return { teachers, slots };
  }

  markScheduleAttendance(input: {
    timetableSlotId: string;
    passCode?: string;
    enrollmentId?: string;
    slotKey: string;
    status: AttendanceStatus;
    notes?: string;
  }): { enrollment: EnrollmentRecord; attendance: AttendanceRecord; ledgerEntry: CreditLedgerEntry | null } {
    const slotRow = this.db.prepare('SELECT id, branch_id FROM timetable_slots WHERE id = ?').get(input.timetableSlotId);
    if (!slotRow) throw new DomainError(404, 'SCHEDULE_SLOT_NOT_FOUND', 'Timetable slot not found.');

    return this.runInTransaction(() => {
      const enrRow = input.enrollmentId
        ? this.db
            .prepare(
              `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                      c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
               FROM enrollments e
               JOIN students s ON s.id = e.student_id
               JOIN courses c ON c.id = e.course_id
               JOIN branches b ON b.id = e.branch_id
               WHERE e.id = ?`
            )
            .get(input.enrollmentId)
        : this.db
            .prepare(
              `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                      c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
               FROM enrollments e
               JOIN students s ON s.id = e.student_id
               JOIN courses c ON c.id = e.course_id
               JOIN branches b ON b.id = e.branch_id
               WHERE e.pass_code = ?`
            )
            .get(String(input.passCode ?? '').trim().toUpperCase());

      if (!enrRow) throw new DomainError(404, 'PASS_NOT_FOUND', 'Enrollment not found.');
      if (String(enrRow.branch_id) !== String(slotRow.branch_id)) {
        throw new DomainError(409, 'BRANCH_MISMATCH', 'Enrollment pass belongs to a different branch than this timetable slot.');
      }

      const enrollmentId = String(enrRow.id);
      const passCode = String(enrRow.pass_code);
      const slotKey = input.slotKey.trim();
      const dup = this.db
        .prepare('SELECT id FROM attendance WHERE enrollment_id = ? AND slot_key = ?')
        .get(enrollmentId, slotKey);
      if (dup) {
        throw new DomainError(409, 'DUPLICATE_CHECKIN', `Already recorded attendance for slot ${slotKey}.`);
      }

      const currentCredits = Number(enrRow.remaining_credits);
      let nextCredits = currentCredits;
      let creditsDeducted = 0;
      let ledgerEntry: CreditLedgerEntry | null = null;

      if (input.status === 'Present') {
        if (currentCredits <= 0) {
          throw new DomainError(409, 'NO_CREDITS_REMAINING', `Pass ${passCode} has 0 remaining credits.`);
        }
        nextCredits = currentCredits - 1;
        creditsDeducted = 1;
        const nextStatus = nextCredits === 0 ? 'completed' : String(enrRow.status);
        this.db
          .prepare('UPDATE enrollments SET remaining_credits = ?, status = ? WHERE id = ?')
          .run(nextCredits, nextStatus, enrollmentId);

        ledgerEntry = this.recordLedgerEntry({
          branchId: String(enrRow.branch_id),
          studentId: String(enrRow.student_id),
          enrollmentId,
          delta: -1,
          reason: `Teacher Roster Present (${slotKey})`,
          actor: 'roster',
          refId: input.timetableSlotId
        });
      } else if (input.status === 'Makeup') {
        nextCredits = currentCredits + 1;
        this.db
          .prepare("UPDATE enrollments SET remaining_credits = ?, status = 'active' WHERE id = ?")
          .run(nextCredits, enrollmentId);

        ledgerEntry = this.recordLedgerEntry({
          branchId: String(enrRow.branch_id),
          studentId: String(enrRow.student_id),
          enrollmentId,
          delta: 1,
          reason: `Teacher Roster Makeup Credit (${slotKey})`,
          actor: 'roster',
          refId: input.timetableSlotId
        });
      }

      const attendance: AttendanceRecord = {
        id: makeId('att'),
        enrollmentId,
        timetableSlotId: input.timetableSlotId,
        passCode,
        slotKey,
        attendanceStatus: input.status,
        creditsDeducted,
        notes: (input.notes ?? '').trim(),
        checkedInAt: new Date().toISOString()
      };

      this.db
        .prepare(
          'INSERT INTO attendance (id, enrollment_id, timetable_slot_id, pass_code, slot_key, attendance_status, credits_deducted, notes, checked_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          attendance.id,
          attendance.enrollmentId,
          attendance.timetableSlotId,
          attendance.passCode,
          attendance.slotKey,
          attendance.attendanceStatus,
          attendance.creditsDeducted,
          attendance.notes,
          attendance.checkedInAt
        );

      const refreshed = this.db
        .prepare(
          `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                  c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
           FROM enrollments e
           JOIN students s ON s.id = e.student_id
           JOIN courses c ON c.id = e.course_id
           JOIN branches b ON b.id = e.branch_id
           WHERE e.id = ?`
        )
        .get(enrollmentId)!;

      return { enrollment: this.mapEnrollmentRow(refreshed), attendance, ledgerEntry };
    });
  }

  getStudentLedger(studentId: string) {
    const stu = this.db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    if (!stu) throw new DomainError(404, 'STUDENT_NOT_FOUND', 'Student not found.');

    const enrollments = this.db
      .prepare(
        `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN courses c ON c.id = e.course_id
         JOIN branches b ON b.id = e.branch_id
         WHERE e.student_id = ?
         ORDER BY e.created_at DESC`
      )
      .all(studentId)
      .map((r) => this.mapEnrollmentRow(r));

    const ledger = this.db
      .prepare('SELECT * FROM credit_ledger WHERE student_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(studentId)
      .map((r) => ({
        id: String(r.id),
        branchId: String(r.branch_id),
        studentId: String(r.student_id),
        enrollmentId: String(r.enrollment_id),
        delta: Number(r.delta),
        reason: String(r.reason),
        actor: String(r.actor),
        refId: String(r.ref_id),
        createdAt: String(r.created_at)
      }));

    return {
      student: {
        id: String(stu.id),
        branchId: String(stu.branch_id),
        fullName: String(stu.full_name),
        fullNameZh: String(stu.full_name_zh),
        contactPhone: String(stu.contact_phone),
        guardianName: String(stu.guardian_name),
        createdAt: String(stu.created_at)
      },
      enrollments,
      ledger
    };
  }

  adjustStudentCredits(input: {
    studentId: string;
    enrollmentId: string;
    delta: number;
    reason: string;
  }): { enrollment: EnrollmentRecord; ledgerEntry: CreditLedgerEntry } {
    if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 100) {
      throw new DomainError(400, 'INVALID_ADJUSTMENT_DELTA', 'Adjustment delta must be non-zero integer between -100 and +100.');
    }

    return this.runInTransaction(() => {
      const row = this.db
        .prepare('SELECT * FROM enrollments WHERE id = ? AND student_id = ?')
        .get(input.enrollmentId, input.studentId);
      if (!row) throw new DomainError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment not found for student.');

      const current = Number(row.remaining_credits);
      const next = current + input.delta;
      if (next < 0) {
        throw new DomainError(409, 'INSUFFICIENT_CREDITS', `Cannot deduct ${Math.abs(input.delta)} from ${current} remaining credits.`);
      }

      const nextStatus = next === 0 ? 'completed' : 'active';
      this.db
        .prepare('UPDATE enrollments SET remaining_credits = ?, status = ? WHERE id = ?')
        .run(next, nextStatus, input.enrollmentId);

      const ledgerEntry = this.recordLedgerEntry({
        branchId: String(row.branch_id),
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        delta: input.delta,
        reason: input.reason.trim(),
        actor: 'admin'
      });

      const refreshed = this.db
        .prepare(
          `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                  c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
           FROM enrollments e
           JOIN students s ON s.id = e.student_id
           JOIN courses c ON c.id = e.course_id
           JOIN branches b ON b.id = e.branch_id
           WHERE e.id = ?`
        )
        .get(input.enrollmentId)!;

      return { enrollment: this.mapEnrollmentRow(refreshed), ledgerEntry };
    });
  }

  checkInByPass(input: {
    passCode: string;
    slotKey: string;
    notes?: string;
  }): { enrollment: EnrollmentRecord; attendance: AttendanceRecord } {
    const passCode = input.passCode.trim().toUpperCase();
    const slotKey = input.slotKey.trim();
    if (!passCode || !slotKey) {
      throw new DomainError(400, 'INVALID_CHECKIN_INPUT', 'passCode and slotKey are required.');
    }

    return this.runInTransaction(() => {
      const row = this.db
        .prepare(
          `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                  c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
           FROM enrollments e
           JOIN students s ON s.id = e.student_id
           JOIN courses c ON c.id = e.course_id
           JOIN branches b ON b.id = e.branch_id
           WHERE e.pass_code = ?`
        )
        .get(passCode);
      if (!row) {
        throw new DomainError(404, 'PASS_NOT_FOUND', `Enrollment pass ${passCode} not found.`);
      }

      const dup = this.db
        .prepare('SELECT id FROM attendance WHERE enrollment_id = ? AND slot_key = ?')
        .get(String(row.id), slotKey);
      if (dup) {
        throw new DomainError(
          409,
          'DUPLICATE_CHECKIN',
          `Pass ${passCode} already checked in for slot ${slotKey}.`
        );
      }

      const currentCredits = Number(row.remaining_credits);
      if (currentCredits <= 0) {
        throw new DomainError(
          409,
          'NO_CREDITS_REMAINING',
          `Pass ${passCode} has 0 remaining credits; renew package first.`
        );
      }

      const nextCredits = currentCredits - 1;
      const nextStatus = nextCredits === 0 ? 'completed' : String(row.status);
      const upd = this.db
        .prepare(
          'UPDATE enrollments SET remaining_credits = remaining_credits - 1, status = ? WHERE id = ? AND remaining_credits > 0'
        )
        .run(nextStatus, String(row.id));
      if (Number(upd.changes) !== 1) {
        throw new DomainError(409, 'NO_CREDITS_REMAINING', 'Failed atomic credit deduction.');
      }

      const attendance: AttendanceRecord = {
        id: makeId('att'),
        enrollmentId: String(row.id),
        timetableSlotId: null,
        passCode,
        slotKey,
        attendanceStatus: 'Present',
        creditsDeducted: 1,
        notes: (input.notes ?? '').trim(),
        checkedInAt: new Date().toISOString()
      };
      this.db
        .prepare(
          'INSERT INTO attendance (id, enrollment_id, timetable_slot_id, pass_code, slot_key, attendance_status, credits_deducted, notes, checked_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          attendance.id,
          attendance.enrollmentId,
          attendance.timetableSlotId,
          attendance.passCode,
          attendance.slotKey,
          attendance.attendanceStatus,
          attendance.creditsDeducted,
          attendance.notes,
          attendance.checkedInAt
        );

      this.recordLedgerEntry({
        branchId: String(row.branch_id),
        studentId: String(row.student_id),
        enrollmentId: String(row.id),
        delta: -1,
        reason: `Pass Check-In (${slotKey})`,
        actor: 'scanner',
        refId: attendance.id
      });

      const enrollment: EnrollmentRecord = {
        id: String(row.id),
        branchId: String(row.branch_id),
        studentId: String(row.student_id),
        courseId: String(row.course_id),
        passCode,
        totalCredits: Number(row.total_credits),
        remainingCredits: nextCredits,
        status: nextStatus as EnrollmentRecord['status'],
        lowCreditAlert: nextCredits <= 2,
        createdAt: String(row.created_at),
        studentName: String(row.student_name),
        studentNameZh: String(row.student_name_zh),
        courseTitle: String(row.course_title),
        courseTitleZh: String(row.course_title_zh),
        branchName: String(row.branch_name)
      };

      return { enrollment, attendance };
    });
  }

  getAnalytics(branchId?: string) {
    const invs = this.listInvoices(branchId);
    const activeInvs = invs.filter((i) => i.status === 'Paid' || i.status === 'Pending');
    const paidRevenueCents = activeInvs.filter((i) => i.status === 'Paid').reduce((s, i) => s + i.amountCents, 0);
    const pendingRevenueCents = activeInvs.filter((i) => i.status === 'Pending').reduce((s, i) => s + i.amountCents, 0);
    const voidedOrRefundedCents = invs
      .filter((i) => i.status === 'Voided' || i.status === 'Refunded')
      .reduce((s, i) => s + i.amountCents, 0);

    const methodMap = new Map<string, number>();
    for (const inv of activeInvs) {
      methodMap.set(inv.paymentMethod, (methodMap.get(inv.paymentMethod) ?? 0) + inv.amountCents);
    }

    const students = this.listStudents(branchId);
    const activePackages = students.reduce((s, st) => s + st.enrollments.length, 0);
    const totalRemainingCredits = students.reduce((s, st) => s + st.totalRemainingCredits, 0);

    const attRows = branchId
      ? this.db
          .prepare(
            'SELECT a.attendance_status FROM attendance a JOIN enrollments e ON e.id = a.enrollment_id WHERE e.branch_id = ?'
          )
          .all(branchId)
      : this.db.prepare('SELECT attendance_status FROM attendance').all();
    const presentCount = attRows.filter((a) => a.attendance_status === 'Present' || a.attendance_status === 'Makeup').length;
    const attendanceRatePct = attRows.length > 0 ? Math.round((presentCount / attRows.length) * 100) : 100;

    const leads = this.listLeads(branchId);
    const enrolledLeads = leads.filter((l) => l.stage === 'Enrolled').length;
    const trialConversionPct = leads.length > 0 ? Math.round((enrolledLeads / leads.length) * 100) : 0;

    const renewalQueue = this.getRenewalQueue(2, branchId);

    return {
      kpis: {
        totalRevenueCents: paidRevenueCents + pendingRevenueCents,
        paidRevenueCents,
        pendingRevenueCents,
        voidedOrRefundedCents,
        activeStudents: students.length,
        activePackages,
        totalRemainingCredits,
        attendanceRatePct,
        trialConversionPct,
        lowCreditCount: renewalQueue.length
      },
      revenueByMethod: Array.from(methodMap.entries()).map(([method, amountCents]) => ({
        method,
        amountCents
      })),
      renewalQueue
    };
  }

  getRenewalQueue(threshold = 2, branchId?: string): EnrollmentRecord[] {
    const sql = branchId
      ? `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN courses c ON c.id = e.course_id
         JOIN branches b ON b.id = e.branch_id
         WHERE e.remaining_credits <= ? AND e.branch_id = ?
         ORDER BY e.remaining_credits ASC, e.created_at ASC`
      : `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN courses c ON c.id = e.course_id
         JOIN branches b ON b.id = e.branch_id
         WHERE e.remaining_credits <= ?
         ORDER BY e.remaining_credits ASC, e.created_at ASC`;
    const rows = branchId ? this.db.prepare(sql).all(threshold, branchId) : this.db.prepare(sql).all(threshold);
    return rows.map((r) => this.mapEnrollmentRow(r));
  }

  getEnrollmentByPassCode(passCode: string): EnrollmentRecord | null {
    const row = this.db
      .prepare(
        `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN courses c ON c.id = e.course_id
         JOIN branches b ON b.id = e.branch_id
         WHERE e.pass_code = ?`
      )
      .get(passCode.trim().toUpperCase());
    return row ? this.mapEnrollmentRow(row) : null;
  }

  getReadOnlyPortal(passCode: string) {
    const row = this.db
      .prepare(
        `SELECT e.*, s.full_name AS student_name, s.full_name_zh AS student_name_zh,
                s.contact_phone AS contact_phone,
                c.title AS course_title, c.title_zh AS course_title_zh, b.name AS branch_name
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN courses c ON c.id = e.course_id
         JOIN branches b ON b.id = e.branch_id
         WHERE e.pass_code = ?`
      )
      .get(passCode.trim().toUpperCase());
    if (!row) return null;

    const historyRows = this.db
      .prepare(
        'SELECT slot_key, attendance_status, credits_deducted, checked_in_at FROM attendance WHERE enrollment_id = ? ORDER BY checked_in_at DESC LIMIT 25'
      )
      .all(String(row.id));

    return {
      readOnly: true,
      passCode: String(row.pass_code),
      studentName: String(row.student_name),
      studentNameZh: String(row.student_name_zh),
      maskedContact: maskPhone(String(row.contact_phone ?? '')),
      branchName: String(row.branch_name),
      courseTitle: String(row.course_title),
      courseTitleZh: String(row.course_title_zh),
      totalCredits: Number(row.total_credits),
      remainingCredits: Number(row.remaining_credits),
      lowCreditAlert: Number(row.remaining_credits) <= 2,
      status: String(row.status),
      checkInHistory: historyRows.map((h) => ({
        slotKey: String(h.slot_key),
        status: String(h.attendance_status ?? 'Present'),
        creditsDeducted: Number(h.credits_deducted),
        checkedInAt: String(h.checked_in_at)
      }))
    };
  }

  private mapEnrollmentRow(r: Record<string, unknown>): EnrollmentRecord {
    const rem = Number(r.remaining_credits);
    return {
      id: String(r.id),
      branchId: String(r.branch_id),
      studentId: String(r.student_id),
      courseId: String(r.course_id),
      passCode: String(r.pass_code),
      totalCredits: Number(r.total_credits),
      remainingCredits: rem,
      status: String(r.status) as EnrollmentRecord['status'],
      lowCreditAlert: rem <= 2,
      createdAt: String(r.created_at),
      studentName: String(r.student_name ?? ''),
      studentNameZh: String(r.student_name_zh ?? ''),
      courseTitle: String(r.course_title ?? ''),
      courseTitleZh: String(r.course_title_zh ?? ''),
      branchName: String(r.branch_name ?? '')
    };
  }

  private mapInvoiceRow(r: Record<string, unknown>): InvoiceRecord {
    let lines: InvoiceLine[] = [];
    try {
      lines = JSON.parse(String(r.lines_json ?? '[]')) as InvoiceLine[];
    } catch {
      lines = [];
    }
    return {
      id: String(r.id),
      invoiceNumber: String(r.invoice_number),
      branchId: String(r.branch_id),
      enrollmentId: r.enrollment_id ? String(r.enrollment_id) : null,
      studentId: String(r.student_id),
      subtotalCents: Number(r.subtotal_cents ?? r.amount_cents),
      discountCents: Number(r.discount_cents ?? 0),
      amountCents: Number(r.amount_cents),
      currency: String(r.currency),
      paymentMethod: String(r.payment_method) as InvoiceRecord['paymentMethod'],
      status: String(r.status) as InvoiceRecord['status'],
      itemLabel: String(r.item_label),
      itemLabelZh: String(r.item_label_zh),
      lines,
      issuedDate: String(r.issued_date),
      createdAt: String(r.created_at),
      studentName: String(r.student_name ?? ''),
      studentNameZh: String(r.student_name_zh ?? ''),
      branchName: String(r.branch_name ?? ''),
      branchNameZh: String(r.branch_name_zh ?? '')
    };
  }

  private mapLeadRow(r: Record<string, unknown>): LeadRecord {
    return {
      id: String(r.id),
      branchId: String(r.branch_id),
      fullName: String(r.full_name),
      fullNameZh: String(r.full_name_zh),
      contactPhone: String(r.contact_phone),
      source: String(r.source),
      interestedCourse: String(r.interested_course),
      stage: String(r.stage) as LeadStage,
      trialDate: String(r.trial_date),
      notes: String(r.notes),
      convertedStudentId: r.converted_student_id ? String(r.converted_student_id) : null,
      createdAt: String(r.created_at)
    };
  }
}
