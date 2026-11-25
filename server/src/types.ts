export type OpenCenterTier = 'sponsor15' | 'sponsor49' | 'team' | 'chain';

export interface OpenCenterLicensePayload {
  v: 1;
  product: 'open-center-os';
  tier: OpenCenterTier;
  maxBranches?: number | null;
  payer: string;
  txHash: string;
  issuedAt: number;
  expiresAt: number | null;
}

export interface LicenseVerificationResult {
  valid: boolean;
  reason?: string;
  payload?: OpenCenterLicensePayload;
}

export interface BranchRecord {
  id: string;
  code: string;
  name: string;
  nameZh: string;
  address: string;
  currency: string;
  createdAt: string;
}

export interface StudentRecord {
  id: string;
  branchId: string;
  fullName: string;
  fullNameZh: string;
  contactPhone: string;
  guardianName: string;
  createdAt: string;
}

export interface CourseRecord {
  id: string;
  branchId: string;
  title: string;
  titleZh: string;
  category: 'education' | 'studio';
  defaultCredits: number;
  priceCents: number;
  currency: string;
  createdAt: string;
}

export interface CatalogItemRecord {
  id: string;
  branchId: string;
  sku: string;
  title: string;
  titleZh: string;
  kind: 'course' | 'material';
  defaultCredits: number;
  priceCents: number;
  currency: string;
  createdAt: string;
}

export interface EnrollmentRecord {
  id: string;
  branchId: string;
  studentId: string;
  courseId: string;
  passCode: string;
  totalCredits: number;
  remainingCredits: number;
  status: 'active' | 'completed' | 'paused';
  lowCreditAlert: boolean;
  createdAt: string;
  studentName?: string;
  studentNameZh?: string;
  courseTitle?: string;
  courseTitleZh?: string;
  branchName?: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Makeup';

export interface AttendanceRecord {
  id: string;
  enrollmentId: string;
  timetableSlotId: string | null;
  passCode: string;
  slotKey: string;
  attendanceStatus: AttendanceStatus;
  creditsDeducted: number;
  notes: string;
  checkedInAt: string;
}

export interface InvoiceLine {
  title: string;
  titleZh?: string;
  kind: 'course' | 'material';
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  branchId: string;
  enrollmentId: string | null;
  studentId: string;
  subtotalCents: number;
  discountCents: number;
  amountCents: number;
  currency: string;
  paymentMethod: 'cash' | 'fps' | 'card' | 'usdc' | 'bank';
  status: 'Paid' | 'Pending' | 'Voided' | 'Refunded';
  itemLabel: string;
  itemLabelZh: string;
  lines: InvoiceLine[];
  issuedDate: string;
  createdAt: string;
  studentName?: string;
  studentNameZh?: string;
  branchName?: string;
  branchNameZh?: string;
}

export type LeadStage = 'Inquiry' | 'Trial Scheduled' | 'Trial Done' | 'Enrolled';

export interface LeadRecord {
  id: string;
  branchId: string;
  fullName: string;
  fullNameZh: string;
  contactPhone: string;
  source: string;
  interestedCourse: string;
  stage: LeadStage;
  trialDate: string;
  notes: string;
  convertedStudentId: string | null;
  createdAt: string;
}

export interface TeacherRecord {
  id: string;
  branchId: string;
  fullName: string;
  fullNameZh: string;
  specialty: string;
  createdAt: string;
}

export interface TimetableSlotRecord {
  id: string;
  branchId: string;
  courseId: string;
  teacherId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
  courseTitle: string;
  courseTitleZh: string;
  teacherName: string;
  teacherNameZh: string;
  createdAt: string;
}

export interface CreditLedgerEntry {
  id: string;
  branchId: string;
  studentId: string;
  enrollmentId: string;
  delta: number;
  reason: string;
  actor: string;
  refId: string;
  createdAt: string;
}
