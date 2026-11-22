# CLAUDE.md

## Project overview

Room rental listing platform (Vietnamese "phòng trọ" market).

Two kinds of users:

- **Landlords (chủ phòng)**: sign up, create and manage room listings (info, price, photos), and see contact requests from renters.
- **Renters (người thuê)**: browse and filter rooms, view room details, and send a contact / viewing request to the landlord. Renters do NOT need an account to browse or contact.

Out of scope for now: online payment, contracts, invoices, utility billing, in-app chat, reviews.

UI language is Vietnamese. Code, comments, commit messages and identifiers are in English.

## Tech stack

- **Framework:** Astro (TypeScript, strict mode)
- **Rendering:** hybrid. Public listing pages are SSR or prerendered where possible for SEO; landlord dashboard pages are SSR and auth-protected.
- **Styling:** Tailwind CSS
- **Interactivity:** Astro islands only where needed (image uploader, filters, forms). Default to zero-JS `.astro` components.
  - React (`@astrojs/react`) is allowed only for islands built on **React Bits** components that add real UX (input or feedback), never for decoration. Vendored sources live in `src/components/react/vendor/` with a header noting origin and local changes (map their sizes, colors and shadows to the tokens; no extra icon packages). Load with `client:visible` or later, never on page load of listing pages.
  - Current islands: `PriceSlider` (ElasticSlider) and `LiveCount` (Counter, backed by `GET /api/dem-phong`) in the filter panel.
  - The room photo uploader is a vanilla `<photo-manager>` custom element (`src/components/room/photos/`), dashboard only.
  - The room map pin is a vanilla `<location-picker>` custom element (`src/components/room/location/`, in `RoomForm`, dashboard only): MapLibre via `createBaseMap()` loaded when scrolled near; tap/click or drag the pin, "Đặt ghim ở giữa bản đồ" (keyboard), "Xóa vị trí". Hidden inputs `lat`/`lng` (optional, both or neither, inside `LOCATION_BOUNDS`, 5 decimals). Opens at the ward center from `getWardCenters()` (average of public rooms in the ward), else `SITE_MAP_CENTER`; follows the ward select until a pin is set.
  - UI motion (press, sheets/drawer, select popup) is vanilla JS + Motion, not React; see **Motion**.
  - The map page (`/ban-do`) is a vanilla `<room-map>` custom element, not React. Modules in `src/components/map/`:
    - `base-map.ts`: reusable `createBaseMap()` (MapLibre GL + OpenFreeMap style, no rotation/tilt, Vietnamese labels, quiet POIs, attribution). Import it with dynamic `import()`; the host component imports `maplibre-gl/dist/maplibre-gl.css`.
    - `price-markers.ts`: `PriceMarkerLayer`, HTML price pills clustered with `supercluster`; only on-screen markers are in the DOM.
    - `room-map.ts`: the page element (viewport fetch from `GET /api/ban-do`, list sync, preview popup). Creates the map once and tears everything down in `disconnectedCallback`.
- **Backend / data:** Neon Postgres (HTTP driver, `src/lib/db/`) + Drizzle ORM; mutations are Astro Actions (`src/actions/`). Query modules that scripts also use are factories without `astro:*` imports (`*-core.ts`), bound to the app DB in a sibling file. Hourly limits live in `src/lib/rate-limit.ts` (one table per scope, hashed subject; an empty IP is refused): chat, contact form, "Gọi điện" and "Nhắn Zalo" redirects per IP, presigned photo uploads per landlord (`upload_rate_limits`, 60 URLs/hour). Email (password reset, email verification, new contact requests) goes through `src/lib/email.ts`; see **Email**.
- **Contact requests:** `ContactForm` on `/phong/[id]` posts to the zero-JS action `createContactRequest` (`src/actions/contact.ts`): honeypot field `website`, `CONTACT_RATE_LIMIT_PER_HOUR` per IP (default 5, table `contact_rate_limits`), only `available` rooms, and the same phone + room within 24h is not stored again (answered as success). Success redirects to `?da-gui=1#lien-he`. The landlord gets an email (best effort, template `newContactRequest`, no reply-to) and sees requests in `/quan-ly/lien-he` (`setContactRequestStatus`). Queries in `src/lib/contact-requests-core.ts`, scoped by `landlordId` in SQL.
- **Direct contact (call, Zalo):** the contact card on `/phong/[id]` starts with outline buttons, then "hoặc để lại số điện thoại" and the form; the phone bottom bar has icon-only call (and Zalo) buttons beside "Hẹn xem" / "Hẹn xem phòng". Code in `src/lib/room-direct-contact.ts` and `direct-contact-route.ts`.
  - "Gọi điện": on every `available` room, no landlord opt-in (owner decision: every landlord wants calls). `GET /phong/[id]/goi` → 302 `tel:+84…` (same tab). The sign-up phone field says so.
  - "Nhắn Zalo" (opt-in): only when the landlord has a Zalo number and `landlords.zalo_public_at` is set (`roomHasPublicZalo`). `GET /phong/[id]/zalo` → 302 `https://zalo.me/{number}` (new tab). Opt-in: `ZaloOptIn.astro` checkbox "Cho người thuê nhắn Zalo cho tôi từ trang phòng" on `/dang-ky` and `/quan-ly/tai-khoan`, unchecked by default, enabled only while a Zalo number is entered (server refuses it without one); checked sets `zalo_public_at` (kept while the number is unchanged, set again when it changes), unchecked or no number sets null. Existing and seeded landlords start at null.
  - Both redirects: numbers are never in HTML, JSON-LD, meta tags or the sitemap; hourly limit per IP counted before the lookup (`PHONE_RATE_LIMIT_PER_HOUR` / `ZALO_RATE_LIMIT_PER_HOUR`, default 30, tables `phone_rate_limits` / `zalo_rate_limits`); no-store, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Disallow`ed in robots.txt. Over the limit: 303 to `?lien-he=gioi-han#lien-he` (notice); no number: 303 back to the card.
- **Auth (landlords only):** Better Auth 1.7 (email + password), Drizzle adapter on the same Neon DB. Code in `src/lib/auth/`:
  - `create-auth.ts`: config factory (no `astro:*` imports; also loaded by `auth.cli.ts` for `npm run auth:generate`). `server.ts`: the app instance from `astro:env`.
  - Tables `user`/`session`/`account`/`verification`/`rate_limit` are generated into `src/lib/db/auth-schema.ts` (never edit by hand), then `npm run db:generate`.
  - `landlords.id` = `user.id` (FK, cascade). Sign-up sends `phone`/`zalo` in the body; the `user.create` hooks validate them (before) and insert the `landlords` row (after, deleting the user if that fails). The sign-up action double-checks the row exists.
  - Forms are zero-JS Astro Actions (`src/actions/`) that go through `callAuthEndpoint` → `auth.handler`, never `auth.api.*`, so rate limits apply (DB storage; per-IP rules in `create-auth.ts`). Errors map to Vietnamese in `errors.ts`.
  - Pages and actions get the user with `getCurrentLandlord(Astro)` (cached per request in `locals`). `src/middleware.ts` guards `/quan-ly/*` (redirect to `/dang-nhap?next=…`, validated by `safeNextPath`) and sends signed-in users away from `/dang-nhap` and `/dang-ky`. Logout: `POST /dang-xuat`.
  - Base URL: `PUBLIC_SITE_URL` is canonical (never hardcode a host); Vercel's `VERCEL_URL`/`VERCEL_BRANCH_URL`/`VERCEL_PROJECT_PRODUCTION_URL` are allowed hosts automatically, trusted as `https://` origins. Cookies are Secure in production. Client IP for rate limits: `CLIENT_IP_HEADER` (`fly-client-ip` on Fly), else Astro's `clientAddress`.
  - Password reset email through `sendEmail` (template `resetPassword`). If it is not sent, the link is printed in dev; production logs only an error, never the link (live token). Better Auth answers the form the same either way.
  - Email verification: sent on sign-up (`sendOnSignUp`, link valid 24h, lands on `/quan-ly?xac-thuc=ok`, Better Auth adds `&error=…` on failure). Unverified landlords can sign in and create rooms, but a room cannot become `available` (SQL guard). `VerifyEmailBanner` on every dashboard page only while `emailVerified` is false (read fresh each request), "Gửi lại email" (`resendVerificationEmail` → `/send-verification-email`, rate limited; posts to `/quan-ly`). Outcomes are toasts on `/quan-ly`, decided by the real state: `?xac-thuc=ok` shows success only when verified (an old link after verifying is not an error; a hand-typed param claims nothing), `&error=` only while unverified, "Gửi lại" when already verified lands on the success toast. If not sent: link printed in dev, only an error logged in production. Migration 0009 marked pre-existing users verified. `AuthState` has `emailVerified` and `sessionId`.
  - Account deletion: `deleteAccount` (password + typing "XÓA") → Better Auth `/delete-user`; `landlords`, `rooms`, `room_photos`, `contact_requests` cascade from `user`; photo keys are read first (`listOwnPhotoKeys`) and removed from R2 afterwards (best effort).
  - Signed-in devices: our own queries on `session` scoped by user id (`src/lib/landlord-sessions-core.ts`; only ids, never tokens, reach the page); `revokeSession` / `revokeOtherSessions`. No cookie cache, so a deleted row signs the device out at once.
  - Unused Better Auth HTTP endpoints are closed with `disabledPaths` (`DISABLED_AUTH_PATHS` in `create-auth.ts`; e.g. `/update-user` would change `user.name` but not `landlords.name`). Open one only together with the dashboard feature that uses it.
  - Security headers in `src/middleware.ts` on SSR responses: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` (`no-referrer` on `/dat-lai-mat-khau`), `Permissions-Policy`, HSTS in production. No CSP yet (needs a tested allowlist for MapLibre, tiles, R2, wasm). `security.checkOrigin` is set explicitly in `astro.config.mjs`.
- **Chat assistant (renters):** Gemini Flash (`GEMINI_MODEL`, default `gemini-3.5-flash-lite` for latency, falls back to `GEMINI_FALLBACK_MODEL`, default `gemini-3.6-flash`, when overloaded) through REST `generateContent` with `fetch`, no SDK. Code in `src/lib/chat/`:
  - `assistant.ts` `runChat()`: function-calling loop (max 3 tool rounds). Tools in `tools.ts`: `search_rooms` (→ `searchRooms`, 5 rooms + listing link via `roomFiltersToQuery`) and `get_room` (→ `getRoomById`, public fields only). Prompt in `prompt.ts` (Vietnamese; embeds place and amenity slugs; never gives landlord phone, Zalo or email, points to the contact card).
  - `POST /api/tro-ly` (`{ messages, roomId? }` → `{ reply, rooms, listingUrl?, total? }`): same-origin check (`Origin` vs `Host`), zod (`src/lib/validation/chat.ts`, limits in `chat/limits.ts`), per-IP hourly limit (`src/lib/rate-limit.ts`, table `chat_rate_limits` hashed IP, `CHAT_RATE_LIMIT_PER_HOUR`, default 20). Nothing is stored: the browser keeps the history (sessionStorage).
  - UI: `ChatLauncher.astro` (floating icon button + `#chat-sheet` popover, `data-motion="sheet"`) rendered by `PublicLayout` on indexable pages when `GEMINI_API_KEY` is set; off on `/ban-do` (`chat={false}`); `/phong/[id]` passes `chatRoomId`. The `<room-chat>` element (`room-chat.ts`) is imported only when the panel first opens. Messages render as text, never HTML.
  - Use a Gemini key on a billing-enabled project (free-tier prompts may be used by Google).
- **Email:** `src/lib/email.ts` is the only module that sends mail: `sendEmail({ to, subject, html, text, replyTo? })` → `{ ok: true } | { ok: false, reason }`, never throws (callers decide what the user sees). Transports live in `email-core.ts` (no `astro:*`, also used by `npm run email:test`), chosen by `EMAIL_TRANSPORT`:
  - `console` (default): prints subject, recipient and links in dev; in a production build sends nothing and never logs links.
  - `gmail`: nodemailer, `smtp.gmail.com:465`, `GMAIL_USER` + `GMAIL_APP_PASSWORD` (16-character App Password, never the account password, never logged). From: `SITE_NAME` <GMAIL_USER>. One transporter per process. **Temporary until we have a domain: switch to `resend` + a domain before launch.**
  - `resend`: `RESEND_API_KEY` + `EMAIL_FROM` (verified domain).
  - Gmail daily cap in the DB (`email_send_counts`, one row per calendar day in Asia/Ho_Chi_Minh, counted before sending): warning from 400, refused above 480 (Gmail allows ~500). Only `gmail` sends count; `email:test` does not count. `db:cleanup` removes rows older than 7 days.
  - Templates: `src/lib/email/templates/` (`resetPassword`, `verifyEmail`, `newContactRequest`), plain functions returning `{ subject, html, text }`, Vietnamese, inline styles, always a plain-text part, `SITE_NAME` in subjects. Colors come from `EMAIL_COLORS` in `layout.ts`, the one allowed copy of hex values outside `global.css` (email clients cannot read CSS tokens); it mirrors `accent`, `accent-strong`, `ink`, `muted`, `line`, `paper`, so update both together. The button uses `accent`.
  - Node only (nodemailer): send from actions and Better Auth handlers, never middleware. Vercel deploys them as Node functions (`nodejs24.x`), Fly runs the Node adapter.
- **Maps:** MapLibre GL JS with OpenFreeMap vector tiles (style `https://tiles.openfreemap.org/styles/liberty`, no API key). Override with `PUBLIC_MAP_STYLE_URL` (e.g. a self-hosted style). Keep the OpenFreeMap / OpenMapTiles / OpenStreetMap attribution visible. No Google Maps API. If the style fails to load, `/ban-do` shows the room list and a notice.
- **Image storage:** Cloudflare R2 through the S3 API, signed with `aws4fetch` (`src/lib/storage/r2-core.ts`; app instance `r2.ts`). One bucket per environment. Public URLs: `PUBLIC_IMAGE_BASE_URL` + key (`src/lib/photo-urls.ts`).
  - Upload is browser -> R2 directly (image bytes never reach our server; Vercel caps bodies at ~4.5 MB): the browser resizes and re-encodes to WebP (`process-image.ts`: full ≤1600px, thumb ≤600px, quality 0.8; re-encoding drops EXIF/GPS), then `requestPhotoUploads` (session + ownership + max 10 → presigned PUTs, 5 min, Content-Type locked to `image/webp`), PUT with progress, then `confirmPhotoUploads` (HEAD + WebP header check: type, size ≤4 MB / 1 MB, real dimensions, no EXIF/XMP; saves `room_photos`). Logic in `src/lib/room-photo-uploads.ts`, rules in `src/lib/photo-rules.ts`.
  - Fallbacks loaded only when needed: `heic-to` (HEIC on browsers that cannot decode it) and `@jsquash/webp` (canvas without WebP encoding, i.e. Safari).
  - Keys: `rooms/{roomId}/{uuid}.webp` and `…-thumb.webp`, generated by the server. Deleting a photo or a room deletes its objects (best effort); `npm run r2:orphans` lists objects with no row older than 24h (`-- --delete` removes them; not scheduled).
  - Public pages use plain `<img>` with stored width/height (no layout shift): `thumbKey` in grids/cards/map, `key` on the detail page (`RoomPhoto.astro`). Not `astro:assets` (it would re-encode R2 images on our server).
  - Bucket CORS: PUT + `content-type` from `PUBLIC_SITE_URL` (+ `R2_CORS_EXTRA_ORIGINS`); `npm run r2:cors` prints the JSON (`-- --apply` sets it).
  - Browser uploads only sign `Content-Type`; after a confirm the server adds `PHOTO_CACHE_CONTROL` (1 year, immutable) by copying each object onto itself (`r2.setHeaders`, best effort). The seed writes the same header.
- **SEO and caching:** `site` in `astro.config.mjs` is `PUBLIC_SITE_URL`, so canonical, `og:url` and the sitemap never use the request host. Rules in `src/lib/seo.ts`: `/phong` canonical keeps only `khu-vuc` and `trang`; price/area/amenity combinations, empty results and `/ban-do?bbox=` are `noindex, follow`; `?trang=` past the last page redirects (301). JSON-LD via `components/seo/JsonLd.astro`: `Accommodation` + `Offer` and `BreadcrumbList` on `/phong/[id]` (never landlord details), `WebSite` on `/`. `/robots.txt` and `/sitemap.xml` are endpoints; robots answers `Disallow: /` unless `ALLOW_INDEXING=true` (production only). Public SSR pages call `setPublicCache(Astro)` (`src/lib/http-cache.ts`: `s-maxage=60, stale-while-revalidate`; `private, no-store` for non-GET, a session cookie or `?da-gui`; public responses carry `Vary: Cookie`, since the header differs when signed in). No in-memory caches.
- **Deploy:** two targets, same codebase
  - **Test / preview:** Vercel (`@astrojs/vercel`, serverless)
  - **Production:** Fly.io (`@astrojs/node` standalone, Docker): `Dockerfile` (PUBLIC_* as build args, secrets via `fly secrets set`), `fly.toml` (region `sin`, port 8080, `CLIENT_IP_HEADER=fly-client-ip`, health check `/robots.txt`).
  - **CI:** `.github/workflows/ci.yml` runs `check`, `npm test` and both builds with placeholder PUBLIC_* values.
  - The adapter is selected in `astro.config.mjs` via the `DEPLOY_TARGET` env var (`vercel` | `node`). Default is `node`.

> When a TBD above is decided, update this file before writing code that depends on it.

## Portability rules (must run on both Vercel and Fly.io)

- No local filesystem writes at runtime: Vercel's filesystem is ephemeral. Uploaded images go to external object storage through an S3-compatible API.
- No in-memory state that must persist across requests (sessions, rate limits, caches). Vercel runs many short-lived instances, so store this in the database or an external store.
- The database must be reachable over the network from both platforms (hosted Postgres or libSQL/Turso). Never use a SQLite file on a Fly volume.
- Do not use platform-specific APIs (Vercel Blob/KV/Edge Config, Vercel-only middleware features, Fly-only features) in app code. If one is unavoidable, isolate it behind an interface in `src/lib/`.
- All config comes from env vars (`import.meta.env` / `astro:env`). Keep `.env.example` up to date.
- Test and production use separate databases and storage buckets.

## Design

Goal: a calm, trustworthy, photo-first listing site. Room photos carry the color; the UI stays neutral. References: Airbnb (room detail page), StreetEasy (listing page and filters).

### Color tokens

Palette: **white + navy + orange**. Primary (navy `#0F3D6E`) is `accent`; accent orange (`#F97316`) is `highlight`. Neutrals are white and cool greys.

Defined in `src/styles/global.css` (`@theme`). That file is the source of truth for hex values; do not copy hex values anywhere else.

| Token                      | Use for                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `bg`                       | page background                                                        |
| `surface`                  | filter bar, section backgrounds, rented badge background, footer (with `line` top border, `ink`/`muted` text) |
| `paper`                    | cards, forms, modals                                                   |
| `line`                     | borders and dividers                                                   |
| `ink`                      | headings, body text, prices                                            |
| `muted`                    | secondary info (area, address, timestamps, "/tháng")                   |
| `accent` / `accent-strong` | primary CTA and links / their hover state                              |
| `accent-soft`              | "Còn trống" badge background (text: `accent-strong`)                   |
| `highlight` (orange)       | small badges only ("Mới đăng" on photos, "Giảm giá", the active-filter count); text on it is always `ink` (white on orange fails contrast) |
| `danger`                   | errors and destructive actions                                         |
| `inv-*`                    | at most one large CTA block per page; `inv-ink` also for text on `ink` (map toggle, selected chips) |

Rules:

- Use only these tokens. No other hex values (exception: `EMAIL_COLORS` for email HTML, see **Email**), no default Tailwind palette colors (`blue-500`, `gray-200`…), no opacity hacks to invent new shades.
- One primary `accent` button per screen. Other actions use outline or ghost buttons.
- `highlight` is never a large background and never a text color.
- Price: `ink`, medium weight. The "/tháng" suffix is `muted` and smaller.
- Room status badges: available = `accent-soft` + `accent-strong`; rented = `surface` + `muted`; hidden is dashboard-only.

### Typography

- Font: **Raleway** (trial; previously Be Vietnam Pro, still installed), self-hosted via `@fontsource/raleway` (weights 400, 500, 600 imported in `BaseLayout.astro`; includes the Vietnamese subset). No CDN font links.
- Exception (requested): the site name beside the header logo uses **Baloo 2** 700 (`font-brand font-bold`, `@fontsource/baloo-2/700.css`, `text-accent`; matches the logo lettering). Nowhere else; the 700 weight is allowed only here.
- No serif or decorative display fonts. Headings use the same sans family at weight 500.
- Weights: 400 and 500 (600 for the price only if needed). No 700+ for UI text.
- Type scale: five size tokens only, defined in `global.css` (Tailwind's default `text-*` sizes are removed):

  | Utility        | Size | Use for                                    |
  | -------------- | ---- | ------------------------------------------ |
  | `text-caption` | 12px | badges, fine print                         |
  | `text-small`   | 14px | labels, secondary info, small buttons      |
  | `text-body`    | 16px | body text, inputs, buttons                 |
  | `text-title`   | 20px | section headings (`h2`), card/aside prices |
  | `text-display` | 28px | page title (`h1`) only                     |

  No arbitrary sizes (`text-[…]`).

### Motion

Smooth, functional motion: things that open, close, or are pressed move; nothing moves just to decorate.

- Toasts: confirmations after a redirect (PRG flags like `?da-luu=1`) are toasts, not inline alerts. Pages build a `ToastNotice` (`src/lib/toast.ts`, `toastFromParams`) and pass `toast` to `DashboardLayout`, which renders `Toast.astro` (phones: top center below the header; md+: bottom right; `paper` + `line` + `shadow-float`). `motion/toast.ts`: fades/rises in, closes after 5s for every tone (paused on hover/focus) or with ×, and removes the flag from the URL. Form and action errors stay inline (`FormAlert`); so does the post-create guidance on `/quan-ly/phong/[id]?moi=1`. Dashboard only for now.
- Hover/active color feedback: color / background / border, 150ms ease-out, via the `transition-feedback` utility; never `transition` or `transition-all`.
- Movement uses **Motion** (`motion`, vanilla `animate()`), through the modules in `src/components/ui/motion/` (loaded once from `BaseLayout.astro`). Motion itself is lazy-loaded at idle (`motion.ts`); until it loads, or with `prefers-reduced-motion: reduce`, changes are instant. Never import `motion` elsewhere; add an effect there and use the shared timings (`EASE_OUT`, `EASE_IN`, `SPRING_PANEL`, `SPRING_PRESS`).
  - `data-press` on a button/link: shrinks to 0.96 while pressed, springs back. `Button.astro` has it; add it to icon buttons and pill triggers.
  - `data-motion="sheet"` on a `[popover]`: fades and rises in/out. `data-motion="drawer"`: same on phones, slides from the right from md. With JS these popovers become `manual`; `popover-motion.ts` handles Escape, outside press and close buttons so the exit can animate.
  - `<ui-select>` around a native `<select>` (with `data-chevron` on its arrow): on fine pointers it renders an animated, keyboard-accessible listbox; touch devices and no-JS keep the native picker. The native select stays the source of truth and fires `change`.
  - Page navigation crossfades with native cross-document view transitions (`@view-transition` in `global.css`); the header keeps `view-transition-name: site-header`.
- Cursor: every clickable control (buttons, `[role=button]`, popover triggers, selects, checkbox/radio/file inputs and their labels) gets `cursor: pointer` from the base layer in `global.css`, `not-allowed` when disabled; no per-component `cursor-pointer` needed. Drag handles keep `cursor-grab`.
- Focus: always a visible `:focus-visible` ring, 2px `accent` outline with 2px offset (set globally in `global.css`).
- Links: hover shows an underline, no animation (`.link` class).
- Not allowed: lift/translate on hover, scale/zoom on photos, animated underlines, scroll-triggered or staggered entrance animations on content.
- Every animation must respect `prefers-reduced-motion` (`transition-feedback` and the Motion helpers already do).
- Exception, requested for the map page (`/ban-do`) only, defined in `RoomMap.astro` under `prefers-reduced-motion: no-preference`:
  - price pills and clusters grow (`scale`, ~220ms) on hover, selection, or when the matching list card is hovered; they pop in and fade out as the view changes;
  - the preview popup / phone sheet fades and rises in, fades out on close;
  - while a new map area loads: a pulsing skeleton list (`line` blocks, no gradients) and a spinner pill; list cards then fade up with a short stagger.
  Animate only `opacity`, `scale`, `translate`, never the element MapLibre positions (animate its inner `.map-face`). Do not spread these effects to other pages without asking.

### Layout and components

- Mobile-first. Cards: photo on top (4:3), info below, no shadow, `line` border, consistent radius.
- Layout follows Airbnb: header with a search bar (`SearchBar`), home made of themed `RoomRow`s (swipe on phones, one grid line on md+; a row shows only with enough rooms), detail page with an adaptive photo mosaic and a sticky contact card.
- No amenity/category strip: every filter (place, price, area, amenities) lives in the "Bộ lọc" panel (`RoomFilters`, popover `#filter-sheet`), opened by `FilterButton` (next to "Sắp xếp" on `/phong`; above the list and, on phones, beside "Danh sách" on `/ban-do`).
- Overlays (search sheet, filter drawer, photo tour) use the native `popover` attribute so they work without JS. Base styles live in `global.css`.
- `shadow-float` (single layer) is the only shadow: search bar, popover panels, the sticky contact card, toasts, and map overlays (price pills, clusters, the map preview card, the map/list toggle). Never on listing cards.
- Shape (deliberately not Airbnb pills): text controls (search bar segments, buttons, nav links, filter and amenity chips, floating toggles) use `rounded-lg`; the md+ search bar frame uses `rounded-card`; small badges on photos ("Mới đăng", photo counter, "Ảnh bìa") use `rounded-md`. `rounded-full` only for icon-only buttons, the filter count dot, step icons, map price pills/clusters and skeleton lines.
- Map markers: price pill `paper` + `line` border + `ink` text; hovered or selected pill turns `ink` with `inv-ink` text. Clusters are `ink` circles with the count. Selecting a pin does not highlight or scroll the list; the preview links to the detail page. Base map styling only via `base-map.ts` (label language, hidden POI layers).

### Glass

Glass is allowed only on layers that float over content or photos. Use the utilities in `global.css`, never ad-hoc `backdrop-blur` or alpha colors:

| Utility        | Use for                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `glass`        | sticky header                                                            |
| `glass-strong` | overlay panels with text (search sheet, filter drawer, photo-tour header, phone action bar) |
| `glass-chip`   | small buttons on photos ("Xem tất cả ảnh", close on the map preview); text `ink` |
| `glass-dark`   | dark label on photos (photo counter); text `paper`                       |

Cards, forms, inputs, the page background and the footer stay solid. Each utility falls back to a solid token without `backdrop-filter` support or with `prefers-reduced-transparency`.
- Dense, scannable info over whitespace-heavy "landing page" layouts.
- Logo: `public/logo/logo-mark.webp` (header, dashboard header) and `logo-text.webp` (footer), plain `<img>`; both are generated from `assets-src/logo/logo.png` / `logo_text.png` (sources, not served) with the white background removed and trimmed. Never recolor or put them on a colored block. Favicons, app icons (`site.webmanifest`) and the default share image `og-default.jpg` (used by `BaseLayout` when a page passes no `image`) come from `npm run icons`, as does `public/brand/zalo.webp` (96px, from `assets-src/brand/zalo.png`).
- Icons: one outline icon set only (Lucide paths in `src/components/ui/icons.ts`, rendered by `Icon.astro`), never emoji. Exception (requested): the official Zalo logo image (`/brand/zalo.webp`, plain `<img>`, never recolored) on the "Nhắn Zalo" buttons only; its blue is part of the image, not a token.

### Do not

- Gradients, glow, noise/grain textures, multi-layer shadows; blur/glass outside the cases in **Glass** above
- Decorative animations or hover effects that were not requested
- Stock-photo hero sections or illustrations in place of real room photos
- Beige or tinted page backgrounds (they distort photo colors)

## Core domain

- **Landlord**: id, name, phone, zalo (optional), zaloPublicAt (opt-in time for "Nhắn Zalo", null = off; DB `zalo_public_at`), email
- **Room**: id, landlordId, title, description, price (VND/month), deposit, area (m², floor area), address (street only), ward, neighborhood (or null), province, location (`{ lat, lng }` or null; DB columns `lat`/`lng`), utilities, amenities[], photos (`RoomPhoto[]`: id, key, thumbKey, width, height, sortOrder; table `room_photos`; `photos[0]` is the cover), status (`available` | `rented` | `hidden`), createdAt, publishedAt (first switch to `available`, set once in `landlord-rooms-core.ts`; drives "Mới đăng", "Đăng N ngày trước" and the newest-first sort via `postedDate()`), updatedAt
  - Places follow the two-level system since 1/7/2025 (province -> ward/commune). `ward` is the official phường/xã (required); `neighborhood` ("Khu vực quen gọi") is an optional former ward name inside it; `province` is the constant `PROVINCE` ("Gia Lai"), not in the form. The catalog and the old -> new mapping (NQ 1664/NQ-UBTVQH15, NQ 1257/NQ-UBTVQH15) live only in `src/lib/locations.ts`; display with `formatPlace` ("Ghềnh Ráng, P. Quy Nhơn Nam"). DB also stores `ward_slug` / `neighborhood_slug` (derived in `mappers.ts`).
  - `utilities`: electricity (`{ kind: 'state' }` = "Giá nhà nước", or `{ kind: 'per-kwh', price }`), water (`{ price, unit: 'm3' | 'person' }`), wifi, serviceFee. Every one: `null` = "Thỏa thuận", 0 = "Miễn phí / đã bao gồm". Shown as "Chi phí hàng tháng" on the detail page (`formatUtilities`).
- **ContactRequest**: id, roomId, renterName, renterPhone, message, preferredViewingTime (optional), status (`new` | `contacted` | `closed`), createdAt

Rules:

- Only `available` rooms appear in public listings. The `hidden` badge ("Đang ẩn") is dashboard-only.
- A landlord can only read and edit their own rooms and contact requests.
- Prices are stored as integers in VND and formatted only at display time.
- The renter's phone number is required on a contact request. Validate the Vietnamese phone format.
- `location` is an approximate street-level point, never the exact house. Rooms without one are left off the map but still listed.

## Main pages / routes

Public:

- `/` home: search box plus featured / latest rooms
- `/phong` listing with filters (place, price range, area, amenities), sort and pagination. Query params: `khu-vuc` (a ward slug such as `quy-nhon-nam` or a neighborhood slug such as `ghenh-rang`; `placeBySlug`), `gia`, `dien-tich`, `tien-ich` (comma list of slugs from `src/lib/amenities.ts`), `sap-xep`, `trang`
- `/ban-do` map discovery: price markers with clustering, preview card on click, list of rooms in the visible area beside the map (lg+) or behind a "Danh sách" toggle (phones). Same filter params as `/phong` plus `bbox=south,west,north,east`, kept in sync with the map view.
- `/phong/[id]` room detail: gallery, info, map/address ("Xem trên bản đồ" opens `/ban-do?bbox=` around the pin, else a Google Maps search of the area), contact form. A rented room rewrites to `/404` with `locals.rentedRoom`: status 410, "Đã có người thuê" and similar rooms. Hidden or unknown: 404.
- `/500` error page: `BaseLayout` only, no DB call.
- `/chinh-sach-bao-mat` (privacy notice, Nghị định 13/2023) and `/dieu-khoan` (terms): draft wording to be reviewed by the owner; linked from the footer, the contact form and sign-up; contact address from optional `CONTACT_EMAIL`. Keep the privacy page in sync with what the code collects.
- `/nguon-anh`: photo credits.
- Landlord contact info is shown only as the contact form (to limit spam and scraping), plus the "Gọi điện" and opt-in "Nhắn Zalo" redirects (see **Direct contact**). Numbers are never in the page; email is never shown.

Landlord (auth required):

- `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` (public, `noindex`)
- `/quan-ly` dashboard overview (rooms by status, new contact requests, "Đăng phòng mới")
- `/quan-ly/phong` my rooms (status select + "Lưu", delete with a confirm popover); `/quan-ly/phong/moi` create; `/quan-ly/phong/[id]` edit. Both use `RoomForm`; the edit page adds the photo manager (section `#anh`). Mutations: `src/actions/rooms.ts`; queries: `src/lib/landlord-rooms.ts` (factory in `landlord-rooms-core.ts`), every one scoped by `landlordId` in SQL. Another landlord's room is answered with 404, never 403.
- New rooms start `hidden`; "Lưu và thêm ảnh" redirects to `/quan-ly/phong/{id}?moi=1#anh`. A room cannot be `available` with 0 photos or while the landlord's email is unverified (both guarded in SQL in `landlord-rooms-core.ts`, results `needs-photo` / `needs-verification`); deleting the last photo of an available room switches it to `hidden` and says so.
- Landlord entry points (header, footer, home CTA) follow the sign-in state (`PublicLayout` reads `getAuthState` once; no DB call without a session cookie): signed out shows "Cho thuê phòng" → `LANDLORD_SIGN_UP_PATH` (`/dang-ky?next=/quan-ly/phong/moi`; footer and home CTA also offer "Đăng nhập" → `LANDLORD_SIGN_IN_PATH`); signed in shows "Đăng phòng" → `LANDLORD_START_PATH` plus "Quản lý" → `/quan-ly`. Paths in `src/lib/site.ts`.
- `/quan-ly/lien-he` contact requests inbox: newest first, tabs by status (`?trang-thai=moi|da-lien-he|da-xong`), `?trang=`, call / Zalo links, status select + "Lưu". The overview card "Yêu cầu liên hệ mới" links to `?trang-thai=moi`.
- `/quan-ly/tai-khoan` account: name, phone, Zalo and the "Nhắn Zalo" opt-in (`updateProfile`, writes `landlords` and `user.name` together, `src/lib/landlord-profile.ts`) and password (`changePassword` → Better Auth `/change-password`, current password required, other sessions revoked, rate limited), signed-in devices (`#thiet-bi`) and account deletion (`#xoa-tai-khoan`, then `/dang-nhap?da-xoa-tai-khoan=1`). Email cannot be changed yet.

## Project structure

```
src/
  pages/            # routes only; keep logic thin
  layouts/          # BaseLayout, DashboardLayout
  components/
    ui/             # generic primitives (Button, Input, Card, Modal)
    room/           # RoomCard, RoomGallery, RoomFilters, RoomForm
    contact/        # ContactForm
    dashboard/      # dashboard-only components
  lib/              # data access, auth helpers, formatters, validation (zod)
  actions/          # Astro Actions (form handling, mutations)
  types/            # shared TS types (Room, Landlord, ContactRequest)
  styles/
public/
```

Conventions:

- One component per file, PascalCase filenames.
- All data access goes through `src/lib/`. Pages and components never call the DB/API directly.
- Validate every form input with zod schemas in `src/lib/validation/`. Share the same schema between client and server.
- Route slugs are Vietnamese without diacritics (`phong`, `quan-ly`); code identifiers are English.
- Mobile-first: most renters browse on phones.

## Commands

```
npm run dev       # dev server
npm run build     # production build
npm run preview   # preview build
npm run check     # astro check (types)
npm run db:generate / db:migrate / db:seed   # Drizzle migrations, seed (needs SEED_PASSWORD)
npm run auth:generate                        # regenerate Better Auth tables
npm run test:ownership                       # landlord A cannot touch landlord B's rooms, photos or contact requests (writes to the DB, refuses production; add BASE_URL=<PUBLIC_SITE_URL> with dev running for HTTP checks)
npm run r2:orphans [-- --delete]             # photo objects in R2 with no DB row, older than 24h
npm run r2:cors [-- --apply]                 # bucket CORS rule for direct uploads
npm test                                     # unit tests (node:test via tsx, tests/*.test.ts; pure modules only, no DB)
npm run db:cleanup [-- --delete [--production]]  # expired sessions/verifications and old rate-limit rows (dry run by default)
npm run email:test -- you@example.com        # one email of each template through EMAIL_TRANSPORT
npm run icons                                # favicons, app icons, og-default.jpg from the logo and hero photo
npm run db:seed                              # also uploads mock photos to the test bucket; refuses production (PRODUCTION_DB_ENDPOINT / PRODUCTION_R2_BUCKET)
```

### Scripts to run after a change

| What changed                                         | Run                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `package.json` dependencies (pulled or added)        | `npm install`                                              |
| Drizzle schema (`src/lib/db/schema.ts`)              | `npm run db:generate`, review the SQL, then `npm run db:migrate`. Renames need `drizzle-kit generate --custom` + hand-written SQL (generate prompts interactively); see `drizzle/0003_wards_utilities.sql` |
| Better Auth config that adds/changes tables or fields | `npm run auth:generate`, then `db:generate` + `db:migrate` |
| New migration files pulled from git                  | `npm run db:migrate`                                       |
| Mock data / seed script                              | `npm run db:seed` (needs `SEED_PASSWORD`; never in production) |
| `.env` / `astro.config.mjs` / `src/env.d.ts` / middleware | restart `npm run dev`                                 |
| Landlord room queries, actions or auth                | `npm run test:ownership` (with `BASE_URL` and dev running for the HTTP part) |
| `PUBLIC_SITE_URL` or allowed upload origins          | `npm run r2:cors`, then apply the JSON to the bucket (or `-- --apply`) |
| Email templates or transport                          | `npm run email:test -- you@example.com` (with the transport you want to check) |
| Logo or hero photo                                    | `npm run icons`                                            |
| Any code change, before calling it done              | `npm run check`, `npm test`, `npm run build` (and `DEPLOY_TARGET=vercel npm run build` when config, adapters or server code changed) |

Local network note: on networks that inspect HTTPS (database calls fail with "fetch failed" / `UNABLE_TO_VERIFY_LEAF_SIGNATURE`), set `NODE_OPTIONS=--use-system-ca` on the machine. Never commit it, never use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Working notes for Claude

- Ask before implementing when any part of a task is ambiguous (scope, behavior, UI copy, data model, which option to pick). List the open questions together, with a recommended answer for each, and wait for the reply. Do not guess and build.
- Every final reply after changing code ends with a section **"Scripts cần chạy"** listing, in order, the exact commands the user must run for this change (see "Scripts to run after a change"), or "Không cần chạy gì thêm" if none. Say which ones Claude already ran.
- Before adding a dependency, check whether Astro or the existing stack already covers it.
- Keep public pages fast: optimize images with `astro:assets`, lazy-load the gallery, avoid client JS on listing pages.
- When adding a new entity field, update in this order: `types/`, the zod schema, the data layer in `lib/`, the form, then the display components.
- Update this file when the architecture or a TBD decision changes.
- “After implementing, open the page at 375px and 1440px widths, take screenshots, and fix spacing or overflow issues you see. I already added playwright MCP

## Deployment TODO

Not done yet; do these when the domains exist (no domains are decided yet).

- Only one Neon database exists today, and `PRODUCTION_DB_ENDPOINT` names it, so `db:seed` and `test:ownership` refuse to run. Create a test branch in Neon, point `.env` `DATABASE_URL` at it and run `npm run db:migrate` there before running them.

- Test bucket CORS: add the Vercel test domain to the allowed origins (`R2_CORS_EXTRA_ORIGINS` or that environment's `PUBLIC_SITE_URL`, then `npm run r2:cors`). Today it allows only `http://localhost:4321`.
- Production bucket: create it, a token scoped to it (Object Read & Write), its public URL (custom domain), and its CORS (only the production origin). Set `PRODUCTION_R2_BUCKET` in every environment that can run the seed.
- Per environment (Vercel test, Fly production): set `PUBLIC_SITE_URL`, `BETTER_AUTH_SECRET` (different per environment), `DATABASE_URL`, `R2_*` and `PUBLIC_IMAGE_BASE_URL`. `PUBLIC_*` values are inlined at build time, so set them before building.
- Set `PRODUCTION_DB_ENDPOINT` (the production Neon `ep-…` id) wherever the seed can run.
- Production only: `ALLOW_INDEXING=true` (robots.txt opens and points to the sitemap), then submit `/sitemap.xml` in Google Search Console.
- Email: move from Gmail SMTP to Resend with the domain before launch (`EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM`). Production needs one of `gmail`/`resend`, otherwise password resets never arrive.
- Decide whether to schedule `npm run r2:orphans -- --delete` and `npm run db:cleanup -- --delete --production`.
- Fly: rename `app` in `fly.toml`, set its `[build.args]` (PUBLIC_*) and `fly secrets set` (see the comment in `fly.toml`). Set `CONTACT_EMAIL` and have the owner review `/chinh-sach-bao-mat` and `/dieu-khoan`.
