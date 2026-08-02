# Sổ Thu Chi Đa Ví - kèm Cổng Ngầm vào Quản Lý Quán Ăn

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

## Đưa lên GitHub Pages

Giống hệt cách làm với app Quán Ăn: tạo repo mới, upload `index.html`,
`manifest.json`, `sw.js` lên nhánh `main`, bật GitHub Pages (Settings → Pages
→ Deploy from branch → main → / root).

## Lưu ý bảo mật

Mã cổng ngầm chỉ là một lớp che bớt sự chú ý (ai vô tình cầm điện thoại sẽ
không thấy rõ đây là lối vào quản lý quán). Lớp bảo vệ thật sự vẫn là PIN
chủ quán/nhân viên ở app Quán Ăn - PIN đó nên được đổi khỏi mặc định
(`1234` chủ quán / `5678` nhân viên) ngay khi triển khai thật.
