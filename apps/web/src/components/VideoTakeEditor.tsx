"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface VideoEditRecord {
  id: number;
  title: string;
  status: "queued" | "processing" | "completed" | "failed";
  options?: {
    aspectRatio?: string;
    bgMask?: string;
    removeSilence?: boolean;
    autoSubtitle?: boolean;
    hookText?: string | null;
  };
  transcript?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

const MASK_OPTIONS = [
  { id: "none", label: "Tanpa Masking" },
  { id: "blur", label: "Blur Background (AI)" },
  { id: "solid_dark", label: "Studio Gelap (AI)" },
  { id: "green_screen", label: "Green Screen" },
] as const;

const VIDEO_RATIOS = [
  { id: "9:16", label: "9:16 (Reels/TikTok)" },
  { id: "4:5", label: "4:5 (Feed)" },
  { id: "1:1", label: "1:1 (Square)" },
  { id: "16:9", label: "16:9 (Landscape)" },
  { id: "original", label: "Asli" },
] as const;

export function VideoTakeEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [trimStart, setTrimStart] = useState("");
  const [trimEnd, setTrimEnd] = useState("");
  const [removeSilence, setRemoveSilence] = useState(true);
  const [bgMask, setBgMask] = useState<string>("none");
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [autoSubtitle, setAutoSubtitle] = useState(true);
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [hookText, setHookText] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [subtitleSegments, setSubtitleSegments] = useState<
    Array<{ start: number; end: number; text: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<VideoEditRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadEdits = useCallback(async () => {
    try {
      const res = await fetch("/api/video-edits", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list: VideoEditRecord[] = data.edits || [];
      setEdits(list);
      setSelectedId((prev) =>
        prev && list.some((e) => e.id === prev) ? prev : (list[0]?.id ?? null)
      );
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    loadEdits();
  }, [loadEdits]);

  const hasActive = useMemo(
    () => edits.some((e) => e.status === "queued" || e.status === "processing"),
    [edits]
  );

  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(loadEdits, 3000);
    return () => clearInterval(t);
  }, [hasActive, loadEdits]);

  const selectedEdit = useMemo(
    () => edits.find((e) => e.id === selectedId) ?? null,
    [edits, selectedId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Pilih file video take (MP4/MOV/WEBM) terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("video", file);
      if (title.trim()) form.append("title", title.trim());
      if (trimStart.trim()) form.append("trimStart", trimStart.trim());
      if (trimEnd.trim()) form.append("trimEnd", trimEnd.trim());
      form.append("removeSilence", String(removeSilence));
      form.append("bgMask", bgMask);
      form.append("aspectRatio", aspectRatio);
      form.append("autoSubtitle", String(autoSubtitle));
      form.append("language", language);
      if (autoSubtitle && subtitleSegments.length > 0) {
        form.append("subtitleSegments", JSON.stringify(subtitleSegments));
      }
      if (hookText.trim()) form.append("hookText", hookText.trim());

      const res = await fetch("/api/video-edits", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Gagal mengunggah video");

      setFile(null);
      setTitle("");
      setHookText("");
      setSubtitleSegments([]);
      if (data.edit?.id) setSelectedId(data.edit.id);
      await loadEdits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtractSubtitles = async () => {
    if (!file) {
      setError("Pilih file video take terlebih dahulu untuk ekstrak subtitle.");
      return;
    }
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("video", file);
      form.append("language", language);
      const res = await fetch("/api/video-edits/transcribe", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Gagal ekstrak subtitle");
      const segs = Array.isArray(data.segments) ? data.segments : [];
      setSubtitleSegments(segs);
      setAutoSubtitle(true);
      if (segs.length === 0) {
        setError("Tidak ada suara/kalimat terdeteksi di video ini.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal ekstrak subtitle");
    } finally {
      setTranscribing(false);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/video-edits/${id}`, { method: "DELETE" });
    await loadEdits();
  };

  return (
    <section className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-[960px] space-y-6">
        <div>
          <span className="rounded-full border border-[#ddf77b]/40 bg-[#ddf77b]/10 px-2.5 py-0.5 font-mono text-[11px] text-[#ddf77b]">
            Self-Hosted · Rp0 (FFmpeg + MediaPipe + Faster-Whisper)
          </span>
          <h2 className="mt-2 text-lg font-bold text-[#f4f4f5]">
            Edit Video Take Otomatis
          </h2>
          <p className="text-xs text-[#a1a1aa]">
            Upload video rekaman kamu untuk auto-potong jeda diam, AI background masking, reframe rasio, teks hook, dan auto-subtitle lokal.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-[16px] border border-white/10 bg-[#131316] p-5 space-y-5"
        >
          {/* 1. Upload */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                1. Upload Video Take (Maks 200MB)
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#1a1a1f] p-4 text-center transition hover:border-[#ddf77b]/60">
                <span className="text-xs font-semibold text-[#f4f4f5]">
                  {file ? file.name : "Klik untuk pilih file MP4 / MOV / WEBM"}
                </span>
                <span className="mt-1 text-[11px] text-[#63636b]">
                  {file
                    ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : "Diproses lokal di container video-ai"}
                </span>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Judul / Hook Atas (Opsional)
                </p>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nama project (mis. Take Promo Kopi)"
                  className="mb-2 w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                />
                <input
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  placeholder="Teks hook yang ditempel di atas video..."
                  className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                />
              </div>
            </div>
          </div>

          {/* 2. Cut & Trim */}
          <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                2. Pemotongan (Cut)
              </p>
              <button
                type="button"
                onClick={() => setRemoveSilence((v) => !v)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                  removeSilence
                    ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                    : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                }`}
              >
                Auto-Potong Jeda Diam: {removeSilence ? "ON" : "OFF"}
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={trimStart}
                  onChange={(e) => setTrimStart(e.target.value)}
                  placeholder="Mulai (dtk)"
                  className="rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(e.target.value)}
                  placeholder="Akhir (dtk)"
                  className="rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none"
                />
              </div>
            </div>

            {/* 3. AI Masking */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                3. AI Masking Background
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MASK_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setBgMask(m.id)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      bgMask === m.id
                        ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                        : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Ratio & Subtitle */}
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  4. Rasio &amp; Auto-Subtitle
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {VIDEO_RATIOS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setAspectRatio(r.id)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-medium ${
                        aspectRatio === r.id
                          ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                          : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAutoSubtitle((v) => !v)}
                  className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                    autoSubtitle
                      ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                      : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                  }`}
                >
                  Auto-Subtitle: {autoSubtitle ? "ON" : "OFF"}
                </button>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "id" | "en")}
                  className="rounded-lg border border-white/10 bg-[#1a1a1f] px-2 py-1.5 text-xs text-[#f4f4f5]"
                >
                  <option value="id">ID</option>
                  <option value="en">EN</option>
                </select>
              </div>

              <button
                type="button"
                disabled={transcribing || !file}
                onClick={handleExtractSubtitles}
                className="w-full rounded-lg border border-white/15 bg-[#1a1a1f] px-3 py-1.5 text-[11px] font-semibold text-[#e4e4e7] hover:border-[#ddf77b]/60 hover:text-[#ddf77b] disabled:opacity-40"
              >
                {transcribing
                  ? "Mengekstrak Transkrip Whisper..."
                  : "Ekstrak & Edit Subtitle Sebelum Render"}
              </button>
            </div>
          </div>

          {subtitleSegments.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#ddf77b]/30 bg-[#1a1a1f] p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#ddf77b]">
                  Edit Draft Subtitle ({subtitleSegments.length} segmen) — akan dibakar ke MP4 saat proses
                </p>
                <button
                  type="button"
                  onClick={() => setSubtitleSegments([])}
                  className="text-[11px] text-[#a1a1aa] hover:text-white"
                >
                  Hapus Draft
                </button>
              </div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {subtitleSegments.map((seg, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 font-mono text-[10px] text-[#a1a1aa]">
                      {seg.start.toFixed(1)}s–{seg.end.toFixed(1)}s
                    </span>
                    <input
                      type="text"
                      value={seg.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSubtitleSegments((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, text: val } : item))
                        );
                      }}
                      className="flex-1 rounded-lg border border-white/10 bg-[#131316] px-2.5 py-1 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <span className="text-[11px] text-[#63636b]">
              Diproses di background via Laravel Queue &amp; container video-ai.
            </span>
            <button
              type="submit"
              disabled={submitting || !file}
              className="rounded-lg bg-[#ddf77b] px-4 py-2 text-xs font-bold text-[#181824] hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? "Mengunggah..." : "Proses Video Take"}
            </button>
          </div>
        </form>

        {/* Hasil & Riwayat Edit Video */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          <div className="rounded-[16px] border border-white/10 bg-[#131316] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                Riwayat Edit ({edits.length})
              </span>
              <button
                type="button"
                onClick={loadEdits}
                className="text-[11px] text-[#a1a1aa] hover:text-white"
              >
                Refresh
              </button>
            </div>
            {edits.length === 0 ? (
              <p className="py-4 text-xs text-[#63636b]">Belum ada video take yang diproses.</p>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                {edits.map((ed) => (
                  <button
                    key={ed.id}
                    type="button"
                    onClick={() => setSelectedId(ed.id)}
                    className={`w-full rounded-xl border p-2.5 text-left text-xs transition ${
                      selectedId === ed.id
                        ? "border-[#ddf77b] bg-[#ddf77b]/10"
                        : "border-white/5 bg-[#1a1a1f] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10.5px] text-[#a1a1aa]">#{ed.id}</span>
                      <span
                        className={`text-[10.5px] font-semibold ${
                          ed.status === "completed"
                            ? "text-[#ddf77b]"
                            : ed.status === "failed"
                              ? "text-rose-400"
                              : "text-amber-300"
                        }`}
                      >
                        {ed.status}
                      </span>
                    </div>
                    <b className="mt-1 block truncate text-[#f4f4f5]">{ed.title}</b>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[16px] border border-white/10 bg-[#131316] p-5">
            {!selectedEdit ? (
              <div className="py-12 text-center text-xs text-[#63636b]">
                Pilih salah satu hasil edit video di kiri untuk melihat preview.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#f4f4f5]">{selectedEdit.title}</h3>
                    <p className="font-mono text-[11px] text-[#a1a1aa]">
                      #{selectedEdit.id} · {selectedEdit.options?.aspectRatio || "9:16"} · Mask: {selectedEdit.options?.bgMask || "none"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selectedEdit.status === "completed" && (
                      <a
                        href={`/api/video-edits/${selectedEdit.id}/download`}
                        download={`${selectedEdit.title}.mp4`}
                        className="rounded-lg bg-[#ddf77b] px-3 py-1.5 text-xs font-bold text-[#181824]"
                      >
                        Download MP4
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedEdit.id)}
                      className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10"
                    >
                      Hapus
                    </button>
                  </div>
                </div>

                {selectedEdit.status === "failed" && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    Gagal memproses video: {selectedEdit.error_message || "Unknown error"}
                  </div>
                )}

                {(selectedEdit.status === "queued" || selectedEdit.status === "processing") && (
                  <div className="rounded-xl border border-[#ddf77b]/30 bg-[#ddf77b]/10 p-4 text-xs text-[#ddf77b]">
                    Sedang memproses video (Cut / Masking / Subtitle Whisper)... Preview akan muncul otomatis.
                  </div>
                )}

                {selectedEdit.status === "completed" && (
                  <>
                    <video
                      controls
                      className="max-h-[420px] w-full rounded-xl border border-white/10 bg-black"
                      src={`/api/video-edits/${selectedEdit.id}/download`}
                    />
                    {selectedEdit.transcript && (
                      <div className="rounded-xl border border-white/10 bg-[#1a1a1f] p-3">
                        <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#63636b]">
                          Transkrip Whisper
                        </span>
                        <p className="mt-1 text-xs leading-relaxed text-[#d4d4d8]">
                          {selectedEdit.transcript}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
