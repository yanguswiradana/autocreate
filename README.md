# Autocreate Studio

Mesin otomasi konten **Hybrid Image & Video** berbasis **Remotion**, **Gemini API** (dengan fallback **OpenCode Go**), dan **Edge-TTS** dalam tema **Gelap & Elegan**.

Dari satu ide topik (atau hasil kurasi RSS otomatis), sistem ini dapat menghasilkan:
- **Multi-Slide Carousel** (`1080x1350` PNG)
- **Short-Form Video** (`1080x1920` MP4) lengkap dengan *voiceover* otomatis, musik latar, dan *dynamic highlight subtitles* per kata
- **Summary Poster** (`1080x1350` PNG)
- **Raw Aesthetic Images** (aset visual polos)
- **Caption & Hashtags** siap posting (`caption.txt`)

---

## Fitur Utama

- **3 Preset Visual Gelap & Elegan:**
  - `noir_editorial` — Charcoal & Gold dengan tipografi Serif klasik.
  - `midnight_tech` — Deep Navy & Cyan bergaya modern futuristik.
  - `monochrome_luxury` — Hitam-putih kontras tinggi bergaya *fine art*.
- **AI Content Director + Fallback:** Menggunakan Gemini API (`gemini-3.8-flash`) dan otomatis beralih ke **OpenCode Go** (`glm-5.3-flash`) jika Gemini sedang sibuk atau terkena limit.
- **Voiceover & Dynamic Subtitles:** Menggunakan `msedge-tts` gratis (mendukung suara Indonesia `id-ID-ArdiNeural`, `id-ID-GadisNeural`, dll.) lengkap dengan *word-level timestamps* untuk menyorot kata yang sedang diucapkan.
- **Fleksibel Visual Provider:**
  - `procedural` (gratis offline, latar geometris gelap)
  - `wikimedia` (gratis tanpa API key, foto dari Wikimedia Commons)
  - `unsplash` (gratis via `UNSPLASH_ACCESS_KEY`)
  - `pexels` (via `PEXELS_API_KEY`)
  - `gemini` (via Imagen API)
- **Web Dashboard Lokal (`npm run ui`):** Antarmuka studio di browser (`http://127.0.0.1:4173`) dengan preset card, preview bertab, *lightbox zoom*, tombol *Ambil Ide RSS*, dan manajemen riwayat project.
- **Batch Generator (`npm run batch`):** Render puluhan topik sekaligus dari `topics.json` dengan 1 kali *bundling* Remotion.
- **Auto-Topic Finder (`npm run discover`):** Mengambil berita terbaru dari RSS feed (`feeds.config.json`), melakukan deduplikasi, lalu menyusun daftar topik siap render.
- **Kustomisasi Brand Terpusat:** Atur `@brandTag`, teks footer, dan logo lewat [brand.config.json](brand.config.json).

---

## Persyaratan Sistem

- **Node.js** v20+ (diuji pada v24)
- **FFmpeg** & **FFprobe** terpasang di `PATH` sistem

---

## Instalasi & Setup

1. Clone repositori dan masuk ke direktori proyek:
   ```powershell
   git clone https://github.com/yanguswiradana/autocreate.git
   cd autocreate
   ```
2. Pasang dependensi dan browser *headless* Remotion:
   ```powershell
   npm install
   npx remotion browser ensure
   ```
3. Salin `.env.example` menjadi `.env`, lalu isi minimal `GEMINI_API_KEY` (dan opsional `OPENCODE_API_KEY` sebagai fallback):
   ```powershell
   Copy-Item .env.example .env
   ```

---

## Cara Penggunaan

### 1. Web Dashboard Lokal (Direkomendasikan)
```powershell
npm run ui
```
Buka `http://127.0.0.1:4173` di browser untuk membuat konten, mengambil ide RSS, dan melihat preview langsung.

### 2. Single Generate via CLI
```powershell
npm run generate -- --topic "Kenapa Otak Susah Fokus di Era AI" --preset midnight_tech --outputs carousel,video
```
Opsi tambahan:
- `--visual wikimedia` (atau `procedural`, `unsplash`, `pexels`, `gemini`)
- `--voice id-ID-GadisNeural`
- `--slides 5`
- `--mock` (test pipeline tanpa memakai kuota AI)

### 3. Auto-Topic Finder (RSS) & Batch Generator
1. Sesuaikan sumber RSS di `feeds.config.json`.
2. Jalankan pencarian topik otomatis ke `topics.json`:
   ```powershell
   npm run discover
   ```
3. Render seluruh topik di `topics.json`:
   ```powershell
   npm run batch
   ```
   *(Atau gabungkan langsung dengan `npm run discover -- --run`)*.

### 4. Remotion Studio (Preview Komposisi)
```powershell
npm run studio
```

---

## Struktur Proyek

```text
autocreate/
├── assets/               # Musik latar default (ambient_dark.mp3) & logo opsional
├── public/               # Web Dashboard UI (index.html)
├── src/
│   ├── cli/              # Entrypoint CLI (generate.ts, batch.ts, discover.ts)
│   ├── config/           # Loader konfigurasi brand
│   ├── presets/          # Definisi tema warna & tipografi (themes.ts)
│   ├── remotion/         # Komposisi React Remotion (CarouselSlide, PosterCard, ShortVideo)
│   ├── server/           # Server HTTP lokal untuk dashboard UI
│   ├── services/         # Pipeline AI, TTS, Visual Factory, & RSS Topic Finder
│   └── types/            # Skema Zod untuk ContentBlueprint
├── brand.config.json     # Pengaturan handle, badge, & logo brand
├── feeds.config.json     # Daftar RSS feed untuk Auto-Topic Finder
└── topics.example.json   # Contoh daftar topik untuk batch mode
```

---

## Lisensi & Atribusi

Proyek ini menggunakan **[Remotion](https://github.com/remotion-dev/remotion)** untuk rendering gambar dan video secara programatik.

- Penggunaan Remotion tunduk pada **[Remotion License](https://www.remotion.dev/license)**:
  - **Gratis** untuk individu, organisasi non-profit/edukasi, serta perusahaan dengan total anggota maksimal **3 orang**.
  - Perusahaan profit dengan **4 orang atau lebih** wajib memiliki **Remotion Company License**.

