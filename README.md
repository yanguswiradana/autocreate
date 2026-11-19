# Autocreate Studio

Studio otomasi konten **Hybrid Image & Video** berbasis **Next.js**, **Laravel API & Queue**, **PostgreSQL**, **Remotion**, **Gemini / OpenCode Go**, **Edge-TTS**, dan layanan **Video AI (FastAPI + FFmpeg)**.

Dari satu prompt chat, topik, atau tautan berita, sistem ini menghasilkan:
- **Multi-Slide Carousel** (`PNG` — rasio `4:5`, `1:1`, `9:16`, `16:9`, 3/5/7/10 slide)
- **Short-Form Video** (`MP4` — efek gerak *Ken Burns*, *voiceover* Edge-TTS, musik latar BGM, & *dynamic highlight subtitles*)
- **Summary Poster** (`PNG` — layout adaptif mengikuti gaya konten)
- **Raw Visual Assets** (`JPG/PNG/SVG` dari Wikimedia Commons, Pollinations AI, Gemini Imagen, atau Procedural)
- **Caption & Hashtags** siap salin (`caption.txt`) + **Download ZIP**

---

## Fitur Utama

### 1. Chat Studio & AI Intent Multi-Turn
- **Animasi AI Thinking** di dalam thread chat saat memproses maksud pesan.
- **Memori URL & Riwayat Percakapan**: menempel link lalu menjawab format/jumlah slide di pesan berikutnya tetap menjaga URL referensi.
- **Deteksi Multi-Opsi**: mengenali format ganda (`carousel` + `video`), rasio, jumlah slide, gaya konten, tema warna, provider visual, bahasa (`ID`/`EN`), revisi opsi di tengah alur, dan eksekusi cepat (`"gas"`).
- **Quick Prompt Chips** di layar chat awal, **@Remix** proyek lama, **Ide RSS**, dan **Mode Batch**.

### 2. Template, Preset Visual & Layout Adaptif
- **6 Preset Visual**: `noir_editorial`, `midnight_tech`, `monochrome_luxury`, `warm_cinematic`, `neon_cyber`, `clean_paper`.
- **8 Gaya Konten (`series`)**: `edukasi`, `fakta_cepat`, `storytelling`, `promo_brand`, `komparasi` (*Mitos vs Fakta*), `kronologi` (*Timeline*), `checklist`, dan `opini_quote`.
- **11 Layout Slide Carousel** (`editorial`, `split_card`, `quote_focus`, `big_number`, `photo_top_split`, `news_headline`, `highlight_box`, `versus_split`, `checklist_card`, `timeline_step`, `full_bleed_caption`) + **Poster adaptif** & **proteksi anti-overflow**.

### 3. Preview, Edit Teks/Foto, & Manajemen Proyek
- **Edit Teks & Re-render Tanpa Panggil AI**: ubah `preset`, `series`, `hookTitle`, `subtitle`, `slideTitle`, `slideBody`, `caption`, `hashtags`, `voice`, `bgm`, atau ganti foto per slide lalu klik **Simpan & Re-render**.
- **Riwayat & Render**: filter status (`Semua`, `Selesai`, `Proses`, `Gagal`), pencarian, **Clone**, **Coba Lagi (Retry)**, **Bersihkan Gagal**, tombol **ZIP** langsung, dan konfirmasi hapus.
- **Brandkit + Export/Import JSON**: atur logo, palet warna, font, serta ekspor/impor konfigurasi JSON di menu **Setting**.
- **Edit Video Take**: upload video mentah untuk potong bagian diam (*remove silence*), transkrip subtitle otomatis, masking background, dan rasio vertikal/landscape.
- **Manajemen Storage & Auto-Discover RSS**: cek pemakaian disk `outputs/`, bersihkan folder *orphan*, dan jalankan **Auto-Discover RSS → Render Draft** (`POST /api/auto-discover/run` atau `php artisan app:auto-discover-render` terjadwal harian pukul `07:00`).

---

## Menjalankan dengan Docker (Direkomendasikan)

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Layanan yang berjalan:
- **Web Studio (Next.js)**: `http://localhost:3001`
- **Laravel API**: `http://localhost:8001` (health: `/api/health`)
- **Remotion Renderer**: `http://localhost:4173`
- **PostgreSQL**: port `5432`
- **Video AI Service (FastAPI)**: port `8090` (internal network)

Atur `GEMINI_API_KEY` dan/atau `OPENCODE_API_KEY` langsung lewat menu **Setting → Provider AI** di Web UI (atau via `.env`).

---

## Verifikasi & Pengujian

```powershell
# Typecheck Renderer & Web
npm run typecheck
cd apps/web && npx tsc --noEmit

# Uji E2E otomatis (Health, Chat Intent, Render Carousel+Poster Wikimedia, Edit Teks & Re-render, Cleanup)
npm run test:smoke
```
