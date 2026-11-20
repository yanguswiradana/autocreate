# Autocreate Studio — Handover & Status Notes

> **Last Updated:** 2026-11-20  
> **Branch:** `master` (synced to `origin/master` & `company/wira`, `main` untouched)  
> **Latest Commit:** `5492214`  
> **GitHub Progress Issue:** https://github.com/Arcom-Teknologi-Intern/content_creation_sosmed_automation/issues/45

---

## 1. Arsitektur & Layanan Aktif (`docker-compose.yml`)

Seluruh stack berjalan via Docker Compose (`docker compose up -d --build`):

| Service | Container | Port | Peran |
|---|---|---|---|
| **Web Studio** | `autocreate-web` | `http://localhost:3001` | Next.js 16 (App Router) UI & proxy `/api/*`, `/outputs/*`, `/renderer-api/*` |
| **Laravel API** | `autocreate-api` | `http://localhost:8001` | REST API, AI Chat Intent, Social Publish, Storage, Auto-Discover RSS |
| **Queue Worker** | `autocreate-api-worker` | internal | Memproses `DispatchRenderJob` & `ProcessVideoEditJob` |
| **PostgreSQL** | `autocreate-postgres` | `5432` | Menyimpan `content_jobs`, `provider_keys`, `brandkits`, `video_edits`, `social_accounts`, `social_publish_logs` |
| **Remotion Renderer** | `autocreate-renderer` | `http://localhost:4173` | Render Carousel PNG, Poster PNG, Video MP4 (Edge-TTS + Ken Burns + BGM), Wikimedia/Pollinations/Gemini visuals |
| **Video AI** | `autocreate-video-ai` | internal `8090` | FastAPI + FFmpeg untuk `Edit Video Take` (trim, remove silence, auto-subtitle, masking) |

---

## 2. Fitur yang Sudah Selesai & Terverifikasi

### Chat Studio & AI Intent (`apps/api/app/Http/Controllers/ContentJobController.php`, `apps/web/src/components/ChatHarnessStudio.tsx`)
- Transisi instan dari layar awal ke thread chat + spinner tombol kirim + bubble animasi AI thinking (`AS`).
- Memori multi-turn (`knownUrls` + 6 pesan terakhir `history`) agar link berita tidak terlupakan saat AI bertanya/klarifikasi.
- Deteksi multi-format (`carousel`, `video`, `poster`, `raw`), rasio (`4:5`, `1:1`, `9:16`, `16:9`), slide (`3`, `5`, `7`, `10`), provider visual (`wikimedia`, `pollinations`, `gemini`, `procedural`), tema warna, gaya layout, bahasa (`id`/`en`), revisi opsi di tengah alur, dan perintah cepat (`"gas"`).
- Layar awal dilengkapi Quick Prompt Chips (*Coba cepat*), sidebar tetap (`shrink-0`) dengan daftar **Terakhir** yang scroll mandiri.

### Preset, Gaya Layout, Poster Adaptif & Renderer (`src/`)
- **6 Preset Visual** (`src/presets/themes.ts`): `noir_editorial`, `midnight_tech`, `monochrome_luxury`, `warm_cinematic`, `neon_cyber`, `clean_paper`.
- **8 Gaya Konten (`series`)** (`src/presets/series.ts`, `src/types/blueprint.ts`): `edukasi`, `fakta_cepat`, `storytelling`, `promo_brand`, `komparasi`, `kronologi`, `checklist`, `opini_quote`.
- **11 Layout Slide Carousel** (`src/remotion/CarouselSlide.tsx`): `editorial`, `split_card`, `quote_focus`, `big_number`, `photo_top_split`, `news_headline`, `highlight_box`, `versus_split`, `checklist_card`, `timeline_step`, `full_bleed_caption`.
- **Poster Adaptif** (`src/remotion/PosterCard.tsx`): layout berubah mengikuti `series` (Berita/Timeline, Komparasi 2 Kolom, Spotlight Editorial, Checklist/Poin).
- **Video & Visual** (`src/remotion/ShortVideo.tsx`, `src/services/visualFactory.ts`, `src/services/gemini.ts`):
  - Efek gerak Ken Burns (zoom + pan horizontal bergantian) + proteksi anti-overflow teks.
  - Pilihan Voiceover TTS (`id-ID-ArdiNeural`, `id-ID-GadisNeural`, `en-US-AndrewNeural`, `en-US-AriaNeural`) & BGM (`ambient_dark`, `lofi_calm`, `cinematic_pulse`, `none`).
  - Pencarian foto **Wikimedia** memakai kata kunci konkret gabungan `topic + slideTitle + visualPrompt` (2-kata query, filter bitmap `>= 500x350`, tanpa ikon/peta/arsip lama).

### Preview, Manajemen Proyek, Setting & Otomasi (`apps/web/src/components/`)
- **ArtifactPreviewPanel (`ArtifactPreviewPanel.tsx`)**:
  - **Edit Teks & Re-render** tanpa panggil AI ulang (`preset`, `series`, `hookTitle`, `subtitle`, `slideTitle`, `slideBody`, `caption`, `hashtags`, `voice`, `bgm`, plus ganti foto per slide).
  - **Publish Sosmed**: publish langsung atau jadwalkan upload ke Instagram / YouTube Shorts / TikTok + riwayat publish.
  - Tombol **Coba Lagi** saat job gagal dengan pesan error ramah pengguna (`formatFriendlyError`).
- **ConfirmModal (`ConfirmModal.tsx`)**: seluruh dialog konfirmasi hapus/bersihkan memakai modal gelap custom (bukan `window.confirm`).
- **SettingsView (`SettingsView.tsx`)**:
  - Tab `Provider AI`, `Preferensi Default` (termasuk `series`, `voice`, `bgm`), `Brandkit` (+ **Export/Import JSON**), `Sosmed & Publish`, `Panduan & FAQ`, dan `Status Sistem` (**Manajemen Storage `outputs/`** + **Auto-Discover RSS → Render Draft**).
- **Scheduler Laravel (`apps/api/routes/console.php`)**:
  - `app:auto-discover-render` (harian `07:00`) & `app:process-scheduled-publishes` (setiap 5 menit).

---

## 3. Cara Verifikasi Cepat untuk Agent Berikutnya

```powershell
# 1. Cek status container
docker compose ps

# 2. Typecheck & Lint
npm run typecheck
cd apps/web && npx tsc --noEmit
php -l apps/api/app/Http/Controllers/ContentJobController.php

# 3. Smoke Test E2E (Health -> Chat Intent -> Render Wikimedia -> Edit Teks & Re-render -> Cleanup)
npm run test:smoke
```

---

## 4. Saran Tugas Lanjutan (Jika User Melanjutkan)
1. **Uji Kualitas Foto & Generate di UI**: jika ingin hasil foto *lifestyle/bisnis* lebih modern dari Wikimedia Commons, aktifkan `PEXELS_API_KEY` (atau `UNSPLASH_ACCESS_KEY`) di `.env` dan tambahkan opsi `pexels`/`unsplash` di `VISUAL_PROVIDERS` (`apps/web/src/types/studio.ts`).
2. **Uji Publish Sosmed Nyata**: isi Access Token di **Setting → Sosmed & Publish** (dan atur `PUBLIC_BASE_URL` HTTPS publik di `.env` untuk Instagram Graph API / TikTok).
3. **Monitoring Production**: tambahkan cron/daemon untuk `php artisan schedule:work` di container API jika ingin scheduler `07:00` RSS & 5-menit scheduled publish berjalan otomatis di background tanpa pemicu manual.
