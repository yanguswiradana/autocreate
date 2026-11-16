"use client";

import { useState } from "react";
import { ContentJobRecord, readImageFileAsDataUrl } from "@/types/studio";

interface ArtifactPreviewPanelProps {
  job: ContentJobRecord | null;
  onClose: () => void;
  onRerender: (
    id: number,
    customSceneImages?: Record<number, string>,
    outputs?: string[]
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onRemix: (job: ContentJobRecord) => void;
}

export function ArtifactPreviewPanel({
  job,
  onClose,
  onRerender,
  onDelete,
  onRemix,
}: ArtifactPreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"all" | "carousel" | "video" | "poster">("all");
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<"rerender" | "delete" | null>(null);
  const [stagedImages, setStagedImages] = useState<Record<number, string>>({});
  const [renderBust, setRenderBust] = useState<number>(0);

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

  const handleRerenderClick = async () => {
    setBusyAction("rerender");
    try {
      const hasCustom = Object.keys(stagedImages).length > 0;
      await onRerender(
        job.id,
        hasCustom ? stagedImages : undefined,
        job.outputs?.length ? job.outputs : ["carousel"]
      );
      if (hasCustom) {
        setStagedImages({});
      }
      setRenderBust(Date.now());
    } finally {
      setBusyAction(null);
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

  const handleDeleteClick = async () => {
    setBusyAction("delete");
    try {
      await onDelete(job.id);
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
            onClick={handleRerenderClick}
            className="rounded-lg border border-white/10 bg-[#131316] px-3 py-1.5 text-xs font-medium text-[#a1a1aa] hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {busyAction === "rerender" ? "Merender..." : "Re-render"}
          </button>
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
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            Render gagal: {job.error_message || "Unknown error"}
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
                        onClick={handleRerenderClick}
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
                  src={`/outputs/${encodeURIComponent(folderName)}/${videoFile}`}
                />
              </div>
            )}

            {(activeTab === "all" || activeTab === "poster") && posterFile && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                  Poster PNG
                </p>
                <img
                  src={`/outputs/${encodeURIComponent(folderName)}/${posterFile}`}
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
    </aside>
  );
}
