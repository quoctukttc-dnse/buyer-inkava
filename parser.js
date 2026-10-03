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


  // ---------- SAP inbound (ZMME0032) ----------
  const normRef = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const toNum = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    // "1.234,5" (VN) hoặc "1,234.5" (EN) hoặc "1234"
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return vnNum(s);
    const n = parseFloat(s.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };

  /** aoa: mảng 2 chiều (dòng đầu tiên chứa 'Purchasing Document' là tiêu đề). Trả về null nếu không phải file SAP inbound. */
  function buildSapIndex(aoa) {
    let h = -1;
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      if ((aoa[i] || []).some(c => /^\s*Purchasing\s+Doc/i.test(String(c || '')))) { h = i; break; }
    }
    if (h < 0) return null;
    const head = aoa[h].map(c => String(c || '').trim().toLowerCase());
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n.toLowerCase()); if (i >= 0) return i; } return -1; };
    const C = {
      po: col('Purchasing Document'), ref: col('Supplier Ref'), desc: col('Material Description'),
      qty: col('Quantity'), price: col('Gross Price'), delivered: col('Delivered Qty'), remain: col('Remain Quantity'),
      invQty: col('Invoice Quantity'), supplier: col('Partner Name'), material: col('Material')
    };
    if (C.po < 0 || C.qty < 0) return null;
    const byPo = new Map();
    let count = 0;
    for (let i = h + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const po = String(r[C.po] ?? '').trim().replace(/\.0+$/, '');
      if (!po) continue;
      const ref = C.ref >= 0 ? String(r[C.ref] ?? '').trim() : '';
      const desc = C.desc >= 0 ? String(r[C.desc] ?? '').trim() : '';
      const it = {
        po, ref, desc, refN: normRef(ref || desc), descN: normRef(desc),
        qty: toNum(r[C.qty]) || 0, price: C.price >= 0 ? toNum(r[C.price]) : null,
        delivered: C.delivered >= 0 ? toNum(r[C.delivered]) : null, remain: C.remain >= 0 ? toNum(r[C.remain]) : null,
        invQty: C.invQty >= 0 ? toNum(r[C.invQty]) : null, supplier: C.supplier >= 0 ? String(r[C.supplier] ?? '') : '',
        material: C.material >= 0 ? String(r[C.material] ?? '') : ''
      };
      if (!byPo.has(po)) byPo.set(po, []);
      byPo.get(po).push(it);
      count++;
    }
    return { byPo, count };
  }

  /** row: {scaf|po, ref, price}. Trả về {status:'ok'|'po'|'none'|'nopo', qty, items, note} */
  function matchSap(index, row) {
    const po = String(row.scaf || row.po || '').trim();
    if (!po) return { status: 'none', note: 'Không có PO SCAF' };
    const list = index.byPo.get(po);
    if (!list) return { status: 'nopo', note: 'PO không có trong file SAP' };
    const r = normRef(row.ref);
    let hit = list.filter(a => a.refN === r);
    let how = 'ok';
    if (!hit.length && r) hit = list.filter(a => a.refN && (a.refN.startsWith(r) || r.startsWith(a.refN) || a.descN.startsWith(r)));
    if (!hit.length && list.length === 1) { hit = list; how = 'po'; }
    if (!hit.length) return { status: 'noref', note: `PO có ${list.length} dòng trên SAP nhưng không khớp REF` };
    const qty = hit.reduce((s, a) => s + (a.qty || 0), 0);
    const notes = [];
    if (how === 'po') notes.push(`Khớp theo PO (REF SAP: ${hit[0].ref || hit[0].desc})`);
    if (hit.length > 1) notes.push(`Cộng ${hit.length} dòng SAP`);
    const prices = [...new Set(hit.map(a => a.price).filter(p => p != null))];
    if (row.price != null && prices.length && prices.some(p => Math.abs(p - row.price) > 0.5)) notes.push(`Giá SAP ${prices.map(p => p.toLocaleString('vi-VN')).join('/')} ≠ giá HĐ ${Number(row.price).toLocaleString('vi-VN')}`);
    const remain = hit.reduce((s, a) => s + (a.remain || 0), 0);
    return { status: how, qty, items: hit, remain, note: notes.join('; ') };
  }

  const api = { parseInvoice, vnNum, groupLines, buildSapIndex, matchSap, normRef };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvoiceParser = api;
})(typeof window !== 'undefined' ? window : this);
