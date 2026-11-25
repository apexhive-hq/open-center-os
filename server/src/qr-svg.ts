import qrcode from 'qrcode-generator';

function xmlEscape(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanLabel(raw: string, maxLen = 48): string {
  return xmlEscape(raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen));
}

function buildQrSvgPath(data: string, originX: number, originY: number, boxSize: number): string {
  const makeQr = (qrcode as unknown as { default?: typeof qrcode }).default ?? qrcode;
  const qr = makeQr(0, 'M');
  qr.addData(data, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 2;
  const totalModules = count + quiet * 2;
  const cell = Number((boxSize / totalModules).toFixed(3));
  const parts: string[] = [];
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.isDark(r, c)) {
        const x = Number((originX + (c + quiet) * cell).toFixed(2));
        const y = Number((originY + (r + quiet) * cell).toFixed(2));
        parts.push(`M${x} ${y}h${cell}v${cell}h-${cell}z`);
      }
    }
  }
  return parts.join('');
}

/**
 * Generates a real camera-scannable ISO QR matrix SVG student/client pass card.
 * Zero external CDN dependencies; all dynamic labels are strictly XML-escaped.
 */
export function renderStudentPassSvg(input: {
  passCode: string;
  studentName: string;
  branchName: string;
  courseTitle: string;
  remainingCredits: number;
}): string {
  const safeCode = cleanLabel(input.passCode, 32) || 'PASS-0000';
  const rawPassPayload = (input.passCode || 'PASS-0000').replace(/[^A-Za-z0-9_.:/-]/g, '').slice(0, 64) || 'PASS-0000';
  const safeStudent = cleanLabel(input.studentName, 36) || 'Member';
  const safeBranch = cleanLabel(input.branchName, 36) || 'Main Branch';
  const safeCourse = cleanLabel(input.courseTitle, 40) || 'Standard Package';
  const credits = Math.max(0, Math.min(999, Math.floor(Number(input.remainingCredits) || 0)));

  const qrPath = buildQrSvgPath(rawPassPayload, 14, 14, 114);
  const badgeColor = credits <= 2 ? '#d97706' : '#059669';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="142" viewBox="0 0 380 142" role="img" aria-label="Open Center OS Pass ${safeCode}">
  <rect width="380" height="142" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
  <rect x="12" y="12" width="118" height="118" rx="8" fill="#ffffff" stroke="#e2e8f0"/>
  <path d="${qrPath}" fill="#0f172a"/>
  <text x="144" y="29" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="700" fill="#475569">OPEN CENTER OS PASS</text>
  <text x="144" y="53" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">${safeStudent}</text>
  <text x="144" y="74" font-family="Inter,Arial,sans-serif" font-size="12" fill="#334155">${safeCourse}</text>
  <text x="144" y="94" font-family="Inter,Arial,sans-serif" font-size="11" fill="#64748b">${safeBranch} | ${safeCode}</text>
  <text x="144" y="118" font-family="Inter,Arial,sans-serif" font-size="10" fill="#94a3b8">ISO QR PASS — SCAN AT RECEPTION</text>
  <rect x="294" y="16" width="72" height="22" rx="11" fill="${badgeColor}"/>
  <text x="330" y="31" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="11" font-weight="700" fill="#ffffff">${credits} LEFT</text>
</svg>`;
}
