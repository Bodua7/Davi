# Sổ Thu Chi Đa Ví - kèm Cổng Ngầm vào Quản Lý Quán Ăn

## Cập nhật mới nhất (đọc nếu đã dùng bản trước)

- **Khóa nút "Lưu" trong lúc đang lưu** (giao dịch + công nợ) - tránh bấm 2
  lần nhanh tạo ra 2 bản ghi trùng nhau.
- **Validate lãi suất công nợ** (0-100%/tháng) - chặn nhập số âm/sai; nếu
  nhập số tiền gốc quá lớn (>10 tỷ), app hỏi lại 1 câu xác nhận phòng gõ
  nhầm thừa số 0 (không chặn cứng, vẫn lưu được nếu xác nhận đúng).
- **Debounce ô tìm kiếm giao dịch** (~200ms) - gõ nhanh không bị giật do lọc
  lại bảng liên tục trên từng phím bấm.
- **Sửa `manifest.json` và thẻ `theme-color`** - trước đó bị sao chép nhầm
  từ app Quán Ăn (tên "Quán Ăn - Gọi Món & Quản Lý", màu tím `#312e81`), giờ
  đã đúng thông tin/màu của app Sổ Thu Chi Đa Ví. **Lưu ý:** `manifest.json`
  vẫn trỏ tới `./icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`
  - phải có đủ 3 file ảnh này trong thư mục `icons/` khi deploy, nếu không
  app cài lên máy sẽ thiếu icon (không có lỗi rõ ràng, chỉ là icon trống).
- **Banner báo mất mạng** - tự hiện dải đỏ trên đầu màn hình khi thiết bị mất
  kết nối, tự ẩn khi có mạng lại.
- Các bản cập nhật trước: đăng nhập Supabase Auth + RLS chặn thật, tách file
  index.html/style.css/app.js, ID tự sinh bởi Postgres, kiểm tra xung đột khi
  sửa, công nợ gắn ví, Import/Export JSON, Quên mật khẩu, OCR vie+eng, dialog
  tùy chỉnh thay alert()/confirm() mặc định.
- Nhớ chạy lại toàn bộ `chema_supabase.sql` trước khi dùng bản này (an toàn
  chạy lại nhiều lần).

## ⚠️ Đã chuyển sang Supabase + bắt buộc đăng nhập (đọc trước)

App này giờ lưu dữ liệu (ví, giao dịch, công nợ) trên **Supabase** thay vì
localStorage + Google Sheet như trước - mở app trên điện thoại/máy tính khác
nhau đều thấy chung 1 dữ liệu, cập nhật tức thì.

- Dùng **chung 1 project Supabase** với app Quán Ăn (đã điền sẵn URL + anon
  key trong `app.js`).
- Trước khi dùng, phải chạy file `chema_supabase.sql` trong SQL Editor của
  project đó (tạo 3 bảng `fin_wallets`, `fin_transactions`, `fin_debts` +
  bật RLS chỉ cho phép người đã đăng nhập) - xem hướng dẫn ngay đầu file SQL.
- **Bắt buộc (bảo mật):** vào Supabase Dashboard > Authentication > Users >
  "Add user", tạo 1 tài khoản (email + mật khẩu bất kỳ, tick "Auto Confirm
  User"). Mở app lần đầu trên mỗi thiết bị sẽ hiện màn đăng nhập - nhập đúng
  email/mật khẩu đó. Phiên đăng nhập tự lưu lại trên thiết bị, không cần
  đăng nhập lại mỗi lần mở app (trừ khi bấm "Đăng xuất" trong ⚙️ Cài đặt).
  Không có tài khoản này thì Supabase sẽ từ chối mọi lệnh đọc/ghi, kể cả khi
  ai đó lấy được anon key.
- **Nếu trước đây đã chạy `chema_supabase.sql` bản cũ** (policy `to anon`):
  chạy lại toàn bộ file mới - phần đầu có `drop policy if exists ...` nên an
  toàn, không ảnh hưởng dữ liệu, chỉ đổi lại quyền truy cập.
- File `Code_ViThuChi.gs` (Apps Script cũ) **không còn cần dùng nữa**, có thể
  xóa khỏi Google Apps Script và khỏi repo GitHub nếu muốn dọn dẹp.
- Nếu mất mạng, app sẽ báo lỗi không tải được dữ liệu (không còn hoạt động
  offline bằng dữ liệu cũ trên máy như bản trước).

App thu chi 2 ví (Kinh Doanh / Cá Nhân) như cũ, có thêm **cổng ngầm** để chủ
quán từ app Ví này mở thẳng sang quản lý quán ăn (quanan-pwa), giống hệt cách
nhân viên đăng nhập nhưng không lộ ra ngoài giao diện.

## Cổng ngầm hoạt động thế nào

- Ở góc icon 👛 trên header có một chấm khóa nhỏ 🔒 (không đề chữ, trông như
  chi tiết trang trí).
- Bấm vào chấm khóa đó → hiện ô nhập mã → nhập đúng mã cục bộ (mặc định
  `1234`, đổi được) → app sẽ mở thẳng sang link quản lý quán ăn đã lưu sẵn.
- Sang tới app Quán Ăn, chủ quán nhập PIN chủ quán (đặt ở app Quán Ăn, không
  liên quan mã ở bước này) để vào full quyền quản lý - y như cách nhân viên
  đăng nhập PIN của họ để vào khu nhân viên.
- Mã cổng ngầm và link được lưu **cục bộ trên máy/trình duyệt** (localStorage),
  không đồng bộ lên đâu cả - đổi máy khác thì phải cấu hình lại.

## Cấu hình lần đầu (bắt buộc)

1. Deploy xong app Quán Ăn (`quanan-pwa`) lên GitHub Pages, lấy link dạng
   `https://<username>.github.io/quanan-app/`.
2. Mở app Ví này → bấm ⚙️ (góc phải header) → cuộn xuống mục
   **🔒 Link app Quán Ăn (mở khi vào cổng ngầm)** → dán link đó, có thể thêm
   `?admin=1` ở cuối để mở thẳng màn đăng nhập quản lý, ví dụ:
   `https://<username>.github.io/quanan-app/?admin=1`
3. (Tùy chọn) Đổi mã mở cổng ngầm ở ô bên dưới rồi bấm **Lưu cấu hình cổng
   ngầm**.

Từ giờ chỉ cần bấm vào chấm khóa 🔒 trên logo ví + nhập mã là mở sang quản lý
quán ăn ngay.

## Cấu trúc file (đã tách từ 1 file thành 3)

Trước đây toàn bộ HTML + CSS + JS gộp chung trong 1 file `index.html` (~92KB).
Giờ tách thành 3 file để dễ đọc/sửa, vẫn KHÔNG cần build/bundler gì cả, dán
file lên GitHub Pages là chạy được ngay như trước:

- `index.html` - chỉ còn khung HTML (thẻ, modal, form).
- `style.css` - toàn bộ CSS.
- `app.js` - toàn bộ JavaScript (đăng nhập, đồng bộ Supabase, tính toán,
  render giao diện...).

Khi cần sửa giao diện → sửa `style.css`. Khi cần sửa logic/tính năng → sửa
`app.js`. `index.html` hiếm khi cần đụng tới trừ khi thêm bớt phần tử mới.

## Đưa lên GitHub Pages

Giống hệt cách làm với app Quán Ăn: tạo repo mới, upload cả 5 file
`index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js` lên nhánh
`main`, bật GitHub Pages (Settings → Pages → Deploy from branch → main → /
root). Thiếu `style.css` hoặc `app.js` thì app sẽ mở ra trắng trang hoặc mất
giao diện.

## Lưu ý bảo mật

- Lớp bảo vệ dữ liệu tài chính (ví/giao dịch/công nợ) thật sự nằm ở **đăng
  nhập Supabase Auth** (xem mục trên) - không có tài khoản này thì không đọc
  ghi được gì trên Supabase, kể cả khi có anon key.
- Mã cổng ngầm (🔒 trên logo ví) chỉ là một lớp che bớt sự chú ý (ai vô tình
  cầm điện thoại sẽ không thấy rõ đây là lối vào quản lý quán), KHÔNG phải
  lớp bảo mật dữ liệu. Lớp bảo vệ thật sự cho phía quán ăn vẫn là PIN chủ
  quán/nhân viên ở app Quán Ăn - PIN đó nên được đổi khỏi mặc định (`1234`
  chủ quán / `5678` nhân viên) ngay khi triển khai thật.
