/* Bộ trích xuất hóa đơn GTGT điện tử (PDF có lớp chữ, ví dụ MISA meInvoice).
 * Dùng chung cho trình duyệt (window.InvoiceParser) và Node (module.exports) để kiểm thử. */
(function (root) {
  'use strict';

  // "12.681,00" -> 12681 ; "16.881" -> 16881 ; "1.003,50" -> 1003.5
  function vnNum(s) {
    return parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  }

  // Gom các mẩu chữ của 1 trang thành từng dòng theo tọa độ y.
  function groupLines(items) {
    const toks = items
      .filter(it => it.str && it.str.trim() !== '')
      .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const t of toks) {
      const ln = lines.find(l => Math.abs(l.y - t.y) < 2.5);
      if (ln) ln.toks.push(t); else lines.push({ y: t.y, toks: [t] });
    }
    for (const l of lines) {
      l.toks.sort((a, b) => a.x - b.x);
      l.text = l.toks.map(t => t.s).join(' ').replace(/\s+/g, ' ').trim();
    }
    return lines.sort((a, b) => b.y - a.y);
  }

  const NUM = '\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?';
  // ... <ĐVT> <Số lượng> <Đơn giá> <Thành tiền> ở cuối dòng
  const ROW_RE = new RegExp('^\\s*(\\d{1,4})\\b(.*?)\\b([A-Za-zÀ-ỹ]{2,10})\\s+(' + NUM + ')\\s+(' + NUM + ')\\s+(' + NUM + ')\\s*$');
  const PO_RE = /PO\s*:?\s*(\d{4,12})\s*[-–:]?\s*(.*)$/i;
  const STOP_WORDS = /\s+(Serigraphy|Printing|Embroidery|Embroider|Thêu|In\s|Heat|Transfer|Service|Dịch vụ|Gia công)\b.*$/i;

  function cleanRef(rest) {
    let r = (rest || '').replace(STOP_WORDS, '').trim();
    r = r.replace(/[-–\s]+$/, '').trim();
    return r;
  }

  /** pages: mảng các mảng textItems (định dạng pdf.js getTextContent().items) */
  function parseInvoice(pages) {
    const all = pages.map(groupLines);
    const fullText = all.map(p => p.map(l => l.text).join('\n')).join('\n');

    const isInvoice = /H[ÓO]A\s*Đ[ƠO]N/i.test(fullText) && /Số\s*:?\s*\d{5,}/i.test(fullText);
    if (!isInvoice) return { ok: false, reason: 'Không phải hóa đơn điện tử dạng chữ (có thể là bản scan / biên bản).' };

    const no = (fullText.match(/Số\s*:\s*0*(\d+)/i) || [])[1];
    const kyHieu = (fullText.match(/Ký\s*hiệu\s*:\s*([A-Z0-9]+)/i) || [])[1] || '';
    const dm = fullText.match(/Ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
    const date = dm ? { d: +dm[1], m: +dm[2], y: +dm[3] } : null;
    const seller = (fullText.match(/\n\s*(C[ÔO]NG TY[^\n]+)/) || [])[1] || '';
    const buyer = (fullText.match(/Tên đơn vị\s*:\s*([^\n]+)/i) || [])[1] || '';
    const subtotalM = fullText.match(/Cộng tiền hàng\s*:?\s*(-?[\d.]+)/i);
    const subtotal = subtotalM ? vnNum(subtotalM[1]) : null;
    const totalQtyM = fullText.match(/Tổng số lượng\s*:?\s*([\d.,]+)/i);
    const totalQty = totalQtyM ? vnNum(totalQtyM[1]) : null;

    const rows = [];
    all.forEach((lines) => {
      // vùng bảng: sau dòng tiêu đề "STT ... Thành tiền", trước "Tổng số lượng"/"Cộng tiền hàng"
      let start = lines.findIndex(l => /STT/.test(l.text) && /Thành tiền/i.test(l.text));
      if (start < 0) return;
      let end = lines.findIndex((l, i) => i > start && /(Tổng số lượng|Cộng tiền hàng|^\s*\d+\/\d+\s*$)/i.test(l.text));
      if (end < 0) end = lines.length;
      const body = lines.slice(start + 1, end);

      const numRows = [];
      const poLines = [];
      body.forEach(l => {
        const m = l.text.match(ROW_RE);
        if (m) numRows.push({ y: l.y, stt: +m[1], desc: m[2].trim(), unit: m[3], qty: vnNum(m[4]), price: vnNum(m[5]), amount: vnNum(m[6]) });
        const pm = l.text.match(PO_RE);
        if (pm) {
          // lấy phần PO từ đúng vị trí bắt đầu "PO" trong dòng
          const idx = l.text.search(/PO\s*:?\s*\d/i);
          const seg = l.text.slice(idx).replace(ROW_RE, '');
          const pm2 = seg.match(PO_RE) || pm;
          let rest = pm2[2];
          // cắt bỏ phần ĐVT/số liệu nếu nằm chung dòng
          rest = rest.replace(new RegExp('\\s+[A-Za-zÀ-ỹ]{2,10}\\s+' + NUM + '\\s+' + NUM + '\\s+' + NUM + '\\s*$'), '');
          poLines.push({ y: l.y, po: pm2[1], ref: cleanRef(rest) });
        }
      });

      // ghép mỗi dòng số liệu với dòng PO gần nhất (theo y), ưu tiên dòng PO nằm trên hoặc cùng dòng
      const used = new Set();
      numRows.forEach(r => {
        let best = -1, bestD = 1e9;
        poLines.forEach((p, i) => {
          if (used.has(i)) return;
          let d = Math.abs(p.y - r.y);
          if (p.y < r.y - 1) d += 3; // PO nằm dưới: phạt nhẹ
          if (d < bestD) { bestD = d; best = i; }
        });
        let po = '', ref = '';
        if (best >= 0 && bestD < 40) { used.add(best); po = poLines[best].po; ref = poLines[best].ref; }
        else { ref = cleanRef(r.desc); }
        rows.push({ stt: r.stt, unit: r.unit, qty: r.qty, price: r.price, amount: r.amount, po, ref });
      });
    });

    const sumAmount = rows.reduce((s, r) => s + r.amount, 0);
    const sumQty = rows.reduce((s, r) => s + r.qty, 0);
    const warnings = [];
    if (!rows.length) warnings.push('Không đọc được dòng hàng nào.');
    if (subtotal != null && Math.abs(sumAmount - subtotal) > 1) warnings.push(`Tổng thành tiền các dòng (${sumAmount.toLocaleString('vi-VN')}) ≠ Cộng tiền hàng (${subtotal.toLocaleString('vi-VN')}).`);
    if (totalQty != null && Math.abs(sumQty - totalQty) > 0.001) warnings.push(`Tổng số lượng các dòng (${sumQty.toLocaleString('vi-VN')}) ≠ Tổng số lượng trên HĐ (${totalQty.toLocaleString('vi-VN')}).`);
    rows.forEach(r => {
      if (Math.abs(r.qty * r.price - r.amount) > 1) warnings.push(`Dòng ${r.stt}: SL × Đơn giá ≠ Thành tiền trên HĐ (${r.amount.toLocaleString('vi-VN')}).`);
      if (!r.po) warnings.push(`Dòng ${r.stt}: không tìm thấy số PO.`);
    });

    return { ok: true, no: no ? parseInt(no, 10) : null, noText: no || '', kyHieu, date, seller: seller.trim(), buyer: buyer.trim(), subtotal, totalQty, rows, warnings };
  }

  const api = { parseInvoice, vnNum, groupLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvoiceParser = api;
})(typeof window !== 'undefined' ? window : this);
