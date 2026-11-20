"use client";

import { useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import {
  BGM_OPTIONS,
  ContentJobRecord,
  PRESET_OPTIONS,
  SERIES_OPTIONS,
  VOICE_OPTIONS,
  formatFriendlyError,
  readImageFileAsDataUrl,
} from "@/types/studio";

interface EditableScene {
  index: number;
  role: string;
  slideTitle: string;
  slideBody: string;
  narrationText?: string;
  visualPrompt?: string;
  durationSeconds?: number;
  layout?: string;
}

interface EditableBlueprint {
  topic: string;
  hookTitle: string;
  subtitle: string;
  brandTag?: string;
  preset: string;
  language?: string;
  aspectRatio?: string;
  series?: string;
  videoTransition?: string;
  scenes: EditableScene[];
  caption: string;
  hashtags: string[];
  [key: string]: unknown;
}

interface ArtifactPreviewPanelProps {
  job: ContentJobRecord | null;
  onClose: () => void;
  onRerender: (
    id: number,
    customSceneImages?: Record<number, string>,
    outputs?: string[],
    blueprint?: EditableBlueprint,
    audioOpts?: { voice?: string; bgm?: string; bgmVolume?: number }
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onRemix: (job: ContentJobRecord) => void;
  onRetry?: (id: number) => Promise<void>;
}

export function ArtifactPreviewPanel({
  job,
  onClose,
  onRerender,
  onDelete,
  onRemix,
  onRetry,
}: ArtifactPreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"all" | "carousel" | "video" | "poster">("all");
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<"rerender" | "delete" | "retry" | null>(null);
  const [stagedImages, setStagedImages] = useState<Record<number, string>>({});
  const [renderBust, setRenderBust] = useState<number>(0);
  const [editOpen, setEditOpen] = useState(false);
  const [loadingBp, setLoadingBp] = useState(false);
  const [bpDraft, setBpDraft] = useState<EditableBlueprint | null>(null);
  const [bpError, setBpError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rerenderVoice, setRerenderVoice] = useState<string>("id-ID-ArdiNeural");
  const [rerenderBgm, setRerenderBgm] = useState<string>("ambient_dark");
  const [rerenderBgmVol, setRerenderBgmVol] = useState<number>(0.14);
  const [publishOpen, setPublishOpen] = useState(false);
  const [pubPlatform, setPubPlatform] = useState<"instagram" | "youtube" | "tiktok">("instagram");
  const [pubSchedule, setPubSchedule] = useState("");
  const [pubBusy, setPubBusy] = useState(false);
  const [pubFeedback, setPubFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pubLogs, setPubLogs] = useState<
    Array<{ id: number; platform: string; status: string; remote_url?: string | null; error_message?: string | null; scheduled_at?: string | null }>
  >([]);

  if (!job) return null;

  const folderName = job.folder_name || job.manifest?.jobId || null;
  const slides =
    job.manifest?.slides || job.manifest?.outputs?.carouselSlides || [];
  const videoFile = job.manifest?.video || job.manifest?.outputs?.video || null;
  const posterFile = job.manifest?.poster || job.manifest?.outputs?.poster || null;

  const captionFull = [
    job.manifest?.caption || "",
    job.manifest?.hashtags?.length ? `\n\n${job.manifest.hashtags.join(" ")}` : "",
  ]
    .join("")
    .trim();

  const handleCopyCaption = async () => {
    if (!captionFull) return;
    try {
      await navigator.clipboard.writeText(captionFull);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRerenderClick = async (overrideBp?: EditableBlueprint) => {
    setBusyAction("rerender");
    setBpError(null);
    try {
      const hasCustom = Object.keys(stagedImages).length > 0;
      await onRerender(
        job.id,
        hasCustom ? stagedImages : undefined,
        job.outputs?.length ? job.outputs : ["carousel"],
        overrideBp || (editOpen && bpDraft ? bpDraft : undefined),
        job.outputs?.includes("video")
          ? { voice: rerenderVoice, bgm: rerenderBgm, bgmVolume: rerenderBgmVol }
          : undefined
      );
      if (hasCustom) {
        setStagedImages({});
      }
      if (overrideBp) {
        setEditOpen(false);
      }
      setRenderBust(Date.now());
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleEditText = async () => {
    if (editOpen) {
      setEditOpen(false);
      return;
    }
    if (!folderName) return;
    setEditOpen(true);
    setLoadingBp(true);
    setBpError(null);
    try {
      const res = await fetch(`/outputs/${encodeURIComponent(folderName)}/blueprint.json?t=${Date.now()}`);
      if (!res.ok) throw new Error("blueprint.json tidak ditemukan");
      const data = (await res.json()) as EditableBlueprint;
      setBpDraft(data);
    } catch (e) {
      setBpError(e instanceof Error ? e.message : "Gagal memuat teks slide.");
    } finally {
      setLoadingBp(false);
    }
  };

  const handleRetryClick = async () => {
    if (!onRetry) return;
    setBusyAction("retry");
    try {
      await onRetry(job.id);
    } finally {
      setBusyAction(null);
    }
  };

  const handleTogglePublish = async () => {
    const next = !publishOpen;
    setPublishOpen(next);
    setPubFeedback(null);
    if (next) {
      try {
        const res = await fetch(`/api/jobs/${job.id}/publishes`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setPubLogs(data.logs || []);
        }
      } catch {
        // ignore
      }
    }
  };

  const handlePublishSubmit = async () => {
    setPubBusy(true);
    setPubFeedback(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: pubPlatform,
          scheduledAt: pubSchedule ? new Date(pubSchedule).toISOString() : undefined,
          caption: captionFull || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Gagal publish ke sosmed.");
      }
      setPubFeedback({
        ok: true,
        text:
          data.log?.status === "scheduled"
            ? `Berhasil dijadwalkan ke ${pubPlatform}!`
            : `Berhasil dipublish ke ${pubPlatform}!`,
      });
      const logsRes = await fetch(`/api/jobs/${job.id}/publishes`, { cache: "no-store" });
      if (logsRes.ok) {
        const lData = await logsRes.json();
        setPubLogs(lData.logs || []);
      }
    } catch (e) {
      setPubFeedback({
        ok: false,
        text: e instanceof Error ? e.message : "Gagal publish.",
      });
    } finally {
      setPubBusy(false);
    }
  };

  const handleSlidePhotoUpload = async (
    slideNumber: number,
    file: File | undefined
  ) => {
    if (!file) return;
    const dataUrl = await readImageFileAsDataUrl(file);
    setStagedImages((prev) => ({ ...prev, [slideNumber]: dataUrl }));
  };

  const handleDeleteClick = () => {
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    setBusyAction("delete");
    try {
      await onDelete(job.id);
      setConfirmDeleteOpen(false);
      onClose();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l border-white/10 bg-[#0e0e10] text-[#f4f4f5] shadow-2xl lg:static lg:z-auto lg:w-[440px] lg:shrink-0">
      <div className="flex h-14 items-center justify-between gap-3 border-b border-white/5 px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[#a1a1aa]">#{job.id}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                job.status === "completed"
                  ? "bg-[#ddf77b]/15 text-[#ddf77b]"
                  : job.status === "failed"
                    ? "bg-rose-500/15 text-rose-400"
                    : "bg-amber-400/15 text-amber-300"
              }`}
            >
              {job.status}
            </span>
          </div>
          <h3 className="truncate text-sm font-semibold">{job.topic}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup preview"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#a1a1aa] hover:bg-white/5 hover:text-white"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5 text-[11px] text-[#a1a1aa]">
          <span className="rounded-full border border-white/10 bg-[#131316] px-2.5 py-0.5">
            {job.aspect_ratio}
          </span>
          <span className="rounded-full border border-white/10 bg-[#131316] px-2.5 py-0.5">
            {job.preset.replace(/_/g, " ")}
          </span>
          {job.outputs.map((out) => (
            <span
              key={out}
              className="rounded-full border border-white/10 bg-[#131316] px-2.5 py-0.5 uppercase"
            >
              {out}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {folderName && (
            <a
              href={`/renderer-api/outputs/${encodeURIComponent(folderName)}/zip`}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ddf77b] px-3 py-1.5 text-xs font-semibold text-[#181824] hover:opacity-90"
            >
              Download ZIP
            </a>
          )}
          <button
            type="button"
            onClick={() => onRemix(job)}
            className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs font-medium text-[#f4f4f5] hover:border-white/25"
          >
            Remix Konten Ini
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleRerenderClick()}
            className="rounded-lg border border-white/10 bg-[#131316] px-3 py-1.5 text-xs font-medium text-[#a1a1aa] hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {busyAction === "rerender" ? "Merender..." : "Re-render"}
          </button>
          {folderName && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleToggleEditText}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                editOpen
                  ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                  : "border-white/10 bg-[#131316] text-[#a1a1aa] hover:border-white/25 hover:text-white"
              }`}
            >
              {editOpen ? "Tutup Edit" : "Edit Teks"}
            </button>
          )}
          {job.status === "completed" && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={handleTogglePublish}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                publishOpen
                  ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                  : "border-white/10 bg-[#131316] text-[#d4d4d8] hover:border-[#ddf77b]/50 hover:text-[#ddf77b]"
              }`}
            >
              {publishOpen ? "Tutup Publish" : "Publish Sosmed"}
            </button>
          )}
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleDeleteClick}
            className="ml-auto rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
          >
            {busyAction === "delete" ? "Menghapus..." : "Hapus"}
          </button>
        </div>

        {job.status === "failed" && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <span className="min-w-0 break-words">
              {formatFriendlyError(job.error_message)}
            </span>
            {onRetry && (
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleRetryClick}
                className="shrink-0 rounded-lg bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
              >
                {busyAction === "retry" ? "Mengulang..." : "Coba Lagi"}
              </button>
            )}
          </div>
        )}

        {publishOpen && (
          <div className="space-y-3 rounded-xl border border-[#ddf77b]/30 bg-[#131316] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#ddf77b]">
                Publish / Jadwalkan ke Sosmed
              </span>
              <button
                type="button"
                disabled={pubBusy}
                onClick={handlePublishSubmit}
                className="rounded-lg bg-[#ddf77b] px-3 py-1 text-[11px] font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
              >
                {pubBusy
                  ? "Mengirim..."
                  : pubSchedule
                    ? "Jadwalkan Upload"
                    : "Publish Sekarang"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={pubPlatform}
                onChange={(e) =>
                  setPubPlatform(e.target.value as "instagram" | "youtube" | "tiktok")
                }
                className="rounded-lg border border-white/10 bg-[#0e0e10] px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none"
              >
                <option value="instagram">Instagram Business</option>
                <option value="youtube">YouTube Shorts</option>
                <option value="tiktok">TikTok</option>
              </select>
              <input
                type="datetime-local"
                value={pubSchedule}
                onChange={(e) => setPubSchedule(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0e0e10] px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none"
              />
            </div>
            {pubFeedback && (
              <p className={`text-xs ${pubFeedback.ok ? "text-[#ddf77b]" : "text-rose-400"}`}>
                {pubFeedback.text}
              </p>
            )}
            {pubLogs.length > 0 && (
              <div className="space-y-1.5 border-t border-white/10 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                  Riwayat Publish
                </p>
                {pubLogs.slice(0, 4).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-[#0e0e10] px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="capitalize text-[#f4f4f5]">{l.platform}</span>
                    <span
                      className={`font-mono ${
                        l.status === "published"
                          ? "text-[#ddf77b]"
                          : l.status === "scheduled"
                            ? "text-amber-300"
                            : "text-rose-400"
                      }`}
                    >
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {editOpen && (
          <div className="space-y-3 rounded-xl border border-[#ddf77b]/30 bg-[#131316] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#ddf77b]">
                Edit Teks Slide &amp; Caption
              </span>
              {bpDraft && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleRerenderClick(bpDraft)}
                  className="rounded-lg bg-[#ddf77b] px-3 py-1 text-[11px] font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
                >
                  {busyAction === "rerender" ? "Merender..." : "Simpan & Re-render"}
                </button>
              )}
            </div>
            {loadingBp && (
              <p className="text-xs text-[#a1a1aa]">Memuat teks slide...</p>
            )}
            {bpError && (
              <p className="text-xs text-rose-400">{bpError}</p>
            )}
            {bpDraft && (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                      Preset Warna
                    </label>
                    <select
                      value={bpDraft.preset}
                      onChange={(e) =>
                        setBpDraft((prev) => (prev ? { ...prev, preset: e.target.value } : prev))
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#0e0e10] px-2 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                    >
                      {PRESET_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                      Gaya Layout
                    </label>
                    <select
                      value={bpDraft.series || "edukasi"}
                      onChange={(e) =>
                        setBpDraft((prev) => (prev ? { ...prev, series: e.target.value } : prev))
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#0e0e10] px-2 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                    >
                      {SERIES_OPTIONS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {job.outputs?.includes("video") && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                        Voice TTS
                      </label>
                      <select
                        value={rerenderVoice}
                        onChange={(e) => setRerenderVoice(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0e0e10] px-2 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                      >
                        {VOICE_OPTIONS.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                        Musik Latar (BGM)
                      </label>
                      <select
                        value={rerenderBgm}
                        onChange={(e) => setRerenderBgm(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0e0e10] px-2 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                      >
                        {BGM_OPTIONS.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Judul Utama / Poster Hook
                  </label>
                  <input
                    type="text"
                    value={bpDraft.hookTitle}
                    onChange={(e) =>
                      setBpDraft((prev) => (prev ? { ...prev, hookTitle: e.target.value } : prev))
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#0e0e10] px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Subjudul
                  </label>
                  <input
                    type="text"
                    value={bpDraft.subtitle}
                    onChange={(e) =>
                      setBpDraft((prev) => (prev ? { ...prev, subtitle: e.target.value } : prev))
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#0e0e10] px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                  />
                </div>
                {bpDraft.scenes.map((sc, idx) => (
                  <div key={sc.index} className="space-y-1.5 rounded-lg border border-white/10 bg-[#0e0e10] p-2.5">
                    <span className="font-mono text-[10px] uppercase text-[#ddf77b]">
                      Slide {sc.index} ({sc.role})
                    </span>
                    <input
                      type="text"
                      value={sc.slideTitle}
                      onChange={(e) =>
                        setBpDraft((prev) => {
                          if (!prev) return prev;
                          const nextScenes = prev.scenes.map((s, i) =>
                            i === idx ? { ...s, slideTitle: e.target.value } : s
                          );
                          return { ...prev, scenes: nextScenes };
                        })
                      }
                      className="w-full rounded border border-white/10 bg-[#131316] px-2 py-1 text-xs font-semibold text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                    />
                    <textarea
                      rows={2}
                      value={sc.slideBody}
                      onChange={(e) =>
                        setBpDraft((prev) => {
                          if (!prev) return prev;
                          const nextScenes = prev.scenes.map((s, i) =>
                            i === idx ? { ...s, slideBody: e.target.value } : s
                          );
                          return { ...prev, scenes: nextScenes };
                        })
                      }
                      className="w-full resize-none rounded border border-white/10 bg-[#131316] px-2 py-1 text-xs text-[#d4d4d8] outline-none focus:border-[#ddf77b]/60"
                    />
                  </div>
                ))}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Caption
                  </label>
                  <textarea
                    rows={3}
                    value={bpDraft.caption}
                    onChange={(e) =>
                      setBpDraft((prev) => (prev ? { ...prev, caption: e.target.value } : prev))
                    }
                    className="w-full resize-none rounded-lg border border-white/10 bg-[#0e0e10] px-2.5 py-1.5 text-xs text-[#d4d4d8] outline-none focus:border-[#ddf77b]/60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Hashtags (pisahkan spasi atau koma)
                  </label>
                  <input
                    type="text"
                    value={(bpDraft.hashtags || []).join(" ")}
                    onChange={(e) => {
                      const tags = e.target.value
                        .split(/[\s,]+/)
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .map((t) => (t.startsWith("#") ? t : `#${t}`));
                      setBpDraft((prev) => (prev ? { ...prev, hashtags: tags } : prev));
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#0e0e10] px-2.5 py-1.5 text-xs text-[#d4d4d8] outline-none focus:border-[#ddf77b]/60"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {(job.status === "queued" || job.status === "processing") && (
          <div className="rounded-xl border border-[#ddf77b]/30 bg-[#ddf77b]/10 p-3 text-xs text-[#ddf77b]">
            Sedang diproses oleh Laravel Queue &amp; Remotion Renderer... Preview akan muncul otomatis.
          </div>
        )}

        {folderName && (
          <>
            <div className="flex gap-1.5 border-b border-white/10 pb-2 text-xs">
              {(["all", "carousel", "video", "poster"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-2.5 py-1 font-medium capitalize transition ${
                    activeTab === tab
                      ? "bg-[#ddf77b] text-[#181824]"
                      : "bg-[#1a1a1f] text-[#a1a1aa] hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {(activeTab === "all" || activeTab === "carousel") &&
              slides.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                      Slide Carousel ({slides.length})
                    </p>
                    {Object.keys(stagedImages).length > 0 && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => handleRerenderClick()}
                        className="rounded-lg bg-[#ddf77b] px-2.5 py-1 text-[11px] font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
                      >
                        {busyAction === "rerender"
                          ? "Merender..."
                          : `Terapkan ${Object.keys(stagedImages).length} Foto & Re-render`}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {slides.map((_, idx) => {
                      const slideNum = idx + 1;
                      const staged = stagedImages[slideNum];
                      const imgSrc = staged
                        ? staged
                        : `/outputs/${encodeURIComponent(folderName)}/carousel/slide_${slideNum}.png${
                            renderBust ? `?t=${renderBust}` : ""
                          }`;
                      return (
                        <div
                          key={idx}
                          className="group relative overflow-hidden rounded-xl border border-white/10 bg-[#131316]"
                        >
                          <img
                            src={imgSrc}
                            alt={`Slide ${slideNum}`}
                            className="w-full object-cover"
                          />
                          <div className="flex items-center justify-between gap-1 border-t border-white/10 bg-[#0e0e10]/90 px-2 py-1.5 text-[10.5px]">
                            <span className="font-mono text-[#a1a1aa]">
                              Slide {slideNum}
                              {staged ? " · Baru" : ""}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {staged && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStagedImages((prev) => {
                                      const next = { ...prev };
                                      delete next[slideNum];
                                      return next;
                                    })
                                  }
                                  className="text-rose-400 hover:text-rose-300"
                                >
                                  Batal
                                </button>
                              )}
                              <label className="cursor-pointer rounded border border-white/15 bg-[#1a1a1f] px-1.5 py-0.5 text-[#f4f4f5] hover:border-[#ddf77b]/60 hover:text-[#ddf77b]">
                                Ganti Foto
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={(e) => {
                                    handleSlidePhotoUpload(
                                      slideNum,
                                      e.target.files?.[0]
                                    );
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {(activeTab === "all" || activeTab === "video") && videoFile && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                  Video MP4
                </p>
                <video
                  controls
                  className="max-h-[400px] w-full rounded-xl border border-white/10 bg-black"
                  src={`/outputs/${encodeURIComponent(folderName)}/${videoFile}${renderBust ? `?t=${renderBust}` : ""}`}
                />
              </div>
            )}

            {(activeTab === "all" || activeTab === "poster") && posterFile && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                  Poster PNG
                </p>
                <img
                  src={`/outputs/${encodeURIComponent(folderName)}/${posterFile}${renderBust ? `?t=${renderBust}` : ""}`}
                  alt="Poster"
                  className="max-h-[380px] w-full rounded-xl border border-white/10 bg-[#131316] object-contain"
                />
              </div>
            )}
          </>
        )}

        {captionFull && (
          <div className="rounded-xl border border-white/10 bg-[#131316] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                Caption &amp; Hashtag
              </span>
              <button
                type="button"
                onClick={handleCopyCaption}
                className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-[#a1a1aa] hover:border-white/25 hover:text-white"
              >
                {copied ? "Tersalin!" : "Salin"}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#d4d4d8]">
              {captionFull}
            </p>
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirmDeleteOpen}
        title={`Hapus Project #${job.id}?`}
        description={`Project "${job.topic}" beserta seluruh file hasil rendernya (carousel, poster, video) akan dihapus permanen.`}
        confirmLabel="Ya, Hapus"
        busy={busyAction === "delete"}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </aside>
  );
}
