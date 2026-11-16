"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FaqChatbot } from "./FaqChatbot";

interface ContentJobRecord {
  id: number;
  topic: string;
  preset: string;
  series?: string | null;
  aspect_ratio: string;
  language: string;
  outputs: string[];
  reference_urls?: string[] | null;
  status: "queued" | "processing" | "completed" | "failed";
  source: string;
  batch_id?: string | null;
  folder_name?: string | null;
  manifest?: {
    slides?: string[];
    poster?: string;
    video?: string;
    caption?: string;
    hashtags?: string[];
  } | null;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

interface RefCheckResult {
  url: string;
  title: string;
  content: string;
  method: "direct" | "jina";
  ok: boolean;
  error?: string;
}

interface RssTopic {
  topic: string;
  preset: string;
  link?: string;
}

export function StudioDashboard() {
  const [isDark, setIsDark] = useState(true);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [topic, setTopic] = useState("");
  const [referenceUrlsText, setReferenceUrlsText] = useState("");
  const [refResults, setRefResults] = useState<RefCheckResult[]>([]);
  const [checkingRefs, setCheckingRefs] = useState(false);
  const [rssSuggestions, setRssSuggestions] = useState<RssTopic[]>([]);
  const [loadingRss, setLoadingRss] = useState(false);

  const [preset, setPreset] = useState("noir_editorial");
  const [series, setSeries] = useState("edukasi");
  const [outputs, setOutputs] = useState<string[]>(["carousel", "video"]);
  const [language, setLanguage] = useState("id");
  const [aspectRatio, setAspectRatio] = useState("4:5");
  const [visualProvider, setVisualProvider] = useState("procedural");
  const [slides, setSlides] = useState(5);
  const [mock, setMock] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

  const [jobs, setJobs] = useState<ContentJobRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "carousel" | "video" | "poster">("all");

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list: ContentJobRecord[] = data.jobs || [];
      setJobs(list);
      setSelectedId((prev) =>
        prev && list.some((j) => j.id === prev) ? prev : (list[0]?.id ?? null)
      );
    } catch {
      // ignore transient poll error
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const hasActiveJobs = useMemo(
    () => jobs.some((j) => j.status === "queued" || j.status === "processing"),
    [jobs]
  );

  useEffect(() => {
    if (!hasActiveJobs) return;
    const t = setInterval(loadJobs, 2500);
    return () => clearInterval(t);
  }, [hasActiveJobs, loadJobs]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId]
  );

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.topic.toLowerCase().includes(q) ||
        j.preset.toLowerCase().includes(q) ||
        (j.folder_name || "").toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const toggleOutput = (val: string) => {
    setOutputs((prev) =>
      prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
    );
  };

  const handleCheckRefs = async () => {
    const urls = referenceUrlsText
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setBanner({ type: "err", text: "Masukkan minimal 1 URL referensi terlebih dahulu." });
      return;
    }
    setCheckingRefs(true);
    try {
      const res = await fetch("/api/extract-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengecek link");
      setRefResults(data.results || []);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal mengecek link",
      });
    } finally {
      setCheckingRefs(false);
    }
  };

  const handleDiscoverRss = async () => {
    setLoadingRss(true);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 4, mock }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengambil RSS");
      setRssSuggestions(data.topics || []);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal mengambil RSS",
      });
    } finally {
      setLoadingRss(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (outputs.length === 0) {
      setBanner({ type: "err", text: "Pilih minimal 1 format output." });
      return;
    }

    const refUrls = referenceUrlsText
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);

    setSubmitting(true);
    setBanner(null);

    try {
      if (isBatchMode) {
        const topics = topic
          .split(/\r?\n/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (topics.length === 0) {
          throw new Error("Masukkan minimal 1 topik (1 topik per baris).");
        }
        const res = await fetch("/api/batches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topics,
            preset,
            series,
            aspectRatio,
            language,
            outputs,
            options: { slides, mock, visualProvider },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal mengirim batch");
        setBanner({
          type: "ok",
          text: `Batch ${topics.length} topik masuk ke antrean Laravel Queue (${data.batchId}).`,
        });
      } else {
        if (!topic.trim() && refUrls.length === 0) {
          throw new Error("Isi Topik atau minimal 1 Link Referensi.");
        }
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: topic.trim(),
            preset,
            series,
            aspectRatio,
            language,
            outputs,
            referenceUrls: refUrls,
            options: { slides, mock, visualProvider },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal membuat job");
        setSelectedId(data.job?.id ?? null);
        setBanner({
          type: "info",
          text: `Job #${data.job?.id} masuk ke antrean Laravel Queue & PostgreSQL...`,
        });
      }
      await loadJobs();
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Terjadi kesalahan",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    await loadJobs();
  };

  const bgCls = isDark ? "bg-[#09090b] text-zinc-100" : "bg-[#f3f4f6] text-slate-900";
  const panelCls = isDark
    ? "bg-[#111217] border-white/10"
    : "bg-white border-slate-200 shadow-sm";
  const surfaceCls = isDark
    ? "bg-[#181a22] border-white/10 text-zinc-100"
    : "bg-slate-50 border-slate-200 text-slate-900";
  const mutedCls = isDark ? "text-zinc-400" : "text-slate-500";

  return (
    <div className={`min-h-screen transition-colors duration-200 ${bgCls}`}>
      <header
        className={`sticky top-0 z-30 flex h-16 items-center justify-between border-b px-7 backdrop-blur ${
          isDark
            ? "border-white/10 bg-[#09090b]/90"
            : "border-slate-200 bg-white/90"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 text-xs font-extrabold text-zinc-950">
            A
          </div>
          <span className="text-sm font-bold tracking-wider uppercase">
            Autocreate Studio
          </span>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-500">
            Next.js + Laravel + PostgreSQL
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Docker Stack Ready
          </span>
          <button
            type="button"
            onClick={() => setIsDark((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:border-amber-500/50 ${surfaceCls}`}
          >
            {isDark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1580px] grid-cols-1 items-start gap-7 px-7 py-7 lg:grid-cols-[460px_1fr]">
        {/* Left Form Panel */}
        <section className={`rounded-2xl border p-6 ${panelCls}`}>
          <h2 className="mb-5 text-sm font-semibold">Buat Konten Baru</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className={mutedCls}>Topik / Ide Konten</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsBatchMode((v) => !v)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                      isBatchMode
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
                        : surfaceCls
                    }`}
                  >
                    {isBatchMode ? "Mode: Batch Queue" : "Mode: Single"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscoverRss}
                    disabled={loadingRss}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${surfaceCls}`}
                  >
                    {loadingRss ? "Memuat..." : "Ambil Ide RSS"}
                  </button>
                </div>
              </div>
              <textarea
                rows={isBatchMode ? 4 : 3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={
                  isBatchMode
                    ? "Masukkan 1 topik per baris..."
                    : "Contoh: 5 Kebiasaan Kecil yang Mengubah Fokus Kerja (boleh kosong jika Link Referensi diisi)"
                }
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-amber-500 ${surfaceCls}`}
              />
              {rssSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rssSuggestions.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setTopic(item.topic);
                        setPreset(item.preset);
                        if (item.link) {
                          setReferenceUrlsText((prev) =>
                            prev.includes(item.link!)
                              ? prev
                              : [prev.trim(), item.link].filter(Boolean).join("\n")
                          );
                        }
                      }}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] hover:border-amber-500/50 ${surfaceCls}`}
                    >
                      {item.topic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!isBatchMode && (
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className={mutedCls}>Link Referensi / Sumber (Opsional)</span>
                  <button
                    type="button"
                    onClick={handleCheckRefs}
                    disabled={checkingRefs}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${surfaceCls}`}
                  >
                    {checkingRefs ? "Mengecek..." : "Cek Link"}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={referenceUrlsText}
                  onChange={(e) => setReferenceUrlsText(e.target.value)}
                  placeholder="Tempel 1 URL artikel/berita per baris (maks. 4 link)..."
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                />
                {refResults.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {refResults.map((r, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${surfaceCls}`}
                      >
                        <span className="truncate">
                          {r.ok ? `${r.title} (${r.content.length} kar)` : `${r.url} — ${r.error}`}
                        </span>
                        <span
                          className={`shrink-0 font-semibold ${
                            r.ok ? "text-emerald-500" : "text-rose-500"
                          }`}
                        >
                          {r.ok ? `OK (${r.method})` : "Gagal"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`mb-1.5 block text-xs ${mutedCls}`}>Preset Visual</label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                >
                  <option value="noir_editorial">Noir Editorial</option>
                  <option value="midnight_tech">Midnight Tech</option>
                  <option value="monochrome_luxury">Monochrome Luxury</option>
                </select>
              </div>
              <div>
                <label className={`mb-1.5 block text-xs ${mutedCls}`}>Gaya / Seri Konten</label>
                <select
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                >
                  <option value="edukasi">Edukasi &amp; Tips</option>
                  <option value="fakta_cepat">Fakta Cepat &amp; Hook</option>
                  <option value="storytelling">Storytelling</option>
                  <option value="promo_brand">Promo &amp; Brand</option>
                </select>
              </div>
            </div>

            <div>
              <label className={`mb-1.5 block text-xs ${mutedCls}`}>Format Output</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "carousel", label: "Carousel (PNG)" },
                  { id: "video", label: "Video (MP4)" },
                  { id: "poster", label: "Poster (PNG)" },
                  { id: "raw_image", label: "Raw Image" },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs ${surfaceCls}`}
                  >
                    <input
                      type="checkbox"
                      checked={outputs.includes(opt.id)}
                      onChange={() => toggleOutput(opt.id)}
                      className="accent-amber-500"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`mb-1.5 block text-xs ${mutedCls}`}>Bahasa</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                >
                  <option value="id">Indonesia (ID)</option>
                  <option value="en">English (EN)</option>
                </select>
              </div>
              <div>
                <label className={`mb-1.5 block text-xs ${mutedCls}`}>Rasio Gambar</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                >
                  <option value="4:5">4:5 (Portrait Feed)</option>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="9:16">9:16 (Story / Reels)</option>
                  <option value="16:9">16:9 (Landscape YT)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`mb-1.5 block text-xs ${mutedCls}`}>Visual Provider</label>
                <select
                  value={visualProvider}
                  onChange={(e) => setVisualProvider(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                >
                  <option value="procedural">Procedural (Cepat)</option>
                  <option value="pollinations">Pollinations AI</option>
                  <option value="gemini">Gemini Imagen</option>
                </select>
              </div>
              <div>
                <label className={`mb-1.5 block text-xs ${mutedCls}`}>Jumlah Slide</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  value={slides}
                  onChange={(e) => setSlides(Number(e.target.value) || 5)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                />
              </div>
            </div>

            <label className={`flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs ${surfaceCls}`}>
              <span>Mode Mock (Test cepat tanpa token AI)</span>
              <input
                type="checkbox"
                checked={mock}
                onChange={(e) => setMock(e.target.checked)}
                className="accent-amber-500"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting
                ? "Mengirim ke Queue..."
                : isBatchMode
                  ? "Mulai Batch Queue"
                  : "Generate Content"}
            </button>

            {banner && (
              <div
                className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                  banner.type === "ok"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                    : banner.type === "err"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-500"
                }`}
              >
                {banner.text}
              </div>
            )}
          </form>
        </section>

        {/* Right Workspace */}
        <section className="flex flex-col gap-6">
          {/* History Panel */}
          <div className={`rounded-2xl border p-6 ${panelCls}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">
                Riwayat Project PostgreSQL ({jobs.length})
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari topik..."
                  className={`rounded-lg border px-3 py-1.5 text-xs outline-none focus:border-amber-500 ${surfaceCls}`}
                />
                <button
                  type="button"
                  onClick={loadJobs}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${surfaceCls}`}
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
              {filteredJobs.length === 0 ? (
                <div className={`py-4 text-xs ${mutedCls}`}>
                  Belum ada project di database.
                </div>
              ) : (
                filteredJobs.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setSelectedId(j.id)}
                    className={`min-w-[220px] max-w-[240px] shrink-0 rounded-xl border p-3 text-left transition ${
                      selectedId === j.id
                        ? "border-amber-500 bg-amber-500/10"
                        : surfaceCls
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono opacity-60">#{j.id}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          j.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : j.status === "failed"
                              ? "bg-rose-500/15 text-rose-500"
                              : "bg-amber-500/15 text-amber-500"
                        }`}
                      >
                        {j.status}
                      </span>
                    </div>
                    <div className="truncate text-xs font-semibold">{j.topic}</div>
                    <div className={`mt-1 text-[11px] ${mutedCls}`}>
                      {j.aspect_ratio} • {j.preset.replace(/_/g, " ")}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Preview Panel */}
          <div className={`rounded-2xl border p-6 ${panelCls}`}>
            {!selectedJob ? (
              <div className={`py-10 text-center text-sm ${mutedCls}`}>
                Pilih project dari daftar di atas untuk melihat preview.
              </div>
            ) : (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{selectedJob.topic}</h3>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${surfaceCls}`}>
                      {selectedJob.aspect_ratio}
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${surfaceCls}`}>
                      {selectedJob.preset.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedJob.folder_name && (
                      <a
                        href={`/renderer-api/outputs/${encodeURIComponent(selectedJob.folder_name)}/zip`}
                        download
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium hover:border-amber-500/50 ${surfaceCls}`}
                      >
                        Download ZIP
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedJob.id)}
                      className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10"
                    >
                      Hapus
                    </button>
                  </div>
                </div>

                {selectedJob.status === "failed" && (
                  <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-500">
                    Render gagal: {selectedJob.error_message || "Unknown error"}
                  </div>
                )}

                {(selectedJob.status === "queued" || selectedJob.status === "processing") && (
                  <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-500">
                    Sedang diproses oleh Laravel Queue &amp; Remotion Renderer... Preview akan muncul otomatis.
                  </div>
                )}

                {selectedJob.folder_name && (
                  <>
                    <div className="mb-4 flex gap-2 border-b border-white/10 pb-2 text-xs">
                      {(["all", "carousel", "video", "poster"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setActiveTab(t)}
                          className={`rounded-lg px-3 py-1.5 font-medium capitalize ${
                            activeTab === t
                              ? "bg-amber-500 text-zinc-950"
                              : surfaceCls
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    {(activeTab === "all" || activeTab === "carousel") &&
                      selectedJob.manifest?.slides &&
                      selectedJob.manifest.slides.length > 0 && (
                        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                          {selectedJob.manifest.slides.map((s, idx) => (
                            <img
                              key={idx}
                              src={`/outputs/${encodeURIComponent(selectedJob.folder_name!)}/carousel/slide_${idx + 1}.png`}
                              alt={`Slide ${idx + 1}`}
                              className="w-full rounded-xl border border-white/10 object-cover"
                            />
                          ))}
                        </div>
                      )}

                    {(activeTab === "all" || activeTab === "video") &&
                      selectedJob.manifest?.video && (
                        <div className="mb-6">
                          <video
                            controls
                            className="max-h-[460px] rounded-xl border border-white/10 bg-black"
                            src={`/outputs/${encodeURIComponent(selectedJob.folder_name)}/video.mp4`}
                          />
                        </div>
                      )}

                    {(activeTab === "all" || activeTab === "poster") &&
                      selectedJob.manifest?.poster && (
                        <div className="mb-4">
                          <img
                            src={`/outputs/${encodeURIComponent(selectedJob.folder_name)}/poster.png`}
                            alt="Poster"
                            className="max-h-[420px] rounded-xl border border-white/10 object-contain"
                          />
                        </div>
                      )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <FaqChatbot isDark={isDark} />
    </div>
  );
}
