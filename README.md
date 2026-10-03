# Trích xuất hóa đơn GTGT → Excel

Web tĩnh (chạy trên GitHub Pages) đọc các file **PDF hóa đơn điện tử** (MISA meInvoice và các mẫu tương tự có lớp chữ) và xuất ra file Excel theo mẫu *CHI TIẾT HÓA ĐƠN*.

Mọi xử lý chạy **ngay trong trình duyệt** — file hóa đơn không bị tải lên máy chủ nào.

## Quy trình 2 bước

**Bước 1 — Hóa đơn**
1. Kéo thả các file PDF hóa đơn (hoặc `.zip`, hoặc cả thư mục). File `.7z`/`.rar` cần giải nén trước. Biên bản scan tự bỏ qua.
2. Kiểm tra danh sách: hóa đơn lệch tổng tiền / tổng số lượng được đánh dấu **Cần kiểm tra**.
3. Bấm **Tải file Excel** → được file theo mẫu (cột K trống) + sheet **PO SAP** liệt kê các PO SCAF.

**Bước 2 — Inbound SAP**
1. Bấm **Sao chép danh sách PO** (hoặc lấy ở sheet *PO SAP*), dán vào màn hình chọn của báo cáo **ZMME0032** trên SAP, xuất Excel.
2. Mở lại công cụ, nạp **file Excel đã xuất ở bước 1** (hoặc nạp lại PDF) và **file inbound SAP** — công cụ tự nhận diện loại file.
3. Cột **SỐ LƯỢNG (K)** tự điền = cột *Quantity* trên SAP, khớp theo **PO + REF** (bỏ qua khoảng trắng/gạch nối; PO chỉ có 1 dòng thì khớp theo PO). CHECK, CHÊNH, TỶ LỆ tự tính.
4. Có thể nạp nhiều file SAP — dữ liệu được gộp. Ô danh sách PO chỉ còn các PO **chưa có** trong file SAP đã nạp.
5. Bấm **Tải file Excel**.

Cột **GHI CHÚ SAP** (P): `Khớp`, `Khớp theo PO`, `Lệch REF`, `Chưa có trên SAP`, và cảnh báo khi đơn giá SAP (*Gross Price*) khác đơn giá hóa đơn.

## Cột trong file Excel (Sheet1)

| Cột | Nội dung | Nguồn |
|---|---|---|
| A STT | Số thứ tự dòng trong hóa đơn | HĐ |
| B HÓA ĐƠN | Số hóa đơn (vd 532) | HĐ |
| C NGÀY | Ngày hóa đơn | HĐ |
| D REF | Mã hàng sau số PO (vd `ARN-SS27-012320`) | HĐ |
| E SỐ LƯỢNG / F GIÁ TIỀN | Số lượng, đơn giá | HĐ |
| G THÀNH TIỀN | `=E*F` | công thức |
| H PO SCAX | Số PO không phải dạng 45xxxxxxxx (vd 16395) — hoặc nhập tay | HĐ / nhập |
| I MO | nhập tay | nhập |
| J PO SCAF | Số PO dạng 45xxxxxxxx | HĐ |
| K SỐ LƯỢNG | *Quantity* của dòng PO trên SAP (ZMME0032) | SAP / nhập |
| L CHECK | `OK` nếu (E−K)/E ≤ ngưỡng (mặc định 3%) | công thức |
| M CHÊNH / N TỶ LỆ | `=E−K`, `=M/E` | công thức |
| O TEAM | Theo tiền tố REF: ARN→ARENA, KNIT/WTI→DEC (sửa được trong *Thiết lập*) | quy tắc |

Sheet **PO SAP**: danh sách PO SCAF cần tải inbound, đánh dấu PO đã có trong file SAP.

Sheet **ĐỐI CHIẾU**: mỗi hóa đơn một dòng — tổng số lượng, cộng tiền hàng trên HĐ so với tổng các dòng đã trích xuất (cột LỆCH phải bằng 0).

## Đưa lên GitHub Pages

1. Tạo repository mới trên GitHub (vd `trich-xuat-hoa-don`), chế độ Public (hoặc Private nếu tài khoản có GitHub Pro/Team).
2. **Add file → Upload files** → kéo 3 file `index.html`, `parser.js`, `README.md` → **Commit changes**.
3. **Settings → Pages** → *Source*: `Deploy from a branch`, *Branch*: `main` / `(root)` → **Save**.
4. Sau ~1 phút trang có địa chỉ `https://<tên-tài-khoản>.github.io/trich-xuat-hoa-don/`.

## Cấu trúc

- `index.html` — giao diện, đọc PDF (pdf.js), xuất Excel (ExcelJS), đọc ZIP (JSZip), đọc Excel (SheetJS) — thư viện tải từ cdnjs.
- `parser.js` — đọc hóa đơn PDF và khớp file inbound SAP. Đọc hóa đơn: gom chữ theo tọa độ, tìm dòng `STT … ĐVT Số lượng Đơn giá Thành tiền`, ghép với dòng `PO… - REF` gần nhất.
