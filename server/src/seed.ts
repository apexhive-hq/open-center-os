import type { OpenCenterDb } from './db.js';

function offsetIsoDate(deltaDays: number): string {
  const d = new Date(Date.now() + deltaDays * 86_400_000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Seeds a realistic Hong Kong learning center & studio dataset
 * if no active branches exist yet.
 */
export function seedDemoData(db: OpenCenterDb): boolean {
  if (db.countActiveBranches() > 0) return false;

  const br = db.createBranch({
    code: 'CWB',
    name: 'Causeway Bay Studio',
    nameZh: '銅鑼灣旗艦教室',
    address: '12/F Yee Wo Street, Causeway Bay, HK',
    currency: 'HKD'
  });

  const piano = db.createCourse({
    branchId: br.id,
    title: 'Piano Grade 5 (10-Lesson Pack)',
    titleZh: 'ABRSM 五級鋼琴（十堂套票）',
    category: 'education',
    defaultCredits: 10,
    priceCents: 380000
  });
  const ielts = db.createCourse({
    branchId: br.id,
    title: 'IELTS Speaking Intensive (8-Pack)',
    titleZh: 'IELTS 口語精讀（八堂套票）',
    category: 'education',
    defaultCredits: 8,
    priceCents: 320000
  });
  const pilates = db.createCourse({
    branchId: br.id,
    title: 'Pilates Reformer Studio (10-Pack)',
    titleZh: '普拉提器械修身（十堂套票）',
    category: 'studio',
    defaultCredits: 10,
    priceCents: 260000
  });

  db.createCatalogItem({
    branchId: br.id,
    sku: 'BK-PIANO-05',
    title: 'ABRSM Grade 5 Theory Workbook',
    titleZh: '五級樂理練習冊',
    kind: 'material',
    priceCents: 18000
  });

  const t1 = db.createTeacher({
    branchId: br.id,
    fullName: 'Miss Vivian Chan',
    fullNameZh: '陳詠詩老師',
    specialty: 'Piano / Music Theory'
  });
  const t2 = db.createTeacher({
    branchId: br.id,
    fullName: 'Mr. Kelvin Lee',
    fullNameZh: '李志強導師',
    specialty: 'IELTS / Pilates Conditioning'
  });

  db.createTimetableSlot({
    branchId: br.id,
    courseId: piano.id,
    teacherId: t1.id,
    dayOfWeek: 3,
    startTime: '16:00',
    endTime: '17:00',
    room: 'Room A (Steinway)'
  });
  db.createTimetableSlot({
    branchId: br.id,
    courseId: ielts.id,
    teacherId: t2.id,
    dayOfWeek: 5,
    startTime: '18:30',
    endTime: '20:00',
    room: 'Room B'
  });
  db.createTimetableSlot({
    branchId: br.id,
    courseId: pilates.id,
    teacherId: t2.id,
    dayOfWeek: 6,
    startTime: '10:30',
    endTime: '11:30',
    room: 'Studio C'
  });

  const s1 = db.createStudent({
    branchId: br.id,
    fullName: 'Alice Chan',
    fullNameZh: '陳曉晴',
    contactPhone: '91234567',
    guardianName: 'Mrs. Chan'
  });
  const s2 = db.createStudent({
    branchId: br.id,
    fullName: 'Leo Lam',
    fullNameZh: '林子軒',
    contactPhone: '92345678'
  });

  const pos1 = db.createEnrollmentPos({
    branchId: br.id,
    studentId: s1.id,
    courseId: piano.id,
    credits: 3,
    paymentMethod: 'fps',
    paymentStatus: 'Paid'
  });
  db.checkInByPass({ passCode: pos1.enrollment.passCode, slotKey: 'seed-slot-1' });

  db.createEnrollmentPos({
    branchId: br.id,
    studentId: s2.id,
    courseId: ielts.id,
    paymentMethod: 'card',
    paymentStatus: 'Paid'
  });

  db.createLead({
    branchId: br.id,
    fullName: 'Chloe Yeung',
    fullNameZh: '楊子琪',
    contactPhone: '93456789',
    source: 'Instagram',
    interestedCourse: 'Piano Grade 5',
    stage: 'Trial Done',
    trialDate: offsetIsoDate(-2),
    notes: 'Completed 30-min piano assessment; ready to enroll.'
  });
  db.createLead({
    branchId: br.id,
    fullName: 'Marcus Wong',
    fullNameZh: '黃俊傑',
    contactPhone: '94567890',
    source: 'WhatsApp',
    interestedCourse: 'IELTS Speaking Intensive',
    stage: 'Trial Scheduled',
    trialDate: offsetIsoDate(1)
  });

  return true;
}
