# Trích xuất hóa đơn GTGT → Excel

Web tĩnh (chạy trên GitHub Pages) đọc các file **PDF hóa đơn điện tử** (MISA meInvoice và các mẫu tương tự có lớp chữ) và xuất ra file Excel theo mẫu *CHI TIẾT HÓA ĐƠN*.

Mọi xử lý chạy **ngay trong trình duyệt** — file hóa đơn không bị tải lên máy chủ nào.

## Cách dùng

1. Mở trang web, kéo thả các file PDF (hoặc file `.zip`, hoặc cả thư mục) vào ô.
   - File `.7z` / `.rar` cần giải nén trước (hoặc nén lại thành `.zip`).
   - Biên bản (BBTL) dạng scan sẽ tự động bị bỏ qua.
2. Kiểm tra danh sách: hóa đơn nào lệch tổng tiền / tổng số lượng sẽ được đánh dấu **Cần kiểm tra**.
3. (Tuỳ chọn) nhập PO SCAX, MO, Số lượng (K), sửa TEAM ngay trong bảng.
4. Bấm **Tải file Excel**.

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
| K SỐ LƯỢNG | Số lượng đối chiếu (PO/SAP) — nhập tay | nhập |
| L CHECK | `OK` nếu (E−K)/E ≤ ngưỡng (mặc định 3%) | công thức |
| M CHÊNH / N TỶ LỆ | `=E−K`, `=M/E` | công thức |
| O TEAM | Theo tiền tố REF: ARN→ARENA, KNIT/WTI→DEC (sửa được trong *Thiết lập*) | quy tắc |

Sheet **ĐỐI CHIẾU**: mỗi hóa đơn một dòng — tổng số lượng, cộng tiền hàng trên HĐ so với tổng các dòng đã trích xuất (cột LỆCH phải bằng 0).

## Đưa lên GitHub Pages

1. Tạo repository mới trên GitHub (vd `trich-xuat-hoa-don`), chế độ Public (hoặc Private nếu tài khoản có GitHub Pro/Team).
2. **Add file → Upload files** → kéo 3 file `index.html`, `parser.js`, `README.md` → **Commit changes**.
3. **Settings → Pages** → *Source*: `Deploy from a branch`, *Branch*: `main` / `(root)` → **Save**.
4. Sau ~1 phút trang có địa chỉ `https://<tên-tài-khoản>.github.io/trich-xuat-hoa-don/`.

## Cấu trúc

- `index.html` — giao diện, đọc PDF (pdf.js), xuất Excel (ExcelJS), đọc ZIP (JSZip) — thư viện tải từ cdnjs.
- `parser.js` — logic nhận diện dòng hàng: gom chữ theo tọa độ, tìm dòng `STT … ĐVT Số lượng Đơn giá Thành tiền`, ghép với dòng `PO… - REF` gần nhất.
