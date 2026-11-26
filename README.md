# 🧧 UNO TẾT 2027

Game UNO trực tuyến theo phòng, giao diện tối ưu điện thoại Android, tối đa 6 người chơi **tính cả chủ LIVE**.

## Chạy thử
1. Cài Node.js 18 trở lên.
2. Chạy `npm install`
3. Chạy `npm start`
4. Mở `http://localhost:3000`

## Triển khai Railway
- Đưa toàn bộ thư mục lên một GitHub repository mới, ví dụ `UNO-TET-2027`.
- Tạo Railway project từ repository.
- Railway tự chạy `npm start`.
- Đặt `PUBLIC_BASE_URL` bằng URL public của Railway nếu muốn QR dùng URL cố định.

## Luồng chơi
- Chủ LIVE mở `/admin.html`, tạo phòng và tham gia với tư cách người chơi số 1.
- Khán giả quét QR hoặc nhập mã phòng tại trang chủ.
- Tối đa 6 người trong phòng. Chủ LIVE cũng chiếm một ghế.
- Chủ LIVE bấm bắt đầu khi có ít nhất 2 người.
- Luật nền: 7 lá mỗi người; khớp màu/số/ký hiệu hoặc đánh lá Wild; rút 1 lá nếu không đánh được; lá vừa rút có thể đánh ngay nếu hợp lệ; +2 và +4 làm người kế tiếp rút bài và mất lượt; Reverse đổi chiều; Skip bỏ lượt.
- Không cộng dồn +2/+4. Người chơi phải bấm UNO khi còn 1 lá. Nếu bỏ quên và bị bắt trước khi người kế tiếp bắt đầu lượt, hệ thống phạt rút 2 lá.
- Wild Draw Four được kiểm tra theo luật: chỉ được đánh khi người chơi không có lá cùng màu với lá trên cùng. Bản đầu hiện thực hóa kiểm tra điều kiện này tự động.

## TikTok LIVE gift integration
Bản khởi đầu có API webhook mẫu `POST /api/gift`. Mặc định sự kiện quà chỉ thêm người tặng vào hàng chờ (không tự chiếm ghế nếu phòng đã đủ 6 người). Tích hợp thực tế cần một nguồn sự kiện TikTok LIVE hợp lệ và bảo vệ bằng `GIFT_WEBHOOK_TOKEN`. Không có webhook hoạt động thì host có thể cho người xem vào phòng bằng mã/QR.

## Lưu ý
Đây là bản nền có thể chạy và phát triển tiếp. Cần kiểm thử nhiều thiết bị, kết nối mạng, reconnect và nguồn gift event thật trước khi dùng LIVE chính thức.
