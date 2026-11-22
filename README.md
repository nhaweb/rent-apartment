# PML Home

Trang đăng phòng trọ cho thuê ở Quy Nhơn. Chủ phòng đăng tin và nhận yêu cầu xem phòng; người thuê xem, lọc, tìm trên bản đồ và gửi yêu cầu mà không cần tài khoản.

Kiến trúc, quy ước thiết kế và quy tắc dữ liệu: xem [`CLAUDE.md`](CLAUDE.md).

## Stack

Astro (TypeScript, SSR) · Tailwind CSS · Neon Postgres + Drizzle · Better Auth · Cloudflare R2 · MapLibre + OpenFreeMap · Gmail SMTP (tạm) / Resend · Gemini (trợ lý tìm phòng).

## Cài đặt

Cần Node.js 22.

```sh
npm install
cp .env.example .env   # điền giá trị, xem chú thích trong file
npm run db:migrate     # chỉ trên database test, không phải production
npm run db:seed        # dữ liệu mẫu (cần SEED_PASSWORD, tự từ chối production)
npm run dev            # http://localhost:4321
```

Nếu mạng kiểm tra HTTPS làm lỗi kết nối database ("fetch failed"), đặt `NODE_OPTIONS=--use-system-ca` trên máy.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run check` | Kiểm tra kiểu (astro check) |
| `npm test` | Unit test (không cần database) |
| `npm run build` | Build (Fly.io, `DEPLOY_TARGET=node`) |
| `DEPLOY_TARGET=vercel npm run build` | Build cho Vercel |
| `npm run db:generate` / `db:migrate` | Tạo / chạy migration Drizzle |
| `npm run test:ownership` | Kiểm tra chủ phòng A không đụng được dữ liệu của B (ghi vào DB test) |
| `npm run db:cleanup [-- --delete]` | Xóa phiên hết hạn và bộ đếm rate limit cũ |
| `npm run r2:orphans [-- --delete]` | Ảnh trong R2 không còn dòng trong DB |
| `npm run r2:cors [-- --apply]` | CORS của bucket cho upload trực tiếp |
| `npm run icons` | Tạo favicon, icon và ảnh chia sẻ mặc định |

## Triển khai

- **Test / preview:** Vercel (`DEPLOY_TARGET=vercel`).
- **Production:** Fly.io với `Dockerfile` và `fly.toml`. Biến `PUBLIC_*` được nhúng lúc build (build args trong `fly.toml`); secret đặt bằng `fly secrets set` (danh sách trong `fly.toml` và `.env.example`).
- CI (`.github/workflows/ci.yml`) chạy check, test và cả hai bản build cho mỗi push / PR.

Việc còn lại trước khi lên production: mục **Deployment TODO** trong `CLAUDE.md`.
