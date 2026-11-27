'use strict';

(function () {
  const STORAGE_KEY = 'open_center_os_demo_v22';
  const LANG_KEY = 'open_center_os_lang';

  const I18N = {
    en: {
      brandSub: 'Studio & Center OS',
      modeSandbox: 'Browser Sandbox Demo — Self-Host Node SQLite for Sync',
      modeServer: 'Live SQLite Server',
      resetDemo: 'Reset Demo Data',
      githubLink: 'GitHub MIT Repo',
      menuBtn: 'Menu',
      authLoginHeading: 'Admin Sign-In Required (SQLite Server Mode)',
      authLoginSub: 'All student, POS, lead, branch, and invoice API routes are protected by HMAC-SHA256 HttpOnly sessions.',
      authPasswordPh: 'Admin password (OPENCENTER_ADMIN_PASSWORD)',
      authLoginBtn: 'Sign In',
      authLogoutBtn: 'Sign Out',
      heroPill: 'Multi-Branch Operations',
      heroTitle: 'Open-Source Education Center & SME Studio Operations OS',
      heroSubtitle: 'Trilingual UI (EN/繁中/簡中), touch POS cart, bilingual EN/ZH printable receipts, weekly timetable teacher roster check-in, CRM trial pipeline, real SVG QR passes, and read-only parent portal.',
      navDashboard: 'Dashboard & BI',
      navTimetable: 'Timetable & Teacher Roster',
      navPos: 'POS Cart & Invoices',
      navCrm: 'Students, CRM & Credits',
      navQr: 'QR Pass & Parent Portal',
      navLicensing: 'Branches & Self-Hosting',
      mStudents: 'Active Packages',
      mCredits: 'Remaining Credits',
      mRenewals: 'Auto-Renewal Queue (<=2)',
      mInvoices: 'Invoices Issued',
      biChartHeading: 'Revenue Breakdown (FPS / Card / Cash / USDC)',
      biAttendanceLbl: 'Attendance Rate',
      renewalHeading: 'Auto-Renewal Queue (<= 2 Credits)',
      emptyRenewals: 'No active packages at <= 2 credits yet.',
      topUpPos: 'Top Up in POS',
      creditsLeftSuffix: 'left',
      timetableHeading: 'Weekly Class Timetable (Click a Slot for Teacher Roster)',
      timetableSub: 'Mon - Sun · Room A / B',
      slotAddBtn: '+ Add Slot',
      slotTitlePh: 'Class / Course Title',
      slotRoomPh: 'Room',
      slotTeacherPh: 'Teacher',
      rosterPrefix: 'Teacher Roster',
      deleteSlot: 'Delete Slot',
      close: 'Close',
      attachStudent: 'Attach Student Pass',
      presentBtn: 'Present -1',
      absentBtn: 'Absent',
      makeupBtn: 'Makeup +1',
      posHeading: 'Touch POS Cart & Custom Items',
      customNamePh: 'Custom Course / Material Name',
      customAddBtn: '+ Add Item',
      posCartHeading: 'Shopping Cart',
      cartEmpty: 'Cart is empty. Click a catalog item above.',
      discNone: 'No Discount',
      discPct: '% Off',
      discHkd: 'HK$ Off',
      posStudentLbl: 'Student / Client Name',
      posPhoneLbl: 'Contact Phone',
      posMethodLbl: 'Payment',
      posStatusLbl: 'Status',
      posSubmit: 'Issue Package & Invoice',
      invoicesHeading: 'Bilingual Invoices',
      exportCsv: 'Export Invoices CSV',
      invSearchPh: 'Search invoice # or member',
      allStatuses: 'All Statuses',
      paid: 'Paid',
      pending: 'Pending',
      voided: 'Voided',
      refunded: 'Refunded',
      thInvNo: 'Invoice #',
      thInvStu: 'Member',
      thInvAmt: 'Amount',
      thInvStat: 'Status',
      thInvAct: 'Actions',
      receiptBtn: 'Receipt',
      markPaidBtn: 'Mark Paid',
      voidBtn: 'Void',
      refundBtn: 'Refund',
      trackerHeading: 'Student / Client Package Tracker',
      stuSearchPh: 'Search name, phone, or pass',
      allBranches: 'All Branches',
      thStuPass: 'Pass',
      thStuName: 'Member',
      thStuPkg: 'Package',
      thStuLeft: 'Left',
      thStuAct: 'Actions',
      adjustBtn: 'Adjust / Makeup',
      editBtn: 'Edit',
      crmHeading: 'CRM Trial Lead Pipeline',
      leadNamePh: 'Lead Name',
      leadPhonePh: 'Phone',
      addLeadBtn: '+ Lead',
      stageInquiry: 'Inquiry',
      stageTrialSched: 'Trial Scheduled',
      stageTrialDone: 'Trial Done',
      stageEnrolled: 'Enrolled',
      convertBtn: 'Convert to Student',
      checkinHeading: 'Zero-App QR / Pass Check-In',
      checkinPassLbl: 'Pass Code',
      checkinSlotLbl: 'Class / Session Slot Key',
      checkinBtn: 'Check In (-1 Credit)',
      qrScanBtn: 'Camera QR Scan',
      qrUploadBtn: 'Scan QR Image',
      qrStopBtn: 'Stop Camera',
      parentPortalHeading: 'Parent Portal Preview',
      parentPortalLbl: 'Student:',
      parentPortalRemaining: 'Remaining Credits',
      parentPortalHistory: 'Recent Attendance Stamps:',
      branchHeading: 'Multi-Branch Manager',
      branchCodePh: 'Code (e.g. MKK)',
      branchNamePh: 'Branch Name (e.g. Mong Kok Studio)',
      addBranchBtn: '+ Add Branch',
      renameBtn: 'Rename',
      saveBtn: 'Save',
      activeStatus: 'Active',
      licensingHeading: 'Self-Hosting & Security Architecture',
      licensingSubtitle: 'Single-branch and multi-branch operations run locally on Node 24 built-in node:sqlite with scrypt admin auth, SQLite-backed session revocation, and locked CORS.',
      footerCopy: 'open-center-os — Multi-Branch Center & Studio Operations OS (MIT)',
      supportLbl: 'Support:',
      receiptTitle: 'Bilingual Official Receipt / 正式收據',
      printBtn: 'Print',
      creditModalTitle: 'Credit Adjustment & Makeup Ledger',
      creditPlus: '+1 Makeup',
      creditMinus: '-1 Deduct',
      stuEditTitle: 'Edit Student Details',
      stuEditName: 'Name',
      stuEditPhone: 'Phone',
      stuEditGuardian: 'Guardian',
      cancelBtn: 'Cancel',
      saveChanges: 'Save Changes',
      days: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      methods: { fps: 'FPS', card: 'Card', cash: 'Cash', usdc: 'USDC' },
      mitBannerOk: 'Multi-branch operations enabled across all configured locations.',
    },
    'zh-HK': {
      brandSub: '教室與工作室系統',
      modeSandbox: '瀏覽器沙盒預覽 — 多機共用請自架 Node SQLite',
      modeServer: '本地 SQLite 伺服器',
      resetDemo: '重設示範資料',
      githubLink: 'GitHub MIT 原始碼',
      menuBtn: '選單',
      authLoginHeading: '需要管理員登入（SQLite 伺服器模式）',
      authLoginSub: '所有學員、POS、CRM 線索、分店及發票 API 均受 HMAC-SHA256 HttpOnly 工作階段保護。',
      authPasswordPh: '管理員密碼（OPENCENTER_ADMIN_PASSWORD）',
      authLoginBtn: '登入',
      authLogoutBtn: '登出',
      heroPill: '多分店營運系統',
      heroTitle: '開源教育中心與預約工作室營運系統',
      heroSubtitle: '觸控購物車 POS、雙語列印收據、每週課表導師點名台、試堂 CRM 轉正、真實二維碼通行證及家長查堂頁。',
      navDashboard: 'BI 營運總覽',
      navTimetable: '課表與導師點名台',
      navPos: 'POS 收銀車與發票',
      navCrm: '學生・試堂 CRM・補堂',
      navQr: 'QR 通行證與家長查堂頁',
      navLicensing: '多分店管理與自架',
      mStudents: '有效套票數目',
      mCredits: '總剩餘堂數',
      mRenewals: '自動續費隊列 (<=2堂)',
      mInvoices: '已開立發票',
      biChartHeading: '收入分佈 (FPS / 刷卡 / 現金 / USDC)',
      biAttendanceLbl: '出席率',
      renewalHeading: '自動續費隊列（餘下 <= 2 堂）',
      emptyRenewals: '暫無少於或等於 2 堂的待續費套票。',
      topUpPos: '前往 POS 續費',
      creditsLeftSuffix: '堂剩餘',
      timetableHeading: '每週課表（點擊時段開啟導師點名台）',
      timetableSub: '星期一至日 · A/B 室',
      slotAddBtn: '+ 新增課堂時段',
      slotTitlePh: '課程 / 班別名稱',
      slotRoomPh: '課室',
      slotTeacherPh: '導師',
      rosterPrefix: '導師點名台',
      deleteSlot: '刪除時段',
      close: '關閉',
      attachStudent: '加入學員通行證',
      presentBtn: '出席 -1',
      absentBtn: '缺席',
      makeupBtn: '補堂 +1',
      posHeading: '觸控 POS 收銀車與自訂項目',
      customNamePh: '自訂課程 / 教材名稱',
      customAddBtn: '+ 新增項目',
      posCartHeading: '購物車',
      cartEmpty: '購物車為空，請點擊上方課程或教材。',
      discNone: '無折扣',
      discPct: '% 折扣',
      discHkd: 'HK$ 減免',
      posStudentLbl: '學生 / 客戶姓名',
      posPhoneLbl: '聯絡電話',
      posMethodLbl: '付款方式',
      posStatusLbl: '狀態',
      posSubmit: '結帳開票及建立套票',
      invoicesHeading: '雙語發票紀錄',
      exportCsv: '匯出帳單 CSV',
      invSearchPh: '搜尋發票編號或學生姓名',
      allStatuses: '全部狀態',
      paid: '已付款',
      pending: '待付款',
      voided: '已作廢',
      refunded: '已退款',
      thInvNo: '發票編號',
      thInvStu: '學員',
      thInvAmt: '金額',
      thInvStat: '狀態',
      thInvAct: '操作',
      receiptBtn: '收據',
      markPaidBtn: '標為已付',
      voidBtn: '作廢',
      refundBtn: '退款',
      trackerHeading: '學員 / 客戶套票總覽',
      stuSearchPh: '搜尋姓名、電話或通行碼',
      allBranches: '全部分店',
      thStuPass: '通行碼',
      thStuName: '學員',
      thStuPkg: '課程套票',
      thStuLeft: '餘堂',
      thStuAct: '操作',
      adjustBtn: '調堂 / 補堂',
      editBtn: '編輯',
      crmHeading: '試堂 CRM 跟進流程',
      leadNamePh: '潛在學員姓名',
      leadPhonePh: '電話',
      addLeadBtn: '+ 新增查詢',
      stageInquiry: '初步查詢',
      stageTrialSched: '已約試堂',
      stageTrialDone: '已完成試堂',
      stageEnrolled: '已正式入學',
      convertBtn: '一鍵轉正入學',
      checkinHeading: '免 App 掃碼點名扣堂',
      checkinPassLbl: '學員通行碼',
      checkinSlotLbl: '課堂 / 時段編號',
      checkinBtn: '立即簽到扣 1 堂',
      qrScanBtn: '開啟鏡頭掃描 QR',
      qrUploadBtn: '上傳 QR 圖片掃描',
      qrStopBtn: '停止鏡頭',
      parentPortalHeading: '家長查堂頁預覽',
      parentPortalLbl: '學生：',
      parentPortalRemaining: '剩餘堂數',
      parentPortalHistory: '近期點名印章紀錄：',
      branchHeading: '多分店管理',
      branchCodePh: '代碼 (如 MKK)',
      branchNamePh: '分店名稱 (如旺角分校)',
      addBranchBtn: '+ 新增分店',
      renameBtn: '改名',
      saveBtn: '儲存',
      activeStatus: '營運中',
      licensingHeading: '自建部署與安全架構',
      licensingSubtitle: '單分店與多分店營運透過 Node 24 內建 node:sqlite、scrypt 密碼雜湊、SQLite 工作階段撤銷與鎖定 CORS 本機運行。',
      footerCopy: 'open-center-os — 多分店教室與工作室營運系統 (MIT)',
      supportLbl: '技術支援：',
      receiptTitle: '正式雙語收據 / Bilingual Official Receipt',
      printBtn: '列印',
      creditModalTitle: '堂數調整與補堂紀錄',
      creditPlus: '+1 補堂',
      creditMinus: '-1 扣堂',
      stuEditTitle: '編輯學員資料',
      stuEditName: '姓名',
      stuEditPhone: '電話',
      stuEditGuardian: '家長 / 聯絡人',
      cancelBtn: '取消',
      saveChanges: '儲存變更',
      days: ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'],
      methods: { fps: '轉數快 FPS', card: '刷卡', cash: '現金', usdc: 'USDC' },
      mitBannerOk: '已啟用多分店集中管理，可按需要新增分店。',
    },
    'zh-CN': {
      brandSub: '校区与工作室系统',
      modeSandbox: '浏览器沙盒预览 — 多端同步请自托管 Node SQLite',
      modeServer: '本地 SQLite 服务器',
      resetDemo: '重置演示数据',
      githubLink: 'GitHub MIT 仓库',
      menuBtn: '菜单',
      authLoginHeading: '需要管理员登录（SQLite 服务器模式）',
      authLoginSub: '所有学员、POS、CRM 线索、校区及发票 API 均受 HMAC-SHA256 HttpOnly 会话保护。',
      authPasswordPh: '管理员密码（OPENCENTER_ADMIN_PASSWORD）',
      authLoginBtn: '登录',
      authLogoutBtn: '退出登录',
      heroPill: '多校区运营系统',
      heroTitle: '开源教育中心与预约工作室运营系统',
      heroSubtitle: '触控购物车 POS、双语打印收据、每周课表导师点名台、试听 CRM 转正、真实二维码通行证与家长查课页。',
      navDashboard: 'BI 运营总览',
      navTimetable: '课表与导师点名台',
      navPos: 'POS 收银车与发票',
      navCrm: '学员・试听 CRM・补课',
      navQr: 'QR 通行证与家长查课页',
      navLicensing: '多校区管理与自托管',
      mStudents: '有效课包数',
      mCredits: '总剩余课时',
      mRenewals: '自动续费队列 (<=2节)',
      mInvoices: '已开具发票',
      biChartHeading: '收入分布 (FPS / 刷卡 / 现金 / USDC)',
      biAttendanceLbl: '出勤率',
      renewalHeading: '自动续费队列（剩余 <= 2 节）',
      emptyRenewals: '暂无少于或等于 2 节的待续费课包。',
      topUpPos: '前往 POS 续费',
      creditsLeftSuffix: '节剩余',
      timetableHeading: '每周课表（点击时段打开导师点名台）',
      timetableSub: '周一至周日 · A/B 教室',
      slotAddBtn: '+ 添加排课',
      slotTitlePh: '课程 / 班型名称',
      slotRoomPh: '教室',
      slotTeacherPh: '导师',
      rosterPrefix: '导师点名台',
      deleteSlot: '删除排课',
      close: '关闭',
      attachStudent: '关联学员通行证',
      presentBtn: '出席 -1',
      absentBtn: '缺席',
      makeupBtn: '补课 +1',
      posHeading: '触控 POS 收银车与自定义项目',
      customNamePh: '自定义课程 / 教材名称',
      customAddBtn: '+ 添加项目',
      posCartHeading: '购物车',
      cartEmpty: '购物车为空，请点击上方课程或教材。',
      discNone: '无折扣',
      discPct: '% 折扣',
      discHkd: 'HK$ 减免',
      posStudentLbl: '学员 / 客户姓名',
      posPhoneLbl: '联系电话',
      posMethodLbl: '支付方式',
      posStatusLbl: '状态',
      posSubmit: '结账开票并创建课包',
      invoicesHeading: '双语发票记录',
      exportCsv: '导出账单 CSV',
      invSearchPh: '搜索发票号或学员姓名',
      allStatuses: '全部状态',
      paid: '已付款',
      pending: '待付款',
      voided: '已作废',
      refunded: '已退款',
      thInvNo: '发票号',
      thInvStu: '学员',
      thInvAmt: '金额',
      thInvStat: '状态',
      thInvAct: '操作',
      receiptBtn: '收据',
      markPaidBtn: '标记已付',
      voidBtn: '作废',
      refundBtn: '退款',
      trackerHeading: '学员 / 客户课包追踪',
      stuSearchPh: '搜索姓名、电话或通行码',
      allBranches: '全部分店',
      thStuPass: '通行码',
      thStuName: '学员',
      thStuPkg: '课包',
      thStuLeft: '剩余',
      thStuAct: '操作',
      adjustBtn: '调课 / 补课',
      editBtn: '编辑',
      crmHeading: '试听 CRM 跟进流程',
      leadNamePh: '潜客姓名',
      leadPhonePh: '电话',
      addLeadBtn: '+ 新增线索',
      stageInquiry: '初步咨询',
      stageTrialSched: '已约试听',
      stageTrialDone: '试听完成',
      stageEnrolled: '已正式入学',
      convertBtn: '一键转正入学',
      checkinHeading: '免 App 扫码点名扣课',
      checkinPassLbl: '学员通行码',
      checkinSlotLbl: '课堂 / 时段编号',
      checkinBtn: '立即签到扣 1 节',
      qrScanBtn: '开启摄像头扫码',
      qrUploadBtn: '上传 QR 图片扫码',
      qrStopBtn: '停止摄像头',
      parentPortalHeading: '家长查课页预览',
      parentPortalLbl: '学员：',
      parentPortalRemaining: '剩余课时',
      parentPortalHistory: '近期点名印章记录：',
      branchHeading: '多校区管理',
      branchCodePh: '代码 (如 MKK)',
      branchNamePh: '校区名称 (如旺角校区)',
      addBranchBtn: '+ 新增校区',
      renameBtn: '改名',
      saveBtn: '保存',
      activeStatus: '运营中',
      licensingHeading: '自托管与安全架构',
      licensingSubtitle: '单校区与多校区运营通过 Node 24 内置 node:sqlite、scrypt 密码哈希、SQLite 会话撤销与锁定 CORS 本地运行。',
      footerCopy: 'open-center-os — 多校区教育中心与工作室运营系统 (MIT)',
      supportLbl: '技术支持：',
      receiptTitle: '正式双语收据 / Bilingual Official Receipt',
      printBtn: '打印',
      creditModalTitle: '课时调整与补课记录',
      creditPlus: '+1 补课',
      creditMinus: '-1 扣课',
      stuEditTitle: '编辑学员信息',
      stuEditName: '姓名',
      stuEditPhone: '电话',
      stuEditGuardian: '家长 / 联系人',
      cancelBtn: '取消',
      saveChanges: '保存更改',
      days: ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      methods: { fps: 'FPS', card: '刷卡', cash: '现金', usdc: 'USDC' },
      mitBannerOk: '已启用多校区集中管理，可按需要新增校区。',
    },
  };

  function makeSafePassCode(name, phone, seq) {
    const ascii = String(name || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5);
    const digits = String(phone || '').replace(/\D/g, '').slice(-4);
    const stem = ascii || digits || 'MEM';
    return `PASS-${stem}${String(seq).padStart(2, '0')}`;
  }

  function currentLocalSlotKey(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(Math.floor(now.getMinutes() / 30) * 30).padStart(2, '0');
    return `${y}-${m}-${d}-${hh}${mm}`;
  }

  function isoDaysAgo(daysAgo) {
    const d = new Date(Date.now() - daysAgo * 86_400_000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function emptyServerState() {
    return {
      branchId: '',
      branches: [],
      catalog: [],
      packages: [],
      invoices: [],
      leads: [],
      slots: [],
      ledger: [],
      checkedInSlots: {},
      attendancePresent: 0,
      attendanceTotal: 0,
    };
  }

  function defaultState() {
    const yr = new Date().getFullYear();
    const d1 = isoDaysAgo(7);
    const d2 = isoDaysAgo(4);
    const d3 = isoDaysAgo(5);
    const d4 = isoDaysAgo(3);
    return {
      branchId: 'CWB',
      branches: [{ id: 'CWB', code: 'CWB', name: 'Causeway Bay Studio (CWB)' }],
      catalog: [
        { id: 'piano10', title: 'Piano 10-Lesson Pack', kind: 'course', credits: 10, priceHkd: 3800 },
        { id: 'ielts8', title: 'IELTS Intensive 8-Pack', kind: 'course', credits: 8, priceHkd: 3200 },
        { id: 'pilates10', title: 'Pilates Reformer 10-Pack', kind: 'course', credits: 10, priceHkd: 2600 },
        { id: 'book1', title: 'Theory Workbook', kind: 'material', credits: 0, priceHkd: 280 },
      ],
      packages: [
        {
          id: 'enr-1',
          studentId: 'stu-1',
          passCode: 'PASS-ALICE01',
          studentName: 'Alice Chan',
          phone: '91234567',
          guardian: 'Mrs. Chan',
          branch: 'CWB',
          courseTitle: 'Piano 10-Lesson Pack',
          totalCredits: 10,
          remainingCredits: 3,
          history: [`${d1} Present (-1)`, `${d2} Present (-1)`],
        },
        {
          id: 'enr-2',
          studentId: 'stu-2',
          passCode: 'PASS-BEN02',
          studentName: 'Ben Lau',
          phone: '92345678',
          guardian: '',
          branch: 'CWB',
          courseTitle: 'IELTS Intensive 8-Pack',
          totalCredits: 8,
          remainingCredits: 6,
          history: [`${d3} Present (-1)`],
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          invoiceNo: `INV-CWB-${yr}-0001`,
          studentName: 'Alice Chan',
          branch: 'CWB',
          passCodes: ['PASS-ALICE01'],
          items: [{ title: 'Piano 10-Lesson Pack', qty: 1, priceHkd: 3800, credits: 10 }],
          discountHkd: 0,
          amountHkd: 3800,
          method: 'fps',
          status: 'Paid',
          createdAt: d1,
        },
        {
          id: 'inv-2',
          invoiceNo: `INV-CWB-${yr}-0002`,
          studentName: 'Ben Lau',
          branch: 'CWB',
          passCodes: ['PASS-BEN02'],
          items: [{ title: 'IELTS Intensive 8-Pack', qty: 1, priceHkd: 3200, credits: 8 }],
          discountHkd: 0,
          amountHkd: 3200,
          method: 'card',
          status: 'Paid',
          createdAt: d3,
        },
      ],
      leads: [
        { id: 'L-1', name: 'Sophie Ho', phone: '93456789', stage: 'Trial Done', courseId: 'piano10' },
        { id: 'L-2', name: 'Daniel Tam', phone: '94567890', stage: 'Trial Scheduled', courseId: 'ielts8' },
      ],
      slots: [
        { id: 'MON-1600', dayOfWeek: 1, day: 'Mon 16:00', startTime: '16:00', endTime: '17:00', title: 'Piano Grade 5', room: 'Room A', teacher: 'Miss Chan', passes: ['PASS-ALICE01'] },
        { id: 'WED-1830', dayOfWeek: 3, day: 'Wed 18:30', startTime: '18:30', endTime: '20:00', title: 'IELTS Writing Lab', room: 'Room B', teacher: 'Mr Lee', passes: ['PASS-BEN02'] },
        { id: 'SAT-1030', dayOfWeek: 6, day: 'Sat 10:30', startTime: '10:30', endTime: '11:30', title: 'Reformer Core', room: 'Studio 1', teacher: 'Ms Cheung', passes: ['PASS-ALICE01', 'PASS-BEN02'] },
        { id: 'SUN-1400', dayOfWeek: 7, day: 'Sun 14:00', startTime: '14:00', endTime: '15:00', title: 'Kids Ensemble', room: 'Room A', teacher: 'Miss Chan', passes: ['PASS-ALICE01'] },
      ],
      ledger: [{ ts: d4, passCode: 'PASS-ALICE01', delta: '+1', note: 'Initial makeup buffer' }],
      checkedInSlots: {},
      attendancePresent: 17,
      attendanceTotal: 18,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.packages)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return defaultState();
  }

  let state = loadState();
  let lang = (() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved && I18N[saved] ? saved : 'en';
    } catch {
      return 'en';
    }
  })();
  let cart = [{ id: 'piano10', title: 'Piano 10-Lesson Pack', kind: 'course', priceHkd: 3800, credits: 10, qty: 1 }];
  let activeSlotId = null;
  let activeCreditPass = null;
  let editingStudentPass = null;
  let serverBackendActive = false;
  let serverAuthenticated = false;
  let serverAnalytics = null;
  let serverTeachers = [];

  function saveState() {
    if (serverBackendActive) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  const $ = (id) => document.getElementById(id);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function showBox(box, msg, kind) {
    if (!box) return;
    box.textContent = msg;
    box.className = 'status-box ' + (kind || '');
    box.hidden = false;
  }

  function switchView(viewName) {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });
    document.querySelectorAll('.view-panel').forEach((panel) => {
      const match = panel.id === 'view-' + viewName;
      panel.classList.toggle('active', match);
      panel.hidden = !match;
    });
    closeMobileSidebar();
  }

  function closeMobileSidebar() {
    const sb = $('app-sidebar');
    const bd = $('sidebar-backdrop');
    if (sb) sb.classList.remove('open');
    if (bd) bd.hidden = true;
  }

  async function apiJson(url, opts = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...opts });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
    }
    return data;
  }

  async function syncFromServer() {
    if (!serverBackendActive || !serverAuthenticated) return;
    const [branchesRes, studentsRes, catalogRes, schedRes, leadsRes, invRes, analyticsRes] = await Promise.all([
      apiJson('/api/branches'),
      apiJson('/api/students'),
      apiJson('/api/catalog'),
      apiJson('/api/schedule'),
      apiJson('/api/leads'),
      apiJson('/api/invoices'),
      apiJson('/api/analytics'),
    ]);

    const branchList = (branchesRes.branches || []).map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      nameZh: b.nameZh,
    }));
    const activeBranchId = branchList.some((b) => b.id === state.branchId)
      ? state.branchId
      : (branchList[0]?.id || 'CWB');

    const catalog = [
      ...(catalogRes.courses || []).map((c) => ({
        id: c.id,
        branchId: c.branchId,
        title: c.title,
        kind: 'course',
        credits: c.defaultCredits,
        priceHkd: Math.round(c.priceCents / 100),
      })),
      ...(catalogRes.items || []).map((it) => ({
        id: it.id,
        branchId: it.branchId,
        title: it.title,
        kind: it.kind,
        credits: it.defaultCredits,
        priceHkd: Math.round(it.priceCents / 100),
      })),
    ];

    const packages = [];
    for (const st of studentsRes.students || []) {
      for (const enr of st.enrollments || []) {
        packages.push({
          id: enr.id,
          studentId: st.id,
          passCode: enr.passCode,
          studentName: st.fullName,
          phone: st.contactPhone || '',
          guardian: st.guardianName || '',
          branch: bCodeForId(branchList, enr.branchId),
          branchId: enr.branchId,
          courseTitle: enr.courseTitle || 'Package',
          totalCredits: enr.totalCredits,
          remainingCredits: enr.remainingCredits,
          history: [],
        });
      }
    }

    const invoices = (invRes.invoices || []).map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNumber,
      studentName: inv.studentName || '',
      branch: bCodeForId(branchList, inv.branchId),
      branchId: inv.branchId,
      items: (inv.lines || []).map((l) => ({
        title: l.title,
        qty: l.qty,
        priceHkd: Math.round(l.unitPriceCents / 100),
      })),
      discountHkd: Math.round((inv.discountCents || 0) / 100),
      amountHkd: Math.round(inv.amountCents / 100),
      method: inv.paymentMethod,
      status: inv.status,
      createdAt: inv.issuedDate,
    }));

    const leads = (leadsRes.leads || []).map((l) => ({
      id: l.id,
      name: l.fullName,
      phone: l.contactPhone,
      stage: l.stage,
      courseId: catalog[0]?.id || '',
    }));

    serverTeachers = schedRes.teachers || [];
    const daysArr = I18N[lang].days;
    const slots = (schedRes.slots || []).map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      day: `${daysArr[s.dayOfWeek] || 'Day'} ${s.startTime}`,
      startTime: s.startTime,
      endTime: s.endTime,
      title: s.courseTitle,
      room: s.room,
      teacher: s.teacherName,
      passes: (s.roster || []).map((r) => r.passCode),
      rosterEnrollments: s.roster || [],
    }));

    serverAnalytics = analyticsRes;
    state = {
      ...state,
      branchId: activeBranchId,
      branches: branchList,
      catalog,
      packages,
      invoices,
      leads,
      slots,
    };
  }

  function bCodeForId(branches, id) {
    const f = branches.find((b) => b.id === id || b.code === id);
    return f ? f.code : id;
  }

  function applyLang(nextLang) {
    lang = I18N[nextLang] ? nextLang : 'en';
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore
    }
    const t = I18N[lang];
    document.documentElement.lang = lang;

    $('brand-sub').textContent = t.brandSub;
    $('mode-badge').textContent = serverBackendActive ? t.modeServer : t.modeSandbox;
    $('reset-demo-btn').textContent = t.resetDemo;
    $('github-repo-link').textContent = t.githubLink;
    $('sidebar-toggle-btn').textContent = t.menuBtn;
    if ($('auth-login-heading')) $('auth-login-heading').textContent = t.authLoginHeading;
    if ($('auth-login-sub')) $('auth-login-sub').textContent = t.authLoginSub;
    if ($('auth-password-input')) $('auth-password-input').placeholder = t.authPasswordPh;
    if ($('auth-login-btn')) $('auth-login-btn').textContent = t.authLoginBtn;
    if ($('auth-logout-btn')) $('auth-logout-btn').textContent = t.authLogoutBtn;
    $('hero-pill').textContent = t.heroPill;
    $('hero-title').textContent = t.heroTitle;
    $('hero-subtitle').textContent = t.heroSubtitle;

    $('nav-lbl-dashboard').textContent = t.navDashboard;
    $('nav-lbl-timetable').textContent = t.navTimetable;
    $('nav-lbl-pos').textContent = t.navPos;
    $('nav-lbl-crm').textContent = t.navCrm;
    $('nav-lbl-qr').textContent = t.navQr;
    $('nav-lbl-licensing').textContent = t.navLicensing;

    $('m-students-lbl').textContent = t.mStudents;
    $('m-credits-lbl').textContent = t.mCredits;
    $('m-renewals-lbl').textContent = t.mRenewals;
    $('m-invoices-lbl').textContent = t.mInvoices;
    $('bi-chart-heading').textContent = t.biChartHeading;
    $('bi-attendance-lbl').textContent = t.biAttendanceLbl;
    $('renewal-heading').textContent = t.renewalHeading;

    $('timetable-heading').textContent = t.timetableHeading;
    $('timetable-sub').textContent = t.timetableSub;
    $('slot-add-btn').textContent = t.slotAddBtn;
    $('slot-title-input').placeholder = t.slotTitlePh;
    $('slot-room-input').placeholder = t.slotRoomPh;
    $('slot-teacher-input').placeholder = t.slotTeacherPh;
    $('roster-delete-btn').textContent = t.deleteSlot;
    $('roster-close-btn').textContent = t.close;
    $('roster-enroll-btn').textContent = t.attachStudent;
    const dayOpts = $('slot-day-select').options;
    for (let i = 0; i < dayOpts.length; i += 1) {
      dayOpts[i].textContent = t.days[i + 1] || String(i + 1);
    }

    $('pos-heading').textContent = t.posHeading;
    $('custom-item-name').placeholder = t.customNamePh;
    $('custom-item-add-btn').textContent = t.customAddBtn;
    $('pos-cart-heading').textContent = t.posCartHeading;
    const discOpts = $('pos-discount-type').options;
    discOpts[0].textContent = t.discNone;
    discOpts[1].textContent = t.discPct;
    discOpts[2].textContent = t.discHkd;
    $('pos-student-lbl').textContent = t.posStudentLbl;
    $('pos-phone-lbl').textContent = t.posPhoneLbl;
    $('pos-method-lbl').textContent = t.posMethodLbl;
    $('pos-status-lbl').textContent = t.posStatusLbl;
    $('pos-submit-btn').textContent = t.posSubmit;

    $('invoices-heading').textContent = t.invoicesHeading;
    $('export-csv-btn').textContent = t.exportCsv;
    $('invoice-search-input').placeholder = t.invSearchPh;
    const invFilterOpts = $('invoice-status-filter').options;
    invFilterOpts[0].textContent = t.allStatuses;
    invFilterOpts[1].textContent = t.paid;
    invFilterOpts[2].textContent = t.pending;
    invFilterOpts[3].textContent = t.voided;
    invFilterOpts[4].textContent = t.refunded;
    const posStatOpts = $('pos-status-select').options;
    posStatOpts[0].textContent = t.paid;
    posStatOpts[1].textContent = t.pending;
    $('th-inv-no').textContent = t.thInvNo;
    $('th-inv-student').textContent = t.thInvStu;
    $('th-inv-amt').textContent = t.thInvAmt;
    $('th-inv-stat').textContent = t.thInvStat;
    $('th-inv-act').textContent = t.thInvAct;

    $('tracker-heading').textContent = t.trackerHeading;
    $('student-search-input').placeholder = t.stuSearchPh;
    $('th-stu-pass').textContent = t.thStuPass;
    $('th-stu-name').textContent = t.thStuName;
    $('th-stu-pkg').textContent = t.thStuPkg;
    $('th-stu-left').textContent = t.thStuLeft;
    $('th-stu-act').textContent = t.thStuAct;
    $('crm-heading').textContent = t.crmHeading;
    $('crm-lead-name').placeholder = t.leadNamePh;
    $('crm-lead-phone').placeholder = t.leadPhonePh;
    $('crm-add-btn').textContent = t.addLeadBtn;
    const stageOpts = $('crm-lead-stage').options;
    stageOpts[0].textContent = t.stageInquiry;
    stageOpts[1].textContent = t.stageTrialSched;
    stageOpts[2].textContent = t.stageTrialDone;

    $('checkin-heading').textContent = t.checkinHeading;
    $('checkin-pass-lbl').textContent = t.checkinPassLbl;
    $('checkin-slot-lbl').textContent = t.checkinSlotLbl;
    $('checkin-btn').textContent = t.checkinBtn;
    $('qr-scan-btn').textContent = t.qrScanBtn;
    if ($('qr-upload-btn')) $('qr-upload-btn').textContent = t.qrUploadBtn;
    if ($('qr-stop-btn')) $('qr-stop-btn').textContent = t.qrStopBtn;
    $('parent-portal-heading').textContent = t.parentPortalHeading;
    $('parent-portal-lbl').textContent = t.parentPortalLbl;

    $('branch-heading').textContent = t.branchHeading;
    $('branch-code-input').placeholder = t.branchCodePh;
    $('branch-name-input').placeholder = t.branchNamePh;
    $('add-branch-btn').textContent = t.addBranchBtn;
    $('licensing-heading').textContent = t.licensingHeading;
    $('licensing-subtitle').textContent = t.licensingSubtitle;
    $('footer-copy').textContent = t.footerCopy;
    $('footer-support-lbl').textContent = t.supportLbl;

    $('receipt-title').textContent = t.receiptTitle;
    $('receipt-print-btn').textContent = t.printBtn;
    $('receipt-close-btn').textContent = t.close;
    $('credit-modal-title').textContent = t.creditModalTitle;
    $('credit-plus-btn').textContent = t.creditPlus;
    $('credit-minus-btn').textContent = t.creditMinus;
    $('credit-close-btn').textContent = t.close;
    $('student-edit-title').textContent = t.stuEditTitle;
    $('edit-stu-name-lbl').textContent = t.stuEditName;
    $('edit-stu-phone-lbl').textContent = t.stuEditPhone;
    $('edit-stu-guardian-lbl').textContent = t.stuEditGuardian;
    $('edit-student-close-btn').textContent = t.cancelBtn;
    $('edit-student-save-btn').textContent = t.saveChanges;

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === lang));
    });
    renderAll();
  }

  function renderBranchSelects() {
    const sel = $('branch-select');
    const filterSel = $('student-branch-filter');
    const t = I18N[lang];
    if (sel) {
      const opts = state.branches.map((b) => {
        const o = document.createElement('option');
        o.value = b.id || b.code;
        o.textContent = `${b.name} (${b.code})`;
        return o;
      });
      sel.replaceChildren(...opts);
      if (state.branches.some((b) => (b.id || b.code) === state.branchId)) {
        sel.value = state.branchId;
      }
    }
    if (filterSel) {
      const prev = filterSel.value || 'ALL';
      const opts = [el('option', '', t.allBranches)];
      opts[0].value = 'ALL';
      for (const b of state.branches) {
        const o = el('option', '', `${b.name} (${b.code})`);
        o.value = b.code;
        opts.push(o);
      }
      filterSel.replaceChildren(...opts);
      if (prev === 'ALL' || state.branches.some((b) => b.code === prev)) filterSel.value = prev;
    }
  }

  function renderBiChart() {
    const svg = $('bi-revenue-svg');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const t = I18N[lang];
    const activeInvs = state.invoices.filter((i) => i.status === 'Paid' || i.status === 'Pending');
    const methods = [
      { key: 'fps', label: t.methods.fps, color: '#38bdf8' },
      { key: 'card', label: t.methods.card, color: '#10b981' },
      { key: 'cash', label: t.methods.cash, color: '#f59e0b' },
      { key: 'usdc', label: t.methods.usdc, color: '#a78bfa' },
    ];
    const totals = methods.map((m) => ({
      ...m,
      val: activeInvs
        .filter((inv) => inv.method === m.key)
        .reduce((sum, inv) => sum + Number(inv.amountHkd || 0), 0),
    }));
    const grandTotal = totals.reduce((s, x) => s + x.val, 0);
    const maxVal = Math.max(1000, ...totals.map((x) => x.val));
    $('bi-total-rev').textContent = 'HK$' + grandTotal.toLocaleString();

    const ns = 'http://www.w3.org/2000/svg';
    totals.forEach((item, idx) => {
      const x = 35 + idx * 95;
      const barH = Math.max(8, Math.round((item.val / maxVal) * 110));
      const y = 140 - barH;

      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '50');
      rect.setAttribute('height', String(barH));
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', item.color);
      svg.appendChild(rect);

      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', String(x + 25));
      lbl.setAttribute('y', '162');
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('fill', '#cbd5e1');
      lbl.setAttribute('font-size', '11');
      lbl.textContent = item.label;
      svg.appendChild(lbl);

      const valTxt = document.createElementNS(ns, 'text');
      valTxt.setAttribute('x', String(x + 25));
      valTxt.setAttribute('y', String(y - 6));
      valTxt.setAttribute('text-anchor', 'middle');
      valTxt.setAttribute('fill', '#f8fafc');
      valTxt.setAttribute('font-size', '11');
      valTxt.textContent = '$' + item.val;
      svg.appendChild(valTxt);
    });

    const pct = serverBackendActive && serverAnalytics
      ? serverAnalytics.kpis.attendanceRatePct
      : (state.attendanceTotal > 0 ? Math.round((state.attendancePresent / state.attendanceTotal) * 100) : 100);
    $('bi-attendance-pct').textContent = pct + '%';
    $('bi-attendance-bar').style.width = pct + '%';
  }

  function renderDashboard() {
    const t = I18N[lang];
    const totalCredits = state.packages.reduce((s, p) => s + p.remainingCredits, 0);
    const renewals = state.packages.filter((p) => p.remainingCredits <= 2);
    $('m-students-val').textContent = String(state.packages.length);
    $('m-credits-val').textContent = String(totalCredits);
    $('m-renewals-val').textContent = String(renewals.length);
    $('m-invoices-val').textContent = String(state.invoices.length);

    renderBiChart();

    const rq = $('renewal-queue-list');
    if (!rq) return;
    if (renewals.length === 0) {
      rq.replaceChildren(el('div', 'muted', t.emptyRenewals));
      return;
    }
    const nodes = renewals.map((p) => {
      const row = el('div', 'roster-row');
      const info = el('div');
      info.appendChild(el('strong', '', `${p.studentName} (${p.passCode})`));
      info.appendChild(el('div', 'muted', `${p.courseTitle} — ${p.remainingCredits} ${t.creditsLeftSuffix}`));
      const btn = el('button', 'btn btn-sm btn-primary', t.topUpPos);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        $('pos-student-input').value = p.studentName;
        $('pos-phone-input').value = p.phone || '';
        switchView('pos');
      });
      row.append(info, btn);
      return row;
    });
    rq.replaceChildren(...nodes);
  }

  function renderTimetable() {
    const grid = $('timetable-grid');
    if (!grid) return;
    const t = I18N[lang];
    const cards = state.slots.map((slot) => {
      const btn = el('button', 'slot-card');
      btn.type = 'button';
      btn.setAttribute('data-slot-id', slot.id);
      const dayLbl = slot.dayOfWeek ? `${t.days[slot.dayOfWeek]} ${slot.startTime || ''}` : slot.day;
      btn.appendChild(el('div', 'pill pill-ok', dayLbl));
      btn.appendChild(el('div', '', slot.title));
      btn.appendChild(el('div', 'muted', `${slot.room} · ${slot.teacher} (${slot.passes.length})`));
      btn.addEventListener('click', () => {
        activeSlotId = slot.id;
        renderRosterDrawer();
      });
      return btn;
    });
    grid.replaceChildren(...cards);
    if (activeSlotId) renderRosterDrawer();
  }

  function renderRosterDrawer() {
    const t = I18N[lang];
    const drawer = $('roster-drawer');
    const list = $('roster-list');
    const enrollSel = $('roster-enroll-select');
    const slot = state.slots.find((s) => s.id === activeSlotId);
    if (!drawer || !list || !slot) {
      if (drawer) drawer.hidden = true;
      return;
    }
    drawer.hidden = false;
    const dayLbl = slot.dayOfWeek ? `${t.days[slot.dayOfWeek]} ${slot.startTime || ''}` : slot.day;
    $('roster-slot-title').textContent = `${t.rosterPrefix}: ${dayLbl} — ${slot.title} (${slot.teacher})`;

    if (enrollSel) {
      const opts = state.packages.map((p) => {
        const o = el('option', '', `${p.studentName} (${p.passCode})`);
        o.value = p.passCode;
        return o;
      });
      enrollSel.replaceChildren(...opts);
    }

    const rows = slot.passes.map((code) => {
      const pkg = state.packages.find((p) => p.passCode === code);
      const row = el('div', 'roster-row');
      const left = el('div');
      left.appendChild(el('strong', '', pkg ? `${pkg.studentName} (${code})` : code));
      left.appendChild(el('div', 'muted', pkg ? `${pkg.remainingCredits} ${t.creditsLeftSuffix}` : '—'));

      const actions = el('div', 'toolbar');
      const bPresent = el('button', 'btn btn-sm btn-ok', t.presentBtn);
      bPresent.type = 'button';
      bPresent.addEventListener('click', () => handleSlotAttendance(slot.id, code, 'Present'));
      const bAbsent = el('button', 'btn btn-sm', t.absentBtn);
      bAbsent.type = 'button';
      bAbsent.addEventListener('click', () => handleSlotAttendance(slot.id, code, 'Absent'));
      const bMakeup = el('button', 'btn btn-sm', t.makeupBtn);
      bMakeup.type = 'button';
      bMakeup.addEventListener('click', () => handleSlotAttendance(slot.id, code, 'Makeup'));
      actions.append(bPresent, bAbsent, bMakeup);
      row.append(left, actions);
      return row;
    });
    list.replaceChildren(...rows);
  }

  async function handleSlotAttendance(slotId, passCode, status) {
    if (serverBackendActive) {
      try {
        await apiJson(`/api/schedule/${encodeURIComponent(slotId)}/attendance`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            passCode,
            slotKey: `${slotId}-${Date.now()}`,
            status,
          }),
        });
        await syncFromServer();
        renderAll();
      } catch (err) {
        showBox($('checkin-status'), err.message, 'error');
      }
      return;
    }

    const pkg = state.packages.find((p) => p.passCode === passCode);
    if (!pkg) return;
    if (status === 'Present') {
      performCheckIn(passCode, slotId);
      state.attendancePresent += 1;
      state.attendanceTotal += 1;
    } else if (status === 'Absent') {
      state.attendanceTotal += 1;
      pkg.history.unshift(`${slotId} ${I18N[lang].absentBtn} (0)`);
    } else if (status === 'Makeup') {
      pkg.remainingCredits += 1;
      pkg.history.unshift(`${slotId} ${I18N[lang].makeupBtn}`);
      state.ledger.unshift({ ts: new Date().toISOString().slice(0, 10), passCode, delta: '+1', note: `Makeup (${slotId})` });
    }
    saveState();
    renderAll();
  }

  function computeCartTotal() {
    const subtotal = cart.reduce((s, item) => s + item.priceHkd * item.qty, 0);
    const dtype = $('pos-discount-type')?.value || 'none';
    const dval = Math.max(0, Number($('pos-discount-val')?.value || 0));
    let discountHkd = 0;
    if (dtype === 'pct') discountHkd = Math.round(subtotal * Math.min(100, dval) / 100);
    if (dtype === 'hkd') discountHkd = Math.min(subtotal, dval);
    return { subtotal, discountHkd, total: Math.max(0, subtotal - discountHkd) };
  }

  function invoiceStatusText(status) {
    const t = I18N[lang];
    if (status === 'Paid') return t.paid;
    if (status === 'Pending') return t.pending;
    if (status === 'Voided') return t.voided;
    if (status === 'Refunded') return t.refunded;
    return status;
  }

  function renderPos() {
    const t = I18N[lang];
    const catGrid = $('pos-catalog-grid');
    if (catGrid) {
      const btns = state.catalog.map((item) => {
        const b = el('button', 'catalog-btn');
        b.type = 'button';
        b.appendChild(el('strong', '', item.title));
        b.appendChild(el('div', 'muted', `HK$${item.priceHkd} · ${item.credits} cr`));
        b.addEventListener('click', () => {
          const found = cart.find((c) => c.id === item.id);
          if (found) found.qty += 1;
          else cart.push({ ...item, qty: 1 });
          renderPos();
        });
        return b;
      });
      catGrid.replaceChildren(...btns);
    }

    const cartList = $('pos-cart-list');
    if (cartList) {
      if (cart.length === 0) {
        cartList.replaceChildren(el('div', 'muted', t.cartEmpty));
      } else {
        const rows = cart.map((c, idx) => {
          const row = el('div', 'cart-row');
          row.appendChild(el('span', '', `${c.title} × ${c.qty} (HK$${c.priceHkd * c.qty})`));
          const rm = el('button', 'btn btn-sm', '×');
          rm.type = 'button';
          rm.addEventListener('click', () => {
            cart.splice(idx, 1);
            renderPos();
          });
          row.appendChild(rm);
          return row;
        });
        cartList.replaceChildren(...rows);
      }
    }

    const { total } = computeCartTotal();
    if ($('pos-cart-total')) $('pos-cart-total').textContent = `HK$${total.toLocaleString()}`;

    const q = ($('invoice-search-input')?.value || '').trim().toLowerCase();
    const sf = $('invoice-status-filter')?.value || 'ALL';
    const filtered = state.invoices.filter((inv) => {
      if (sf !== 'ALL' && inv.status !== sf) return false;
      if (q && !`${inv.invoiceNo} ${inv.studentName}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const invBody = $('invoices-tbody');
    if (invBody) {
      const rows = filtered.map((inv) => {
        const tr = el('tr');
        tr.appendChild(el('td', '', inv.invoiceNo));
        tr.appendChild(el('td', '', inv.studentName));
        tr.appendChild(el('td', '', `HK$${inv.amountHkd}`));
        const tdStat = el('td');
        const pillCls = inv.status === 'Paid' ? 'pill pill-ok' : inv.status === 'Pending' ? 'pill pill-warn' : 'pill pill-muted';
        tdStat.appendChild(el('span', pillCls, invoiceStatusText(inv.status)));
        tr.appendChild(tdStat);

        const tdBtn = el('td');
        const wrap = el('div', 'toolbar');
        const bRec = el('button', 'btn btn-sm', t.receiptBtn);
        bRec.type = 'button';
        bRec.addEventListener('click', () => openReceiptModal(inv));
        wrap.appendChild(bRec);

        if (inv.status === 'Pending') {
          const bPay = el('button', 'btn btn-sm btn-ok', t.markPaidBtn);
          bPay.type = 'button';
          bPay.addEventListener('click', () => handleMarkPaid(inv));
          const bVoid = el('button', 'btn btn-sm', t.voidBtn);
          bVoid.type = 'button';
          bVoid.addEventListener('click', () => handleVoidOrRefund(inv, 'Voided'));
          wrap.append(bPay, bVoid);
        } else if (inv.status === 'Paid') {
          const bRef = el('button', 'btn btn-sm', t.refundBtn);
          bRef.type = 'button';
          bRef.addEventListener('click', () => handleVoidOrRefund(inv, 'Refunded'));
          wrap.appendChild(bRef);
        }

        tdBtn.appendChild(wrap);
        tr.appendChild(tdBtn);
        return tr;
      });
      invBody.replaceChildren(...rows);
    }
  }

  async function handleMarkPaid(inv) {
    if (serverBackendActive) {
      await apiJson(`/api/invoices/${encodeURIComponent(inv.id)}/pay`, { method: 'POST' });
      await syncFromServer();
      renderAll();
      return;
    }
    inv.status = 'Paid';
    saveState();
    renderAll();
  }

  async function handleVoidOrRefund(inv, target) {
    if (serverBackendActive) {
      const ep = target === 'Refunded' ? 'refund' : 'void';
      await apiJson(`/api/invoices/${encodeURIComponent(inv.id)}/${ep}`, { method: 'POST' });
      await syncFromServer();
      renderAll();
      return;
    }
    inv.status = target;
    for (const code of inv.passCodes || []) {
      const pkg = state.packages.find((p) => p.passCode === code);
      if (pkg && pkg.remainingCredits > 0) {
        const rev = Math.min(pkg.remainingCredits, pkg.totalCredits);
        pkg.remainingCredits -= rev;
        state.ledger.unshift({
          ts: new Date().toISOString().slice(0, 10),
          passCode: code,
          delta: `-${rev}`,
          note: `${target} (${inv.invoiceNo})`,
        });
      }
    }
    saveState();
    renderAll();
  }

  function openReceiptModal(inv) {
    const meta = $('receipt-meta');
    const lines = $('receipt-lines');
    meta.replaceChildren(
      el('div', '', `Invoice #: ${inv.invoiceNo}`),
      el('div', '', `Student / Client: ${inv.studentName} (${inv.branch || state.branchId})`),
      el('div', '', `Payment: ${String(inv.method).toUpperCase()} · Status: ${invoiceStatusText(inv.status)} · Date: ${inv.createdAt}`)
    );
    const itemLines = (inv.items || []).map((it) =>
      el('div', '', `${it.title} × ${it.qty} — HK$${it.priceHkd * it.qty}`)
    );
    if (inv.discountHkd > 0) {
      itemLines.push(el('div', '', `Discount: -HK$${inv.discountHkd}`));
    }
    itemLines.push(el('strong', '', `Total: HK$${inv.amountHkd}`));
    lines.replaceChildren(...itemLines);
    $('receipt-modal').hidden = false;
  }

  function renderCrm() {
    const t = I18N[lang];
    const q = ($('student-search-input')?.value || '').trim().toLowerCase();
    const bf = $('student-branch-filter')?.value || 'ALL';

    const filteredPkgs = state.packages.filter((p) => {
      if (bf !== 'ALL' && p.branch !== bf) return false;
      if (q && !`${p.studentName} ${p.phone || ''} ${p.passCode} ${p.courseTitle}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const pkgBody = $('packages-tbody');
    if (pkgBody) {
      const rows = filteredPkgs.map((p) => {
        const tr = el('tr');
        tr.appendChild(el('td', '', p.passCode));
        tr.appendChild(el('td', '', p.studentName));
        tr.appendChild(el('td', '', p.courseTitle));
        const tdLeft = el('td');
        tdLeft.appendChild(el('span', p.remainingCredits <= 2 ? 'pill pill-warn' : 'pill pill-ok', `${p.remainingCredits}/${p.totalCredits}`));
        tr.appendChild(tdLeft);
        const tdAct = el('td');
        const actWrap = el('div', 'toolbar');
        const bAdj = el('button', 'btn btn-sm', t.adjustBtn);
        bAdj.type = 'button';
        bAdj.addEventListener('click', () => openCreditModal(p.passCode));
        const bEdit = el('button', 'btn btn-sm', t.editBtn);
        bEdit.type = 'button';
        bEdit.addEventListener('click', () => openStudentEditModal(p.passCode));
        actWrap.append(bAdj, bEdit);
        tdAct.appendChild(actWrap);
        tr.appendChild(tdAct);
        return tr;
      });
      pkgBody.replaceChildren(...rows);
    }

    const leadsBox = $('crm-leads-list');
    if (leadsBox) {
      const stageLabel = (s) => {
        if (s === 'Inquiry') return t.stageInquiry;
        if (s === 'Trial Scheduled' || s === 'Trial Booked') return t.stageTrialSched;
        if (s === 'Trial Done') return t.stageTrialDone;
        return t.stageEnrolled;
      };
      const rows = state.leads.map((lead) => {
        const row = el('div', 'roster-row');
        const info = el('div');
        info.appendChild(el('strong', '', `${lead.name} (${lead.phone})`));
        info.appendChild(el('div', 'muted', stageLabel(lead.stage)));
        const actions = el('div', 'toolbar');
        if (lead.stage !== 'Converted' && lead.stage !== 'Enrolled') {
          const btnConv = el('button', 'btn btn-sm btn-primary', t.convertBtn);
          btnConv.type = 'button';
          btnConv.addEventListener('click', () => handleConvertLead(lead));
          actions.appendChild(btnConv);
        } else {
          actions.appendChild(el('span', 'pill pill-ok', t.stageEnrolled));
        }
        row.append(info, actions);
        return row;
      });
      leadsBox.replaceChildren(...rows);
    }
  }

  async function handleConvertLead(lead) {
    if (serverBackendActive) {
      await apiJson(`/api/leads/${encodeURIComponent(lead.id)}/convert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: state.catalog[0]?.id }),
      });
      await syncFromServer();
      renderAll();
      return;
    }

    lead.stage = 'Enrolled';
    const passCode = makeSafePassCode(lead.name, lead.phone, state.packages.length + 1);
    const course = state.catalog.find((c) => c.id === lead.courseId) || state.catalog[0];
    state.packages.unshift({
      id: 'enr-' + Date.now(),
      studentId: 'stu-' + Date.now(),
      passCode,
      studentName: lead.name,
      phone: lead.phone,
      guardian: '',
      branch: state.branches[0]?.code || 'CWB',
      courseTitle: course ? course.title : 'Piano 10-Lesson Pack',
      totalCredits: course?.credits || 10,
      remainingCredits: course?.credits || 10,
      history: ['Converted from CRM Trial'],
    });
    saveState();
    renderAll();
  }

  function openCreditModal(passCode) {
    activeCreditPass = passCode;
    const pkg = state.packages.find((p) => p.passCode === passCode);
    if (!pkg) return;
    $('credit-modal-student').textContent = `${pkg.studentName} (${pkg.passCode}) — ${pkg.remainingCredits} ${I18N[lang].creditsLeftSuffix}`;
    const logBox = $('credit-ledger-log');
    const entries = state.ledger.filter((l) => l.passCode === passCode).slice(0, 6);
    logBox.replaceChildren(...entries.map((e) => el('div', 'muted', `${e.ts} | ${e.delta} | ${e.note}`)));
    $('credit-modal').hidden = false;
  }

  function openStudentEditModal(passCode) {
    editingStudentPass = passCode;
    const pkg = state.packages.find((p) => p.passCode === passCode);
    if (!pkg) return;
    $('edit-student-name').value = pkg.studentName;
    $('edit-student-phone').value = pkg.phone || '';
    $('edit-student-guardian').value = pkg.guardian || '';
    $('student-edit-modal').hidden = false;
  }

  function renderQrAndParentPortal() {
    const t = I18N[lang];
    const passCode = ($('checkin-pass-input')?.value || 'PASS-ALICE01').trim();
    const pkg = state.packages.find((p) => p.passCode === passCode) || state.packages[0];
    const img = $('pass-svg-img');
    if (img) {
      if ((serverBackendActive && !serverAuthenticated) || !pkg) {
        img.hidden = true;
        img.removeAttribute('src');
      } else {
        img.hidden = false;
        if (serverBackendActive) {
          img.src = `/api/pass/${encodeURIComponent(pkg.passCode)}.svg`;
        } else {
          const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const previewSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="120" viewBox="0 0 380 120"><rect width="380" height="120" rx="10" fill="#f8fafc" stroke="#cbd5e1"/><text x="16" y="30" font-family="sans-serif" font-size="11" font-weight="700" fill="#475569">SANDBOX PASS PREVIEW</text><text x="16" y="56" font-family="sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(pkg.studentName)}</text><text x="16" y="78" font-family="sans-serif" font-size="12" fill="#334155">${esc(pkg.courseTitle)}</text><text x="16" y="98" font-family="sans-serif" font-size="11" fill="#64748b">${esc(pkg.passCode)} · ${Number(pkg.remainingCredits) || 0} left</text></svg>`;
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg)}`;
        }
      }
    }

    const sel = $('parent-portal-select');
    if (sel) {
      const prev = sel.value;
      const opts = state.packages.map((p) => {
        const o = document.createElement('option');
        o.value = p.passCode;
        o.textContent = `${p.studentName} (${p.passCode})`;
        return o;
      });
      sel.replaceChildren(...opts);
      if (prev && state.packages.some((p) => p.passCode === prev)) sel.value = prev;
    }

    const selectedPkg = state.packages.find((p) => p.passCode === (sel?.value || '')) || state.packages[0];
    const pp = $('parent-portal-preview');
    if (pp) {
      if (!selectedPkg || (serverBackendActive && !serverAuthenticated)) {
        pp.replaceChildren();
      } else {
        const badges = (selectedPkg.history || []).slice(0, 4).map((h) => el('div', 'pill pill-ok', h));
        const wrap = el('div', 'form-grid');
        wrap.appendChild(el('strong', '', `${t.parentPortalHeading} — ${selectedPkg.studentName}`));
        wrap.appendChild(el('div', 'muted', `${selectedPkg.courseTitle} (${selectedPkg.branch || 'CWB'})`));
        wrap.appendChild(el('div', '', `${t.parentPortalRemaining}: ${selectedPkg.remainingCredits} / ${selectedPkg.totalCredits}`));
        wrap.appendChild(el('div', 'muted', t.parentPortalHistory));
        const badgeRow = el('div', 'toolbar');
        badgeRow.append(...badges);
        wrap.appendChild(badgeRow);
        pp.replaceChildren(wrap);
      }
    }
  }

  function renderBranchesAndLicensing() {
    const t = I18N[lang];
    const list = $('branch-list');
    if (list) {
      const rows = state.branches.map((b) => {
        const row = el('div', 'roster-row');
        const left = el('div', 'toolbar');
        const label = el('strong', '', `${b.name} (${b.code})`);
        const inp = el('input', 'text-input');
        inp.value = b.name;
        inp.style.maxWidth = '210px';
        inp.hidden = true;
        left.append(label, inp);

        const right = el('div', 'toolbar');
        right.appendChild(el('span', 'pill pill-ok', t.activeStatus));
        const bRename = el('button', 'btn btn-sm', t.renameBtn);
        bRename.type = 'button';
        bRename.addEventListener('click', async () => {
          if (inp.hidden) {
            inp.hidden = false;
            label.hidden = true;
            bRename.textContent = t.saveBtn;
            inp.focus();
          } else {
            const nextName = inp.value.trim();
            if (nextName) {
              if (serverBackendActive) {
                await apiJson(`/api/branches/${encodeURIComponent(b.id)}`, {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name: nextName }),
                });
                await syncFromServer();
              } else {
                b.name = nextName;
                saveState();
              }
            }
            renderAll();
          }
        });
        right.appendChild(bRename);
        row.append(left, right);
        return row;
      });
      list.replaceChildren(...rows);
    }

    const count = state.branches.length;
    const qp = $('branch-quota-pill');
    if (qp) {
      qp.textContent = `${count} Branches`;
    }

    const banner = $('branch-license-banner');
    if (banner && !banner.dataset.errorHold) {
      banner.className = 'status-box ok';
      banner.textContent = t.mitBannerOk;
    }
  }

  function renderAll() {
    renderBranchSelects();
    renderDashboard();
    renderTimetable();
    renderPos();
    renderCrm();
    renderQrAndParentPortal();
    renderBranchesAndLicensing();
  }

  function performCheckIn(passCode, slotKey) {
    const statusBox = $('checkin-status');
    const pkg = state.packages.find((p) => p.passCode.toUpperCase() === passCode.toUpperCase());
    if (!pkg) {
      showBox(statusBox, `Pass ${passCode} not found.`, 'error');
      return false;
    }
    const dedupe = `${pkg.passCode}::${slotKey}`;
    if (state.checkedInSlots[dedupe]) {
      showBox(statusBox, `Already checked in for slot ${slotKey}.`, 'error');
      return false;
    }
    if (pkg.remainingCredits <= 0) {
      showBox(statusBox, `Pass ${pkg.passCode} has 0 credits left.`, 'error');
      return false;
    }
    pkg.remainingCredits -= 1;
    state.checkedInSlots[dedupe] = true;
    pkg.history.unshift(`${slotKey} Present (-1)`);
    saveState();
    showBox(statusBox, `Checked in ${pkg.studentName} (${pkg.passCode}). Remaining: ${pkg.remainingCredits}.`, 'ok');
    return true;
  }

  let qrCameraStream = null;
  let qrScanRaf = 0;

  function stopQrCamera() {
    if (qrScanRaf) {
      cancelAnimationFrame(qrScanRaf);
      qrScanRaf = 0;
    }
    if (qrCameraStream) {
      for (const track of qrCameraStream.getTracks()) {
        track.stop();
      }
      qrCameraStream = null;
    }
    const video = $('qr-video');
    if (video) video.srcObject = null;
    const wrap = $('qr-camera-wrap');
    if (wrap) wrap.hidden = true;
  }

  function applyScannedPassCode(rawValue) {
    const code = String(rawValue || '').trim();
    if (!code) return false;
    if ($('checkin-pass-input')) $('checkin-pass-input').value = code;
    renderQrAndParentPortal();
    showBox($('checkin-status'), `Scanned pass ${code} — click Check In to deduct 1 credit.`, 'ok');
    return true;
  }

  function clearAuthenticatedState() {
    stopQrCamera();
    state = emptyServerState();
    cart = [];
    serverAnalytics = null;
    serverTeachers = [];
    activeSlotId = null;
    activeCreditPass = null;
    editingStudentPass = null;
    for (const modalId of ['roster-drawer', 'receipt-modal', 'credit-modal', 'student-edit-modal', 'pos-status', 'checkin-status']) {
      if ($(modalId)) $(modalId).hidden = true;
    }
    if ($('pos-student-input')) $('pos-student-input').value = '';
    if ($('pos-phone-input')) $('pos-phone-input').value = '';
    if ($('checkin-pass-input')) $('checkin-pass-input').value = '';
    if ($('pass-svg-img')) {
      $('pass-svg-img').hidden = true;
      $('pass-svg-img').removeAttribute('src');
    }
    renderAll();
  }

  function updateAuthUi() {
    const loginBar = $('auth-login-bar');
    const logoutBtn = $('auth-logout-btn');
    if (loginBar) loginBar.hidden = !serverBackendActive || serverAuthenticated;
    if (logoutBtn) logoutBtn.hidden = !serverBackendActive || !serverAuthenticated;
  }

  async function initBackend() {
    try {
      const res = await fetch('/api/health', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.mode === 'sqlite-server') {
        serverBackendActive = true;
        const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (meRes.ok) {
          const me = await meRes.json();
          serverAuthenticated = Boolean(me && me.authenticated);
        }
        updateAuthUi();
        if (serverAuthenticated) {
          await syncFromServer();
        } else {
          clearAuthenticatedState();
        }
        applyLang(lang);
      }
    } catch {
      // stay in client sandbox mode
    }
  }

  // Event wiring
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
  });
  $('sidebar-toggle-btn')?.addEventListener('click', () => {
    $('app-sidebar').classList.toggle('open');
    $('sidebar-backdrop').hidden = !$('app-sidebar').classList.contains('open');
  });
  $('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  $('lang-zh-hk')?.addEventListener('click', () => applyLang('zh-HK'));
  $('lang-zh-cn')?.addEventListener('click', () => applyLang('zh-CN'));
  $('lang-en')?.addEventListener('click', () => applyLang('en'));

  $('branch-select')?.addEventListener('change', async (e) => {
    state.branchId = e.target.value;
    saveState();
    if (serverBackendActive) await syncFromServer();
    renderAll();
  });

  $('reset-demo-btn')?.addEventListener('click', () => {
    if (serverBackendActive) return;
    state = defaultState();
    saveState();
    renderAll();
  });

  $('slot-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dayOfWeek = Number($('slot-day-select').value || 1);
    const startTime = $('slot-start-input').value.trim();
    const endTime = $('slot-end-input').value.trim();
    const title = $('slot-title-input').value.trim();
    const room = $('slot-room-input').value.trim();
    const teacherName = $('slot-teacher-input').value.trim();
    if (!title) return;

    if (serverBackendActive) {
      const normTitle = title.toLowerCase();
      const normTeacher = teacherName.toLowerCase();
      const matchedCourse = state.catalog.find(
        (c) => c.kind === 'course' && (!c.branchId || c.branchId === state.branchId) && c.title.trim().toLowerCase() === normTitle
      );
      const matchedTeacher = serverTeachers.find(
        (tc) => (!tc.branchId || tc.branchId === state.branchId) && String(tc.fullName || '').trim().toLowerCase() === normTeacher
      );
      await apiJson('/api/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId: state.branchId,
          ...(matchedCourse ? { courseId: matchedCourse.id } : { courseTitle: title }),
          ...(matchedTeacher ? { teacherId: matchedTeacher.id } : { teacherName: teacherName || 'Staff Instructor' }),
          dayOfWeek,
          startTime,
          endTime,
          room,
        }),
      });
      await syncFromServer();
    } else {
      state.slots.push({
        id: `SLOT-${Date.now()}`,
        dayOfWeek,
        day: `${I18N[lang].days[dayOfWeek]} ${startTime}`,
        startTime,
        endTime,
        title,
        room,
        teacher: teacherName,
        passes: [],
      });
      saveState();
    }
    $('slot-title-input').value = '';
    renderTimetable();
  });

  $('roster-close-btn')?.addEventListener('click', () => {
    activeSlotId = null;
    $('roster-drawer').hidden = true;
  });

  $('roster-delete-btn')?.addEventListener('click', async () => {
    if (!activeSlotId) return;
    if (serverBackendActive) {
      await apiJson(`/api/schedule/${encodeURIComponent(activeSlotId)}`, { method: 'DELETE' });
      activeSlotId = null;
      await syncFromServer();
    } else {
      state.slots = state.slots.filter((s) => s.id !== activeSlotId);
      activeSlotId = null;
      saveState();
    }
    $('roster-drawer').hidden = true;
    renderTimetable();
  });

  $('roster-enroll-btn')?.addEventListener('click', async () => {
    if (!activeSlotId) return;
    const passCode = $('roster-enroll-select')?.value;
    if (!passCode) return;
    if (serverBackendActive) {
      await apiJson(`/api/schedule/${encodeURIComponent(activeSlotId)}/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passCode }),
      });
      await syncFromServer();
    } else {
      const slot = state.slots.find((s) => s.id === activeSlotId);
      if (slot && !slot.passes.includes(passCode)) {
        slot.passes.push(passCode);
        saveState();
      }
    }
    renderTimetable();
  });

  $('custom-item-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('custom-item-name').value.trim();
    const priceHkd = Math.max(1, Number($('custom-item-price').value || 100));
    const credits = Math.max(0, Number($('custom-item-credits').value || 0));
    if (!name) return;

    if (serverBackendActive) {
      const out = await apiJson('/api/catalog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId: state.branchId,
          title: name,
          kind: credits > 0 ? 'course' : 'material',
          defaultCredits: credits,
          priceCents: Math.round(priceHkd * 100),
        }),
      });
      cart.push({ id: out.item.id, title: name, kind: out.item.kind, priceHkd, credits, qty: 1 });
      await syncFromServer();
    } else {
      const item = { id: 'custom_' + Date.now(), title: name, kind: credits > 0 ? 'course' : 'material', priceHkd, credits };
      state.catalog.push(item);
      cart.push({ ...item, qty: 1 });
      saveState();
    }
    $('custom-item-name').value = '';
    renderPos();
  });

  $('pos-discount-type')?.addEventListener('change', renderPos);
  $('pos-discount-val')?.addEventListener('input', renderPos);
  $('invoice-search-input')?.addEventListener('input', renderPos);
  $('invoice-status-filter')?.addEventListener('change', renderPos);
  $('student-search-input')?.addEventListener('input', renderCrm);
  $('student-branch-filter')?.addEventListener('change', renderCrm);

  $('pos-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      showBox($('pos-status'), I18N[lang].cartEmpty, 'error');
      return;
    }
    const studentName = $('pos-student-input').value.trim();
    const phone = $('pos-phone-input').value.trim();
    const method = $('pos-method-select').value;
    const status = $('pos-status-select').value;
    const dtype = $('pos-discount-type')?.value || 'none';
    const dval = Math.max(0, Number($('pos-discount-val')?.value || 0));

    if (serverBackendActive) {
      try {
        const stuOut = await apiJson('/api/students', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ branchId: state.branchId, fullName: studentName, contactPhone: phone }),
        });
        const posOut = await apiJson('/api/pos/checkout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            branchId: state.branchId,
            studentId: stuOut.student.id,
            items: cart.map((c) => ({
              title: c.title,
              kind: c.credits > 0 ? 'course' : 'material',
              qty: c.qty,
              unitPriceCents: Math.round(c.priceHkd * 100),
              creditsPerUnit: c.credits || 1,
            })),
            discountType: dtype === 'pct' ? 'percent' : dtype === 'hkd' ? 'fixed' : undefined,
            discountValue: dtype === 'hkd' ? Math.round(dval * 100) : dval,
            paymentMethod: method,
            paymentStatus: status,
          }),
        });
        await syncFromServer();
        showBox($('pos-status'), `Issued ${posOut.invoice.invoiceNumber} for ${studentName}.`, 'ok');
        renderAll();
      } catch (err) {
        showBox($('pos-status'), err.message, 'error');
      }
      return;
    }

    const { discountHkd, total } = computeCartTotal();
    const totalCredits = cart.reduce((s, c) => s + c.credits * c.qty, 0);
    const branchCode = bCodeForId(state.branches, state.branchId);
    const passCode = makeSafePassCode(studentName, phone, state.packages.length + 1);
    const invoiceNo = `INV-${branchCode}-${new Date().getFullYear()}-${String(state.invoices.length + 1).padStart(4, '0')}`;
    const passCodes = [];

    if (totalCredits > 0) {
      state.packages.unshift({
        id: 'enr-' + Date.now(),
        studentId: 'stu-' + Date.now(),
        passCode,
        studentName,
        phone,
        guardian: '',
        branch: branchCode,
        courseTitle: cart.map((c) => c.title).join(' + '),
        totalCredits,
        remainingCredits: totalCredits,
        history: [`Enrolled (${invoiceNo})`],
      });
      passCodes.push(passCode);
    }
    state.invoices.unshift({
      id: 'inv-' + Date.now(),
      invoiceNo,
      studentName,
      branch: branchCode,
      passCodes,
      items: cart.map((c) => ({ title: c.title, qty: c.qty, priceHkd: c.priceHkd })),
      discountHkd,
      amountHkd: total,
      method,
      status,
      createdAt: new Date().toISOString().slice(0, 10),
    });
    saveState();
    showBox($('pos-status'), `Issued ${invoiceNo} (HK$${total}) for ${studentName}.`, 'ok');
    renderAll();
  });

  $('export-csv-btn')?.addEventListener('click', () => {
    if (serverBackendActive) {
      window.location.href = '/api/invoices/export.csv';
      return;
    }
    const header = 'invoiceNo,studentName,branch,amountHkd,method,status,createdAt\n';
    const esc = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = state.invoices
      .map((i) => [i.invoiceNo, i.studentName, i.branch, i.amountHkd, i.method, i.status, i.createdAt].map(esc).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'open-center-os-invoices.csv';
    a.click();
  });

  $('crm-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('crm-lead-name').value.trim();
    const phone = $('crm-lead-phone').value.trim();
    const stage = $('crm-lead-stage').value;
    if (!name) return;

    if (serverBackendActive) {
      await apiJson('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId: state.branchId, fullName: name, contactPhone: phone, stage }),
      });
      await syncFromServer();
    } else {
      state.leads.unshift({ id: 'L-' + Date.now(), name, phone, stage, courseId: state.catalog[0]?.id || 'piano10' });
      saveState();
    }
    $('crm-lead-name').value = '';
    $('crm-lead-phone').value = '';
    renderCrm();
  });

  $('credit-plus-btn')?.addEventListener('click', async () => {
    const pkg = state.packages.find((p) => p.passCode === activeCreditPass);
    if (!pkg) return;
    const note = $('credit-note-input').value.trim() || 'Makeup credit';
    if (serverBackendActive) {
      await apiJson(`/api/students/${encodeURIComponent(pkg.studentId)}/adjust`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enrollmentId: pkg.id, delta: 1, reason: note }),
      });
      await syncFromServer();
    } else {
      pkg.remainingCredits += 1;
      state.ledger.unshift({ ts: new Date().toISOString().slice(0, 10), passCode: pkg.passCode, delta: '+1', note });
      saveState();
    }
    openCreditModal(pkg.passCode);
    renderAll();
  });

  $('credit-minus-btn')?.addEventListener('click', async () => {
    const pkg = state.packages.find((p) => p.passCode === activeCreditPass);
    if (!pkg || pkg.remainingCredits <= 0) return;
    const note = $('credit-note-input').value.trim() || 'Manual deduction';
    if (serverBackendActive) {
      await apiJson(`/api/students/${encodeURIComponent(pkg.studentId)}/adjust`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enrollmentId: pkg.id, delta: -1, reason: note }),
      });
      await syncFromServer();
    } else {
      pkg.remainingCredits -= 1;
      state.ledger.unshift({ ts: new Date().toISOString().slice(0, 10), passCode: pkg.passCode, delta: '-1', note });
      saveState();
    }
    openCreditModal(pkg.passCode);
    renderAll();
  });

  $('credit-close-btn')?.addEventListener('click', () => {
    $('credit-modal').hidden = true;
  });

  $('edit-student-close-btn')?.addEventListener('click', () => {
    $('student-edit-modal').hidden = true;
  });

  $('edit-student-save-btn')?.addEventListener('click', async () => {
    const pkg = state.packages.find((p) => p.passCode === editingStudentPass);
    if (!pkg) return;
    const fullName = $('edit-student-name').value.trim();
    const contactPhone = $('edit-student-phone').value.trim();
    const guardianName = $('edit-student-guardian').value.trim();
    if (!fullName) return;

    if (serverBackendActive) {
      await apiJson(`/api/students/${encodeURIComponent(pkg.studentId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName, contactPhone, guardianName }),
      });
      await syncFromServer();
    } else {
      for (const p of state.packages) {
        if (p.passCode === editingStudentPass) {
          p.studentName = fullName;
          p.phone = contactPhone;
          p.guardian = guardianName;
        }
      }
      saveState();
    }
    $('student-edit-modal').hidden = true;
    renderAll();
  });

  $('checkin-btn')?.addEventListener('click', async () => {
    const passCode = $('checkin-pass-input').value.trim();
    const slotKey = $('checkin-slot-input').value.trim() || currentLocalSlotKey();
    if (serverBackendActive) {
      try {
        const out = await apiJson('/api/checkin', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ passCode, slotKey }),
        });
        await syncFromServer();
        showBox($('checkin-status'), `Checked in ${out.enrollment.passCode}. Remaining: ${out.enrollment.remainingCredits}.`, 'ok');
        renderAll();
      } catch (err) {
        showBox($('checkin-status'), err.message, 'error');
      }
      return;
    }
    if (performCheckIn(passCode, slotKey)) {
      renderAll();
    }
  });

  $('qr-scan-btn')?.addEventListener('click', async () => {
    const statusBox = $('checkin-status');
    if (qrCameraStream) {
      stopQrCamera();
      return;
    }
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showBox(statusBox, 'Live camera BarcodeDetector is unavailable in this browser — enter Pass Code above or use Scan QR Image.', '');
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      qrCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = $('qr-video');
      const wrap = $('qr-camera-wrap');
      if (!video || !wrap) {
        stopQrCamera();
        return;
      }
      video.srcObject = qrCameraStream;
      await video.play();
      wrap.hidden = false;
      showBox(statusBox, 'Camera active — point a student QR pass at the lens.', 'ok');

      const tick = async () => {
        if (!qrCameraStream) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (codes && codes.length > 0 && codes[0].rawValue) {
              stopQrCamera();
              applyScannedPassCode(codes[0].rawValue);
              return;
            }
          }
        } catch {
          // continue scanning frames
        }
        qrScanRaf = requestAnimationFrame(tick);
      };
      qrScanRaf = requestAnimationFrame(tick);
    } catch (err) {
      stopQrCamera();
      showBox(statusBox, `Camera access failed (${err?.message || 'permission denied'}). Enter Pass Code above or use Scan QR Image.`, 'error');
    }
  });

  $('qr-stop-btn')?.addEventListener('click', () => {
    stopQrCamera();
  });

  $('qr-upload-btn')?.addEventListener('click', () => {
    $('qr-file-input')?.click();
  });

  $('qr-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const statusBox = $('checkin-status');
    if (!('BarcodeDetector' in window)) {
      showBox(statusBox, 'BarcodeDetector API unavailable in this browser — enter Pass Code manually above.', 'error');
      return;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      try {
        const codes = await detector.detect(bitmap);
        if (codes && codes.length > 0 && codes[0].rawValue) {
          applyScannedPassCode(codes[0].rawValue);
        } else {
          showBox(statusBox, 'No QR code detected in the selected image.', 'error');
        }
      } finally {
        bitmap.close();
      }
    } catch (err) {
      showBox(statusBox, err?.message || 'Failed to decode QR image.', 'error');
    }
  });

  $('parent-portal-select')?.addEventListener('change', renderQrAndParentPortal);

  $('branch-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = I18N[lang];
    const code = $('branch-code-input').value.trim().toUpperCase();
    const name = $('branch-name-input').value.trim();
    const banner = $('branch-license-banner');
    if (!code || !name) return;

    if (serverBackendActive) {
      try {
        await apiJson('/api/branches', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, name }),
        });
        delete banner.dataset.errorHold;
        await syncFromServer();
        $('branch-code-input').value = '';
        $('branch-name-input').value = '';
        renderAll();
      } catch (err) {
        banner.dataset.errorHold = '1';
        showBox(banner, err.message, 'error');
      }
      return;
    }

    delete banner.dataset.errorHold;
    state.branches.push({ id: code, code, name });
    $('branch-code-input').value = '';
    $('branch-name-input').value = '';
    saveState();
    renderAll();
  });

  $('receipt-close-btn')?.addEventListener('click', () => {
    $('receipt-modal').hidden = true;
  });
  $('receipt-print-btn')?.addEventListener('click', () => window.print());

  $('auth-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusBox = $('auth-login-status');
    const password = $('auth-password-input').value;
    try {
      await apiJson('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      serverAuthenticated = true;
      $('auth-password-input').value = '';
      if (statusBox) statusBox.hidden = true;
      updateAuthUi();
      await syncFromServer();
      renderAll();
    } catch (err) {
      showBox(statusBox, err?.message || 'Sign-in failed.', 'error');
    }
  });

  $('auth-logout-btn')?.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    serverAuthenticated = false;
    updateAuthUi();
    clearAuthenticatedState();
  });

  if ($('checkin-slot-input') && !$('checkin-slot-input').value.trim()) {
    $('checkin-slot-input').value = currentLocalSlotKey();
  }
  applyLang(lang);
  initBackend();
})();
