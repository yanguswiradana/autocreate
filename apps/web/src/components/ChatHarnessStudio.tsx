"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASPECT_RATIOS,
  ChatMessage,
  ContentJobRecord,
  DEFAULT_DRAFT_CONFIG,
  DraftConfig,
  GuidedStep,
  LANGUAGES,
  NavView,
  OUTPUT_OPTIONS,
  PRESET_OPTIONS,
  RefCheckResult,
  RssTopic,
  SERIES_OPTIONS,
  SLIDE_COUNTS,
  StarterMode,
  VISUAL_PROVIDERS,
  readImageFileAsDataUrl,
} from "@/types/studio";
import { ArtifactPreviewPanel } from "./ArtifactPreviewPanel";
import { FaqChatbot } from "./FaqChatbot";
import { SettingsView } from "./SettingsView";
import { VideoTakeEditor } from "./VideoTakeEditor";

function uid(prefix = "msg") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s]+/gi) || [];
  return Array.from(new Set(matches.map((u) => u.replace(/[),.;]+$/, ""))));
}

export function ChatHarnessStudio() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navView, setNavView] = useState<NavView>("chat");
  const [step, setStep] = useState<GuidedStep>("idle");
  const [draft, setDraft] = useState<DraftConfig>(DEFAULT_DRAFT_CONFIG);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [composerText, setComposerText] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busyHint, setBusyHint] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [jobs, setJobs] = useState<ContentJobRecord[]>([]);
  const [previewJobId, setPreviewJobId] = useState<number | null>(null);
  const [historySearch, setHistorySearch] = useState("");

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      // ignore transient polling error
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const brandkitHydratedRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/brandkit", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (active && data?.persisted && data.brandkit) {
            setDraft((prev) => ({
              ...prev,
              brandkit: { ...prev.brandkit, ...data.brandkit },
            }));
            brandkitHydratedRef.current = true;
            return;
          }
        }
      } catch {
        // fallback to localStorage below
      }

      try {
        const raw = window.localStorage.getItem("autocreate_brandkit_v1");
        if (raw && active) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            setDraft((prev) => ({
              ...prev,
              brandkit: { ...prev.brandkit, ...parsed },
            }));
          }
        }
      } catch {
        // ignore invalid stored brandkit
      } finally {
        brandkitHydratedRef.current = true;
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!brandkitHydratedRef.current) return;
    try {
      window.localStorage.setItem(
        "autocreate_brandkit_v1",
        JSON.stringify(draft.brandkit)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [draft.brandkit]);

  const hasActiveJobs = useMemo(
    () => jobs.some((j) => j.status === "queued" || j.status === "processing"),
    [jobs]
  );

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(loadJobs, 2500);
    return () => clearInterval(timer);
  }, [hasActiveJobs, loadJobs]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, step]);

  const previewJob = useMemo(
    () => jobs.find((j) => j.id === previewJobId) ?? null,
    [jobs, previewJobId]
  );

  const completedCount = useMemo(
    () => jobs.filter((j) => j.status === "completed").length,
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.topic.toLowerCase().includes(q) ||
        j.preset.toLowerCase().includes(q) ||
        (j.folder_name || "").toLowerCase().includes(q)
    );
  }, [jobs, historySearch]);

  const isPosterOnly =
    draft.outputs.length === 1 && draft.outputs[0] === "poster";

  const resetChat = (presetOverride?: string) => {
    setNavView("chat");
    setStep("idle");
    setDraft({
      ...DEFAULT_DRAFT_CONFIG,
      preset: presetOverride || draft.preset,
      mock: draft.mock,
      brandkit: draft.brandkit,
    });
    setMessages([]);
    setComposerText("");
    setErrorBanner(null);
    setMentionOpen(false);
    setMobileNavOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const pushMessages = (...items: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...items]);
  };

  const startGuidedMode = (mode: StarterMode) => {
    setNavView("chat");
    setErrorBanner(null);
    setDraft((prev) => ({ ...prev, mode }));
    setStep("awaiting_brief");

    if (mode === "topic") {
      pushMessages({
        id: uid(),
        from: "ai",
        title: "Langkah 1 · Tentukan Topik Konten",
        text: "Tulis topik atau ide utama konten yang ingin dibuat (boleh 1 kalimat atau multi-baris jika Mode Batch aktif). Atau ambil inspirasi cepat dari RSS.",
        meta: "guided-step-1 · input topik",
        kind: "rss_picker",
      });
    } else if (mode === "link") {
      pushMessages({
        id: uid(),
        from: "ai",
        title: "Langkah 1 · Tempel Link atau Upload Video Referensi",
        text: "Tempel 1+ URL berita/artikel di kolom chat bawah, ATAU upload klip video referensi (MP4/MOV) untuk mengekstrak palet warna, rasio, pacing, & preset visualnya.",
        meta: "guided-step-1 · cek link / video referensi",
        kind: "video_ref",
      });
    } else {
      pushMessages({
        id: uid(),
        from: "ai",
        title: "Langkah 1 · Pilih Konten Lama untuk Di-Remix",
        text: "Klik tombol @ di composer bawah atau pilih salah satu proyek di riwayat samping untuk dijadikan bahan remix, lalu tuliskan arahan perubahannya.",
        meta: "guided-step-1 · remix @proyek",
      });
      setMentionOpen(true);
    }

    setTimeout(() => textareaRef.current?.focus(), 60);
  };

  const handleAnalyzeReferenceVideo = async (file: File) => {
    setBusyHint("Menganalisis gaya & palet video referensi...");
    setErrorBanner(null);
    try {
      const fd = new FormData();
      fd.append("video", file);
      const res = await fetch("/api/analyze-reference", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Gagal menganalisis video");

      setDraft((prev) => ({
        ...prev,
        preset: data.preset || prev.preset,
        aspectRatio: data.aspectRatio || prev.aspectRatio,
        slides: data.recommendedSlides || prev.slides,
      }));

      pushMessages({
        id: uid(),
        from: "ai",
        title: `Gaya Referensi Diekstrak (${file.name})`,
        text: `Terdeteksi rasio ${data.aspectRatio}, pacing ${data.pacing} (${data.recommendedSlides} slide), dan preset cocok: ${data.preset}. Sekarang ketik topik kontenmu di chat bawah untuk lanjut!`,
        meta: `${data.width}x${data.height} · ${data.durationSeconds}s`,
        kind: "video_ref",
        videoRef: data,
      });
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : "Gagal menganalisis video referensi"
      );
    } finally {
      setBusyHint(null);
    }
  };

  const handleDiscoverRss = async () => {
    setBusyHint("Mengambil ide topik RSS...");
    setErrorBanner(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 4, mock: draft.mock }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengambil RSS");
      const topics: RssTopic[] = data.topics || [];
      pushMessages({
        id: uid(),
        from: "ai",
        title: "Rekomendasi Topik RSS",
        text: "Klik salah satu topik di bawah untuk langsung masuk ke konfigurasi format:",
        meta: `${topics.length} ide ditemukan`,
        kind: "rss_picker",
        rssTopics: topics,
      });
      if (step === "idle") setStep("awaiting_brief");
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal mengambil RSS");
    } finally {
      setBusyHint(null);
    }
  };

  const applyRssTopic = (item: RssTopic) => {
    const nextDraft: DraftConfig = {
      ...draft,
      mode: "topic",
      topic: item.topic,
      preset: item.preset || draft.preset,
      referenceUrls: item.link ? [item.link] : draft.referenceUrls,
    };
    setDraft(nextDraft);
    pushMessages(
      { id: uid(), from: "user", text: item.topic },
      {
        id: uid(),
        from: "ai",
        title: "Langkah 2 · Pilih Format & Gaya Visual",
        text: "Topik diterima. Pilih format output, rasio, dan gaya visual di kartu terstruktur ini:",
        meta: "restricted options · klik untuk memilih",
        kind: "config_card",
      }
    );
    setStep("awaiting_config");
  };

  const checkUrlsAndAdvance = async (urls: string[], cleanTopic: string, isBatch: boolean) => {
    setBusyHint("Mengecek & mengekstrak URL referensi...");
    let results: RefCheckResult[] = [];
    try {
      const res = await fetch("/api/extract-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengecek link");
      results = data.results || [];
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal mengecek link");
    } finally {
      setBusyHint(null);
    }

    const derivedTopic =
      cleanTopic || results.find((r) => r.ok && r.title)?.title || "";

    setDraft((prev) => ({
      ...prev,
      topic: derivedTopic,
      isBatch,
      referenceUrls: urls,
      refResults: results,
    }));

    pushMessages(
      {
        id: uid(),
        from: "ai",
        title: "Hasil Ekstraksi Link Referensi",
        text:
          results.length > 0
            ? "Referensi berhasil dicek. Konteks link akan dipakai sebagai sumber materi konten."
            : "URL dicatat sebagai referensi.",
        kind: "ref_status",
        refResults: results,
      },
      {
        id: uid(),
        from: "ai",
        title: "Langkah 2 · Pilih Format & Gaya Visual",
        text: "Tentukan format output, rasio, dan preset visual. Atau klik Langsung Generate jika ingin memakai pengaturan default.",
        meta: "restricted options",
        kind: "config_card",
      }
    );
    setStep("awaiting_config");
  };

  const handleComposerSend = async () => {
    const raw = composerText.trim();
    if (!raw || busyHint) return;
    setErrorBanner(null);
    setMentionOpen(false);

    if (step === "idle" || step === "awaiting_brief") {
      const urls = extractUrlsFromText(raw);
      const textWithoutUrls = raw.replace(/https?:\/\/[^\s]+/gi, "").trim();
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const isBatch = draft.isBatch && lines.length > 1 && urls.length === 0;

      pushMessages({ id: uid(), from: "user", text: raw });
      setComposerText("");

      if (urls.length > 0) {
        await checkUrlsAndAdvance(urls, textWithoutUrls, false);
        return;
      }

      setDraft((prev) => ({
        ...prev,
        topic: raw,
        isBatch,
      }));
      pushMessages({
        id: uid(),
        from: "ai",
        title: "Langkah 2 · Pilih Format & Gaya Visual",
        text: isBatch
          ? `Terdeteksi ${lines.length} topik untuk Mode Batch. Pilih konfigurasi yang akan diterapkan ke semua topik:`
          : "Brief diterima. Silakan pilih format output, rasio, dan gaya visual di bawah:",
        meta: "restricted options",
        kind: "config_card",
      });
      setStep("awaiting_config");
      return;
    }

    // In awaiting_config or awaiting_confirm, treat text as topic/brief refinement
    pushMessages({ id: uid(), from: "user", text: raw });
    setComposerText("");
    setDraft((prev) => ({
      ...prev,
      topic: prev.topic ? `${prev.topic} — ${raw}` : raw,
    }));
    pushMessages({
      id: uid(),
      from: "ai",
      title: "Brief Diperbarui",
      text: "Catatan tambahan sudah dimasukkan ke brief. Silakan tinjau ringkasan dan klik Generate.",
      kind: "confirm_card",
    });
    setStep("awaiting_confirm");
  };

  const toggleOutputOption = (val: string) => {
    setDraft((prev) => {
      const exists = prev.outputs.includes(val);
      if (exists && prev.outputs.length === 1) return prev; // restrict min 1 output
      const nextOutputs = exists
        ? prev.outputs.filter((x) => x !== val)
        : [...prev.outputs, val];
      return { ...prev, outputs: nextOutputs };
    });
  };

  const goToConfirmStep = () => {
    if (!draft.topic.trim() && draft.referenceUrls.length === 0) {
      setErrorBanner("Topik atau Link Referensi belum diisi.");
      return;
    }
    pushMessages({
      id: uid(),
      from: "ai",
      title: "Langkah 3 · Konfirmasi Brief Sebelum Generate",
      text: "Periksa kembali ringkasan di bawah. Semua pilihan sudah tervalidasi.",
      meta: "confirmation gate",
      kind: "confirm_card",
    });
    setStep("awaiting_confirm");
  };

  const executeGenerate = async (overrideDraft?: DraftConfig) => {
    const cfg = overrideDraft || draft;
    if (cfg.outputs.length === 0) {
      setErrorBanner("Pilih minimal 1 format output.");
      return;
    }
    if (!cfg.topic.trim() && cfg.referenceUrls.length === 0) {
      setErrorBanner("Isi topik atau minimal 1 link referensi terlebih dahulu.");
      return;
    }

    setBusyHint("Mengirim job ke Laravel Queue & PostgreSQL...");
    setErrorBanner(null);
    setStep("generating");

    const effectiveSlides =
      cfg.outputs.length === 1 && cfg.outputs[0] === "poster" ? 1 : cfg.slides;

    try {
      if (cfg.isBatch) {
        const topics = cfg.topic
          .split(/\r?\n/)
          .map((t) => t.trim())
          .filter(Boolean);
        const res = await fetch("/api/batches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topics,
            preset: cfg.preset,
            series: cfg.series,
            aspectRatio: cfg.aspectRatio,
            language: cfg.language,
            outputs: cfg.outputs,
            options: {
              slides: effectiveSlides,
              mock: cfg.mock,
              visualProvider: cfg.visualProvider,
              customSceneImages:
                Object.keys(cfg.customSceneImages).length > 0
                  ? cfg.customSceneImages
                  : undefined,
              brandkit: cfg.brandkit.enabled ? cfg.brandkit : undefined,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal mengirim batch");
        pushMessages({
          id: uid(),
          from: "ai",
          title: "Batch Masuk Antrean",
          text: `${topics.length} topik telah dijadwalkan di Laravel Queue (${data.batchId}). Pantau hasilnya di menu Riwayat atau daftar Terakhir.`,
          meta: "batch queued",
        });
        setStep("completed");
      } else {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: cfg.topic.trim(),
            preset: cfg.preset,
            series: cfg.series,
            aspectRatio: cfg.aspectRatio,
            language: cfg.language,
            outputs: cfg.outputs,
            referenceUrls: cfg.referenceUrls,
            options: {
              slides: effectiveSlides,
              mock: cfg.mock,
              visualProvider: cfg.visualProvider,
              customSceneImages:
                Object.keys(cfg.customSceneImages).length > 0
                  ? cfg.customSceneImages
                  : undefined,
              brandkit: cfg.brandkit.enabled ? cfg.brandkit : undefined,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal membuat job");
        const jobId: number | undefined = data.job?.id;
        if (jobId) setPreviewJobId(jobId);

        pushMessages({
          id: uid(),
          from: "ai",
          title: `Job #${jobId} Sedang Diproses`,
          text: "Pipeline berjalan di background: Generate Script -> Caption & Hashtag -> Render Visual Remotion.",
          meta: `${cfg.visualProvider} · ${cfg.mock ? "mock" : "live"}`,
          kind: "job_progress",
          jobId,
        });
        setStep("completed");
      }
      await loadJobs();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Terjadi kesalahan saat generate");
      setStep("awaiting_confirm");
    } finally {
      setBusyHint(null);
    }
  };

  const handleOpenExistingJobInChat = (job: ContentJobRecord) => {
    setNavView("chat");
    setPreviewJobId(job.id);
    setMobileNavOpen(false);
    setStep("completed");
    setDraft({
      ...DEFAULT_DRAFT_CONFIG,
      topic: job.topic,
      preset: job.preset,
      series: job.series || "edukasi",
      aspectRatio: job.aspect_ratio,
      language: job.language,
      outputs: job.outputs?.length ? job.outputs : ["carousel"],
      referenceUrls: job.reference_urls || [],
    });
    setMessages([
      { id: uid(), from: "user", text: job.topic },
      {
        id: uid(),
        from: "ai",
        title: `Project #${job.id}`,
        text: `Menampilkan hasil render tersimpan di PostgreSQL (${job.aspect_ratio} · ${job.preset.replace(/_/g, " ")}).`,
        meta: `status: ${job.status}`,
        kind: "job_progress",
        jobId: job.id,
      },
    ]);
  };

  const handleRemixJob = (job: ContentJobRecord) => {
    setNavView("chat");
    setMentionOpen(false);
    setDraft({
      ...DEFAULT_DRAFT_CONFIG,
      mode: "remix",
      topic: `Remix dari "${job.topic}"`,
      preset: job.preset,
      series: job.series || "edukasi",
      aspectRatio: job.aspect_ratio,
      language: job.language,
      outputs: job.outputs?.length ? job.outputs : ["carousel", "video"],
      referenceUrls: job.reference_urls || [],
    });
    pushMessages(
      {
        id: uid(),
        from: "user",
        text: `@#${job.id} ${job.topic} — remix ke format/gaya baru`,
      },
      {
        id: uid(),
        from: "ai",
        title: "Langkah 2 · Pilih Format Remix",
        text: `Konteks dari #${job.id} dimuat. Pilih format output, rasio, atau preset baru di kartu ini:`,
        meta: "remix mode · restricted options",
        kind: "config_card",
      }
    );
    setStep("awaiting_config");
  };

  const handleRerender = async (
    id: number,
    customSceneImages?: Record<number, string>,
    outputs?: string[]
  ) => {
    await fetch(`/api/jobs/${id}/rerender`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outputs: outputs || ["carousel"],
        customSceneImages,
      }),
    });
    await loadJobs();
  };

  const handleDeleteJob = async (id: number) => {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    await loadJobs();
  };

  const composerPlaceholder = useMemo(() => {
    if (step === "awaiting_brief") {
      if (draft.mode === "link") return "Tempel URL berita/artikel (https://...) lalu tekan Enter...";
      if (draft.mode === "remix") return "Pilih proyek lewat @ atau ketik arahan remix...";
      return draft.isBatch
        ? "Tulis beberapa topik (1 topik per baris)..."
        : "Tulis topik atau ide konten yang ingin dibuat...";
    }
    if (step === "awaiting_config") {
      return "Pilih opsi di kartu atas, atau ketik catatan tambahan untuk brief...";
    }
    if (step === "awaiting_confirm") {
      return "Klik Gas Generate di kartu atas, atau ketik revisi brief...";
    }
    return "Jelaskan konten yang mau dibuat atau tempel link referensi...";
  }, [step, draft.mode, draft.isBatch]);

  return (
    <div className="grid h-dvh grid-cols-1 bg-[#0b0b0c] text-[#f4f4f5] md:grid-cols-[264px_1fr]">
      {/* Mobile scrim */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col gap-1 border-r border-white/5 bg-[#0e0e10] p-4 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-2 pb-3.5 pt-0.5">
          <button
            type="button"
            onClick={() => {
              setPreviewJobId(null);
              resetChat();
            }}
            title="Kembali ke halaman utama"
            className="flex flex-1 items-center gap-2.5 rounded-lg text-left transition hover:opacity-85"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#ddf77b] text-[13px] font-extrabold tracking-wide text-[#181824]">
              AS
            </span>
            <div className="leading-tight">
              <b className="block text-[15px] font-semibold">Autocreate</b>
              <small className="block text-[11px] text-[#a1a1aa]">Content Automation</small>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Tutup menu"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#a1a1aa] hover:bg-white/5 md:hidden"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={() => resetChat()}
          className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-[#1a1a1f] text-[13.5px] font-semibold transition hover:border-white/20"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Chat baru
        </button>

        <nav className="mt-3 flex flex-col gap-0.5" aria-label="Navigasi utama">
          {(
            [
              {
                id: "chat",
                label: "Chat",
                icon: (
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                ),
              },
              {
                id: "template",
                label: "Template",
                icon: (
                  <>
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </>
                ),
              },
              {
                id: "render",
                label: "Render",
                icon: (
                  <>
                    <rect x="2" y="4" width="20" height="14" rx="2" />
                    <path d="M8 22h8" />
                  </>
                ),
              },
              {
                id: "riwayat",
                label: "Riwayat",
                icon: (
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </>
                ),
              },
              {
                id: "video-editor",
                label: "Edit Video Take",
                icon: (
                  <>
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </>
                ),
              },
              {
                id: "setting",
                label: "Setting",
                icon: (
                  <>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </>
                ),
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setNavView(item.id);
                setMobileNavOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition ${
                navView === item.id
                  ? "bg-white/[0.07] font-semibold text-[#f4f4f5]"
                  : "font-medium text-[#a1a1aa] hover:bg-white/[0.04] hover:text-[#f4f4f5]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 opacity-85"
              >
                {item.icon}
              </svg>
              {item.label}
            </button>
          ))}
        </nav>

        <p className="mx-2 mb-1.5 mt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#63636b]">
          Terakhir
        </p>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
          {jobs.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-[#63636b]">Belum ada proyek tersimpan.</p>
          ) : (
            jobs.slice(0, 12).map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => handleOpenExistingJobInChat(job)}
                className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition ${
                  previewJobId === job.id
                    ? "bg-white/[0.06]"
                    : "hover:bg-white/[0.04]"
                }`}
              >
                <span
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                    job.status === "completed"
                      ? "bg-[#ddf77b]"
                      : job.status === "failed"
                        ? "bg-rose-400"
                        : "bg-amber-300"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-medium text-[#f4f4f5]">
                    {job.topic}
                  </b>
                  <small className="block text-[11px] text-[#63636b]">
                    #{job.id} · {job.aspect_ratio} · {job.status}
                  </small>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          <div className="rounded-[14px] border border-white/5 bg-[#131316] px-3 py-2.5">
            <div className="flex items-baseline justify-between text-xs text-[#a1a1aa]">
              <span>Database PostgreSQL</span>
              <b className="font-mono text-[12px] text-[#f4f4f5] tabular-nums">
                {completedCount}/{jobs.length}
              </b>
            </div>
            <div className="my-2 h-[5px] overflow-hidden rounded-full bg-white/[0.08]">
              <i
                className="block h-full rounded-full bg-[#ddf77b] transition-all"
                style={{
                  width: `${jobs.length > 0 ? Math.max(10, Math.round((completedCount / jobs.length) * 100)) : 8}%`,
                }}
              />
            </div>
            <small className="text-[11px] text-[#63636b]">
              {jobs.length} proyek · {completedCount} selesai render
            </small>
          </div>
          <div className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5">
            <span className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#2a2a30] text-[13px] font-bold">
              W
            </span>
            <span className="leading-tight">
              <b className="block text-[13px] font-semibold">Studio Workspace</b>
              <small className="block text-[11px] text-[#63636b]">Next.js · Laravel · PG</small>
            </span>
          </div>
        </div>
      </aside>

      {/* MAIN + OPTIONAL ARTIFACT PANEL */}
      <div className="flex min-h-0 min-w-0">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/5 px-5">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#a1a1aa] hover:bg-white/5 md:hidden"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="truncate text-sm font-semibold">
              {navView === "chat" ? (
                <>
                  {draft.topic ? draft.topic : "Chat baru"}{" "}
                  <span className="font-normal text-[#63636b]">
                    · {step === "idle" ? "siap dipandu" : step.replace(/_/g, " ")}
                  </span>
                </>
              ) : (
                <span className="capitalize">
                  {navView === "setting"
                    ? "Setting"
                    : navView === "video-editor"
                      ? "Edit Video Take"
                      : navView}
                </span>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="rounded-full border border-white/10 bg-[#131316] px-2.5 py-1 text-[11.5px] font-medium text-[#d4d4d8] transition hover:border-[#ddf77b]/50 hover:text-[#ddf77b]"
              >
                Alur Penggunaan
              </button>
              <span className="rounded-full border border-white/10 bg-[#131316] px-2.5 py-1 font-mono text-[11.5px] text-[#a1a1aa]">
                {draft.visualProvider} · {draft.mock ? "mock" : "live"}
              </span>
            </div>
          </header>

          {errorBanner && (
            <div className="mx-5 mt-3 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="ml-3 text-rose-200 hover:text-white"
              >
                Tutup
              </button>
            </div>
          )}

          {/* VIEW: CHAT */}
          {navView === "chat" && (
            <>
              {step === "idle" ? (
                <section className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
                  <div className="mb-5 inline-flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-[#ddf77b] text-[20px] font-extrabold text-[#181824]">
                    AS
                  </div>
                  <h1 className="mb-2 text-[clamp(24px,4vw,34px)] font-bold tracking-[-0.02em]">
                    Mau bikin apa hari ini?
                  </h1>
                  <p className="mb-7 max-w-[520px] text-[14.5px] text-[#a1a1aa]">
                    Mulai dari topik terpandu, remix konten yang sudah ada, atau tiru gaya dari link berita/artikel.
                  </p>

                  <div className="grid w-full max-w-[740px] grid-cols-1 gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => startGuidedMode("topic")}
                      className="group flex flex-col items-start gap-1.5 rounded-[14px] border border-white/10 bg-[#131316] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#ddf77b]/50"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[#ddf77b]">
                        <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
                      </svg>
                      <b className="text-[14px] font-semibold">Dari topik</b>
                      <span className="text-[12.5px] text-[#a1a1aa]">
                        Dipandu pilih format, rasio &amp; gaya visual
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startGuidedMode("remix")}
                      className="group flex flex-col items-start gap-1.5 rounded-[14px] border border-white/10 bg-[#131316] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#ddf77b]/50"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[#ddf77b]">
                        <path d="M17 1l4 4-4 4" />
                        <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
                        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                      <b className="text-[14px] font-semibold">Remix konten</b>
                      <span className="text-[12.5px] text-[#a1a1aa]">
                        Pilih proyek lama (@) untuk diolah ulang
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => startGuidedMode("link")}
                      className="group flex flex-col items-start gap-1.5 rounded-[14px] border border-white/10 bg-[#131316] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#ddf77b]/50"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[#ddf77b]">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <b className="text-[14px] font-semibold">Tiru gaya / Link</b>
                      <span className="text-[12.5px] text-[#a1a1aa]">
                        Tempel URL berita/artikel untuk dirangkum
                      </span>
                    </button>
                  </div>

                  {/* Alur Penggunaan 4 Langkah */}
                  <div className="mt-7 w-full max-w-[740px] rounded-[14px] border border-white/8 bg-[#131316]/80 p-4 text-left">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#ddf77b]">
                        Alur Penggunaan (4 Langkah Mudah)
                      </span>
                      <span className="text-[11px] text-[#63636b]">
                        Terpandu &amp; tervalidasi otomatis
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-4">
                      <div className="rounded-xl border border-white/5 bg-[#1a1a1f]/70 p-2.5">
                        <b className="block text-[#f4f4f5]">1. Tulis Brief</b>
                        <span className="text-[11px] text-[#a1a1aa]">
                          Pilih kartu di atas, ambil Ide RSS, atau tempel URL.
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-[#1a1a1f]/70 p-2.5">
                        <b className="block text-[#f4f4f5]">2. Pilih Opsi</b>
                        <span className="text-[11px] text-[#a1a1aa]">
                          Klik format, rasio, preset &amp; slide di kartu pilihan.
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-[#1a1a1f]/70 p-2.5">
                        <b className="block text-[#f4f4f5]">3. Konfirmasi</b>
                        <span className="text-[11px] text-[#a1a1aa]">
                          Cek ringkasan brief lalu klik Gas Generate.
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-[#1a1a1f]/70 p-2.5">
                        <b className="block text-[#f4f4f5]">4. Preview &amp; ZIP</b>
                        <span className="text-[11px] text-[#a1a1aa]">
                          Lihat slide/MP4 di panel kanan, salin caption, unduh ZIP.
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                  <div className="mx-auto flex max-w-[760px] flex-col gap-4">
                    {messages.map((msg) => {
                      if (msg.from === "user") {
                        return (
                          <div key={msg.id} className="flex justify-end">
                            <div className="max-w-[82%] rounded-[18px] rounded-br-sm border border-white/10 bg-[#1a1a1f] px-4 py-2.5 text-[14px] whitespace-pre-wrap">
                              {msg.text}
                            </div>
                          </div>
                        );
                      }

                      const linkedJob = msg.jobId
                        ? jobs.find((j) => j.id === msg.jobId)
                        : undefined;

                      return (
                        <div key={msg.id} className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#ddf77b] text-[11px] font-extrabold text-[#181824]">
                            AS
                          </span>
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="rounded-[16px] border border-white/10 bg-[#131316] p-4 space-y-2">
                              {msg.title && (
                                <h3 className="text-[14px] font-semibold text-[#f4f4f5]">
                                  {msg.title}
                                </h3>
                              )}
                              <p className="text-[13.5px] leading-relaxed text-[#d4d4d8]">
                                {msg.text}
                              </p>
                              {msg.meta && (
                                <p className="font-mono text-[11px] text-[#63636b]">{msg.meta}</p>
                              )}

                              {/* RSS Picker */}
                              {msg.kind === "rss_picker" && (
                                <div className="pt-2 space-y-2">
                                  {!msg.rssTopics ? (
                                    <button
                                      type="button"
                                      disabled={Boolean(busyHint)}
                                      onClick={handleDiscoverRss}
                                      className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs font-medium text-[#ddf77b] hover:border-[#ddf77b]/50 disabled:opacity-50"
                                    >
                                      {busyHint || "Ambil Ide RSS Sekarang"}
                                    </button>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                      {msg.rssTopics.map((item, i) => (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => applyRssTopic(item)}
                                          className="rounded-xl border border-white/10 bg-[#1a1a1f] p-2.5 text-left text-xs transition hover:border-[#ddf77b]/60"
                                        >
                                          <span className="font-medium text-[#f4f4f5] line-clamp-2">
                                            {item.topic}
                                          </span>
                                          <span className="mt-1 block font-mono text-[10.5px] text-[#a1a1aa]">
                                            {item.preset.replace(/_/g, " ")}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Ref Check Status */}
                              {msg.kind === "ref_status" && msg.refResults && (
                                <div className="space-y-1.5 pt-2">
                                  {msg.refResults.map((r, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs"
                                    >
                                      <span className="truncate text-[#e4e4e7]">
                                        {r.title || r.url}
                                      </span>
                                      <span
                                        className={`shrink-0 font-mono text-[11px] ${
                                          r.ok ? "text-[#ddf77b]" : "text-rose-400"
                                        }`}
                                      >
                                        {r.ok ? `OK (${r.method})` : "Gagal"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Video Reference Style Extractor */}
                              {msg.kind === "video_ref" && !msg.videoRef && (
                                <div className="pt-2">
                                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#ddf77b]/40 bg-[#ddf77b]/10 px-3 py-1.5 text-xs font-semibold text-[#ddf77b] hover:bg-[#ddf77b]/20">
                                    <span>Upload Video Referensi (MP4/MOV)</span>
                                    <input
                                      type="file"
                                      accept="video/mp4,video/quicktime,video/webm"
                                      className="hidden"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleAnalyzeReferenceVideo(f);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              )}

                              {msg.kind === "video_ref" && msg.videoRef && (
                                <div className="mt-2 space-y-2.5 rounded-xl border border-white/10 bg-[#1a1a1f] p-3">
                                  {msg.videoRef.keyframes.length > 0 && (
                                    <div className="grid grid-cols-4 gap-1.5">
                                      {msg.videoRef.keyframes.map((kf, idx) => (
                                        <img
                                          key={idx}
                                          src={kf}
                                          alt={`Keyframe ${idx + 1}`}
                                          className="h-16 w-full rounded-md border border-white/10 object-cover"
                                        />
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                    <div className="flex items-center gap-1.5">
                                      {[
                                        msg.videoRef.palette.primaryColor,
                                        msg.videoRef.palette.secondaryColor,
                                        msg.videoRef.palette.accentColor,
                                      ].map((hex, idx) => (
                                        <span
                                          key={idx}
                                          className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#131316] px-1.5 py-0.5 font-mono text-[#d4d4d8]"
                                        >
                                          <span
                                            className="h-2.5 w-2.5 rounded-full border border-white/20"
                                            style={{ backgroundColor: hex }}
                                          />
                                          {hex}
                                        </span>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const p = msg.videoRef!.palette;
                                        setDraft((prev) => ({
                                          ...prev,
                                          brandkit: {
                                            ...prev.brandkit,
                                            enabled: true,
                                            primaryColor: p.primaryColor,
                                            secondaryColor: p.secondaryColor,
                                            accentColor: p.accentColor,
                                          },
                                        }));
                                      }}
                                      className="rounded-md bg-[#ddf77b] px-2.5 py-1 text-[11px] font-bold text-[#181824] hover:opacity-90"
                                    >
                                      Terapkan Warna ke Brandkit
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Restricted Choice Card (Step 2) */}
                              {msg.kind === "config_card" && (
                                <div className="mt-3 space-y-4 border-t border-white/10 pt-3">
                                  {/* Output Format */}
                                  <div>
                                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                      1. Format Output (min. 1)
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {OUTPUT_OPTIONS.map((opt) => {
                                        const active = draft.outputs.includes(opt.id);
                                        return (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => toggleOutputOption(opt.id)}
                                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                              active
                                                ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                                                : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa] hover:border-white/25"
                                            }`}
                                          >
                                            {opt.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Aspect Ratio */}
                                  <div>
                                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                      2. Rasio Gambar
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {ASPECT_RATIOS.map((r) => (
                                        <button
                                          key={r.id}
                                          type="button"
                                          onClick={() =>
                                            setDraft((prev) => ({ ...prev, aspectRatio: r.id }))
                                          }
                                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                            draft.aspectRatio === r.id
                                              ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                                              : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa] hover:border-white/25"
                                          }`}
                                        >
                                          {r.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Preset & Series */}
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                        3. Preset Visual
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {PRESET_OPTIONS.map((p) => (
                                          <button
                                            key={p.id}
                                            type="button"
                                            onClick={() =>
                                              setDraft((prev) => ({ ...prev, preset: p.id }))
                                            }
                                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                                              draft.preset === p.id
                                                ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                                                : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa] hover:border-white/25"
                                            }`}
                                          >
                                            {p.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                        4. Gaya / Seri Konten
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {SERIES_OPTIONS.map((s) => (
                                          <button
                                            key={s.id}
                                            type="button"
                                            onClick={() =>
                                              setDraft((prev) => ({ ...prev, series: s.id }))
                                            }
                                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                                              draft.series === s.id
                                                ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                                                : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa] hover:border-white/25"
                                            }`}
                                          >
                                            {s.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Slides, Language, Provider, Mock */}
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    <div>
                                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                        Jumlah Slide
                                      </p>
                                      {isPosterOnly ? (
                                        <span className="inline-block rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5 text-xs text-[#63636b]">
                                          Terkunci: 1 (Poster)
                                        </span>
                                      ) : (
                                        <div className="flex gap-1.5">
                                          {SLIDE_COUNTS.map((cnt) => (
                                            <button
                                              key={cnt}
                                              type="button"
                                              onClick={() =>
                                                setDraft((prev) => ({ ...prev, slides: cnt }))
                                              }
                                              className={`rounded-lg border px-2.5 py-1 text-xs font-mono transition ${
                                                draft.slides === cnt
                                                  ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                                                  : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                                              }`}
                                            >
                                              {cnt}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div>
                                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                        Bahasa
                                      </p>
                                      <div className="flex gap-1.5">
                                        {LANGUAGES.map((l) => (
                                          <button
                                            key={l.id}
                                            type="button"
                                            onClick={() =>
                                              setDraft((prev) => ({ ...prev, language: l.id }))
                                            }
                                            className={`rounded-lg border px-2.5 py-1 text-xs uppercase transition ${
                                              draft.language === l.id
                                                ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                                                : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                                            }`}
                                          >
                                            {l.id}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                        Provider Visual
                                      </p>
                                      <select
                                        value={draft.visualProvider}
                                        onChange={(e) =>
                                          setDraft((prev) => ({
                                            ...prev,
                                            visualProvider: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                                      >
                                        {VISUAL_PROVIDERS.map((vp) => (
                                          <option key={vp.id} value={vp.id}>
                                            {vp.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  {/* Custom Photos per Slide */}
                                  <div>
                                    <div className="mb-1.5 flex items-center justify-between">
                                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                                        5. Foto Sendiri per Slide (Opsional)
                                      </p>
                                      {Object.keys(draft.customSceneImages).length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDraft((prev) => ({
                                              ...prev,
                                              customSceneImages: {},
                                            }))
                                          }
                                          className="text-[11px] text-rose-400 hover:text-rose-300"
                                        >
                                          Hapus semua foto
                                        </button>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {Array.from(
                                        { length: isPosterOnly ? 1 : draft.slides },
                                        (_, i) => i + 1
                                      ).map((slideNum) => {
                                        const img = draft.customSceneImages[slideNum];
                                        return (
                                          <div
                                            key={slideNum}
                                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#1a1a1f] px-2 py-1 text-[11px]"
                                          >
                                            {img && (
                                              <img
                                                src={img}
                                                alt={`Slide ${slideNum}`}
                                                className="h-5 w-5 rounded object-cover"
                                              />
                                            )}
                                            <label className="cursor-pointer text-[#d4d4d8] hover:text-[#ddf77b]">
                                              {img ? `Slide ${slideNum} ✓` : `+ Foto Slide ${slideNum}`}
                                              <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp"
                                                className="hidden"
                                                onChange={async (e) => {
                                                  const file = e.target.files?.[0];
                                                  e.target.value = "";
                                                  if (!file) return;
                                                  const dataUrl =
                                                    await readImageFileAsDataUrl(file);
                                                  setDraft((prev) => ({
                                                    ...prev,
                                                    customSceneImages: {
                                                      ...prev.customSceneImages,
                                                      [slideNum]: dataUrl,
                                                    },
                                                  }));
                                                }}
                                              />
                                            </label>
                                            {img && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setDraft((prev) => {
                                                    const next = { ...prev.customSceneImages };
                                                    delete next[slideNum];
                                                    return { ...prev, customSceneImages: next };
                                                  })
                                                }
                                                className="text-rose-400 hover:text-rose-300"
                                              >
                                                ✕
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Action Gate */}
                                  <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                                    <button
                                      type="button"
                                      onClick={goToConfirmStep}
                                      className="rounded-lg bg-[#ddf77b] px-3.5 py-2 text-xs font-semibold text-[#181824] hover:opacity-90"
                                    >
                                      Lanjut ke Ringkasan
                                    </button>
                                    <button
                                      type="button"
                                      disabled={Boolean(busyHint)}
                                      onClick={() => executeGenerate()}
                                      className="rounded-lg border border-white/15 bg-[#1a1a1f] px-3.5 py-2 text-xs font-medium text-[#f4f4f5] hover:border-[#ddf77b]/50 disabled:opacity-50"
                                    >
                                      Langsung Generate (Fast-Track)
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Confirmation Gate (Step 3) */}
                              {msg.kind === "confirm_card" && (
                                <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#1a1a1f] p-3 text-xs sm:grid-cols-3">
                                    <div>
                                      <span className="block text-[10.5px] text-[#63636b]">Topik</span>
                                      <b className="line-clamp-2 font-medium text-[#f4f4f5]">
                                        {draft.topic || "(Dari Link Referensi)"}
                                      </b>
                                    </div>
                                    <div>
                                      <span className="block text-[10.5px] text-[#63636b]">Output &amp; Rasio</span>
                                      <b className="font-medium text-[#f4f4f5]">
                                        {draft.outputs.join(", ")} · {draft.aspectRatio}
                                      </b>
                                    </div>
                                    <div>
                                      <span className="block text-[10.5px] text-[#63636b]">Preset &amp; Slide</span>
                                      <b className="font-medium text-[#f4f4f5]">
                                        {draft.preset.replace(/_/g, " ")} ·{" "}
                                        {isPosterOnly ? 1 : draft.slides} slide
                                      </b>
                                    </div>
                                    <div>
                                      <span className="block text-[10.5px] text-[#63636b]">Gaya / Bahasa</span>
                                      <b className="font-medium text-[#f4f4f5]">
                                        {draft.series} · {draft.language.toUpperCase()}
                                      </b>
                                    </div>
                                    <div>
                                      <span className="block text-[10.5px] text-[#63636b]">Provider</span>
                                      <b className="font-medium text-[#f4f4f5]">
                                        {draft.visualProvider} ({draft.mock ? "Mock" : "Live AI"})
                                      </b>
                                    </div>
                                    {draft.referenceUrls.length > 0 && (
                                      <div>
                                        <span className="block text-[10.5px] text-[#63636b]">Referensi</span>
                                        <b className="font-medium text-[#ddf77b]">
                                          {draft.referenceUrls.length} link
                                        </b>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={Boolean(busyHint)}
                                      onClick={() => executeGenerate()}
                                      className="rounded-lg bg-[#ddf77b] px-4 py-2 text-xs font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
                                    >
                                      {busyHint ? busyHint : "Gas Generate Sekarang"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        pushMessages({
                                          id: uid(),
                                          from: "ai",
                                          title: "Ubah Konfigurasi",
                                          text: "Silakan sesuaikan pilihan format atau preset di bawah:",
                                          kind: "config_card",
                                        });
                                        setStep("awaiting_config");
                                      }}
                                      className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs font-medium text-[#d4d4d8] hover:border-white/25"
                                    >
                                      Ubah Konfigurasi
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => startGuidedMode(draft.mode)}
                                      className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs font-medium text-[#a1a1aa] hover:border-white/25"
                                    >
                                      Edit Topik
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Job Progress & Result Artifact Card */}
                              {msg.kind === "job_progress" && linkedJob && (
                                <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#1a1a1f] p-3">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[11px] text-[#a1a1aa]">
                                          #{linkedJob.id}
                                        </span>
                                        <span
                                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                            linkedJob.status === "completed"
                                              ? "bg-[#ddf77b]/15 text-[#ddf77b]"
                                              : linkedJob.status === "failed"
                                                ? "bg-rose-500/15 text-rose-400"
                                                : "bg-amber-400/15 text-amber-300"
                                          }`}
                                        >
                                          {linkedJob.status}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs font-medium text-[#f4f4f5]">
                                        {linkedJob.status === "completed"
                                          ? `Render selesai (${
                                              (
                                                linkedJob.manifest?.slides ||
                                                linkedJob.manifest?.outputs?.carouselSlides ||
                                                []
                                              ).length
                                            } slide${
                                              linkedJob.manifest?.video ||
                                              linkedJob.manifest?.outputs?.video
                                                ? " + Video MP4"
                                                : ""
                                            }${
                                              linkedJob.manifest?.poster ||
                                              linkedJob.manifest?.outputs?.poster
                                                ? " + Poster"
                                                : ""
                                            })`
                                          : linkedJob.status === "failed"
                                            ? `Gagal: ${linkedJob.error_message || "Error"}`
                                            : "Sedang merender di Laravel Queue & Remotion..."}
                                      </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setPreviewJobId(linkedJob.id)}
                                        className="rounded-lg bg-[#ddf77b] px-3 py-1.5 text-xs font-semibold text-[#181824] hover:opacity-90"
                                      >
                                        Buka Preview
                                      </button>
                                      {(linkedJob.folder_name || linkedJob.manifest?.jobId) && (
                                        <a
                                          href={`/renderer-api/outputs/${encodeURIComponent(
                                            linkedJob.folder_name ||
                                              linkedJob.manifest?.jobId ||
                                              ""
                                          )}/zip`}
                                          download
                                          className="rounded-lg border border-white/15 bg-[#131316] px-3 py-1.5 text-xs font-medium text-[#f4f4f5] hover:border-white/30"
                                        >
                                          Download ZIP
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  {linkedJob.status === "completed" && (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleRemixJob(linkedJob)}
                                        className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs text-[#d4d4d8] hover:border-[#ddf77b]/50"
                                      >
                                        Remix ke Format Lain
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => resetChat()}
                                        className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs text-[#a1a1aa] hover:text-white"
                                      >
                                        Buat Konten Baru
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} />
                  </div>
                </section>
              )}

              {/* COMPOSER */}
              <footer className="relative shrink-0 px-4 pb-4 pt-2 sm:px-6">
                {mentionOpen && (
                  <div className="mx-auto mb-2 max-w-[760px] rounded-xl border border-white/10 bg-[#131316] p-2 shadow-xl">
                    <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                      <span>Sebut / Remix Proyek (@)</span>
                      <button
                        type="button"
                        onClick={() => setMentionOpen(false)}
                        className="text-[#a1a1aa] hover:text-white"
                      >
                        Tutup
                      </button>
                    </div>
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {jobs.length === 0 ? (
                        <p className="px-2 py-1.5 text-xs text-[#63636b]">
                          Belum ada proyek tersimpan untuk di-remix.
                        </p>
                      ) : (
                        jobs.slice(0, 8).map((j) => (
                          <button
                            key={j.id}
                            type="button"
                            onClick={() => handleRemixJob(j)}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-white/[0.06]"
                          >
                            <span className="truncate font-medium text-[#f4f4f5]">
                              #{j.id} · {j.topic}
                            </span>
                            <span className="ml-2 shrink-0 font-mono text-[10.5px] text-[#a1a1aa]">
                              {j.aspect_ratio}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="mx-auto max-w-[760px] rounded-[20px] border border-white/10 bg-[#131316] px-3.5 pb-2.5 pt-3 focus-within:border-white/25">
                  <textarea
                    ref={textareaRef}
                    rows={draft.isBatch ? 3 : 1}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !draft.isBatch) {
                        e.preventDefault();
                        handleComposerSend();
                      }
                    }}
                    placeholder={composerPlaceholder}
                    className="max-h-40 w-full resize-none bg-transparent text-[14px] text-[#f4f4f5] placeholder-[#63636b] outline-none"
                  />

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMentionOpen((v) => !v)}
                        title="Sebut konten lama (@)"
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-[#1a1a1f] px-2 text-xs text-[#a1a1aa] hover:border-white/25 hover:text-white"
                      >
                        @ Remix
                      </button>

                      <button
                        type="button"
                        onClick={handleDiscoverRss}
                        disabled={Boolean(busyHint)}
                        className="inline-flex h-7 items-center rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 text-xs text-[#a1a1aa] hover:border-white/25 hover:text-white disabled:opacity-50"
                      >
                        Ide RSS
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, isBatch: !prev.isBatch }))
                        }
                        className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-xs transition ${
                          draft.isBatch
                            ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                            : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                        }`}
                      >
                        Batch: {draft.isBatch ? "ON" : "OFF"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, mock: !prev.mock }))
                        }
                        className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-xs transition ${
                          draft.mock
                            ? "border-[#ddf77b]/60 bg-[#ddf77b]/10 text-[#ddf77b]"
                            : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                        }`}
                      >
                        Mock: {draft.mock ? "ON" : "OFF"}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!composerText.trim() || Boolean(busyHint)}
                      onClick={handleComposerSend}
                      aria-label="Kirim"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#ddf77b] text-[#181824] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="mx-auto mt-1.5 max-w-[760px] text-center text-[11px] text-[#63636b]">
                  Alur terpandu: ketik topik/link → pilih opsi tervalidasi → konfirmasi sebelum render.
                </p>
              </footer>
            </>
          )}

          {/* VIEW: TEMPLATE */}
          {navView === "template" && (
            <section className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-[880px] space-y-4">
                <div>
                  <h2 className="text-lg font-bold">Preset Visual Studio</h2>
                  <p className="text-xs text-[#a1a1aa]">
                    Pilih preset tema visual di bawah untuk langsung memulai chat terpandu dengan tema tersebut.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {PRESET_OPTIONS.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between rounded-[14px] border border-white/10 bg-[#131316] p-4"
                    >
                      <div>
                        <span className="font-mono text-[11px] text-[#ddf77b]">{p.id}</span>
                        <h3 className="mt-1 text-sm font-semibold">{p.label}</h3>
                        <p className="mt-1 text-xs text-[#a1a1aa]">{p.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          resetChat(p.id);
                          startGuidedMode("topic");
                        }}
                        className="mt-4 rounded-lg bg-[#1a1a1f] px-3 py-2 text-xs font-semibold text-[#f4f4f5] hover:bg-[#ddf77b] hover:text-[#181824]"
                      >
                        Pakai Preset Ini
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* VIEW: RENDER / RIWAYAT */}
          {(navView === "render" || navView === "riwayat") && (
            <section className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-[920px] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">
                      {navView === "render" ? "Hasil Render" : "Riwayat Project PostgreSQL"}
                    </h2>
                    <p className="text-xs text-[#a1a1aa]">
                      Klik salah satu project untuk membuka preview slide, video MP4, dan caption.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Cari topik atau preset..."
                      className="rounded-lg border border-white/10 bg-[#131316] px-3 py-1.5 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                    />
                    <button
                      type="button"
                      onClick={loadJobs}
                      className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs font-medium hover:border-white/25"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {filteredJobs.length === 0 ? (
                  <div className="rounded-[14px] border border-white/10 bg-[#131316] p-8 text-center text-xs text-[#a1a1aa]">
                    Belum ada project yang cocok.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredJobs.map((j) => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => setPreviewJobId(j.id)}
                        className={`flex flex-col justify-between rounded-[14px] border p-4 text-left transition ${
                          previewJobId === j.id
                            ? "border-[#ddf77b] bg-[#ddf77b]/5"
                            : "border-white/10 bg-[#131316] hover:border-white/25"
                        }`}
                      >
                        <div>
                          <div className="mb-2 flex items-center justify-between text-[11px]">
                            <span className="font-mono text-[#a1a1aa]">#{j.id}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${
                                j.status === "completed"
                                  ? "bg-[#ddf77b]/15 text-[#ddf77b]"
                                  : j.status === "failed"
                                    ? "bg-rose-500/15 text-rose-400"
                                    : "bg-amber-400/15 text-amber-300"
                              }`}
                            >
                              {j.status}
                            </span>
                          </div>
                          <h3 className="line-clamp-2 text-sm font-semibold text-[#f4f4f5]">
                            {j.topic}
                          </h3>
                        </div>
                        <p className="mt-3 text-[11px] text-[#a1a1aa]">
                          {j.aspect_ratio} · {j.preset.replace(/_/g, " ")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* VIEW: VIDEO EDITOR */}
          {navView === "video-editor" && <VideoTakeEditor />}

          {/* VIEW: SETTING */}
          {navView === "setting" && (
            <SettingsView
              draft={draft}
              onUpdateDraft={setDraft}
              totalJobs={jobs.length}
              completedJobs={completedCount}
            />
          )}
        </main>

        {/* SIDE-PANEL ARTIFACT PREVIEW */}
        <ArtifactPreviewPanel
          job={previewJob}
          onClose={() => setPreviewJobId(null)}
          onRerender={handleRerender}
          onDelete={handleDeleteJob}
          onRemix={handleRemixJob}
        />
      </div>

      {guideOpen && (
        <div
          onClick={() => setGuideOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[540px] rounded-2xl border border-white/10 bg-[#0e0e10] p-5 text-[#f4f4f5] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold">Alur Penggunaan Autocreate Studio</h3>
                <p className="text-xs text-[#a1a1aa]">Panduan singkat membuat konten dari awal sampai siap unduh</p>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-lg px-2 py-1 text-xs text-[#a1a1aa] hover:text-white"
              >
                ✕
              </button>
            </div>

            <ol className="space-y-2.5 text-xs leading-relaxed text-[#d4d4d8]">
              <li className="rounded-xl border border-white/8 bg-[#131316] p-3">
                <b className="text-[#ddf77b]">1. Mulai Brief</b> — Pilih <i>Dari topik</i>, <i>Remix konten</i>, atau <i>Tiru gaya / Link</i>, lalu ketik topik atau tempel URL di composer bawah. Bisa juga klik <b>Ide RSS</b>.
              </li>
              <li className="rounded-xl border border-white/8 bg-[#131316] p-3">
                <b className="text-[#ddf77b]">2. Pilih Opsi Terstruktur</b> — Klik format (Carousel, Video, Poster), rasio, preset visual, dan jumlah slide di kartu pilihan. Ingin cepat? Klik <b>Langsung Generate (Fast-Track)</b>.
              </li>
              <li className="rounded-xl border border-white/8 bg-[#131316] p-3">
                <b className="text-[#ddf77b]">3. Konfirmasi Brief</b> — Periksa ringkasan parameter sebelum proses render berjalan, lalu klik <b>Gas Generate Sekarang</b>.
              </li>
              <li className="rounded-xl border border-white/8 bg-[#131316] p-3">
                <b className="text-[#ddf77b]">4. Preview, Remix &amp; Unduh</b> — Klik <b>Buka Preview</b> untuk melihat slide, memutar video MP4, menyalin caption + hashtag, atau mengunduh semua aset lewat <b>Download ZIP</b>.
              </li>
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-[#a1a1aa]">
              <span>Tips: Gunakan <b>Mock: ON</b> untuk test layout cepat tanpa token AI.</span>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-lg bg-[#ddf77b] px-3.5 py-1.5 text-xs font-bold text-[#181824]"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      <FaqChatbot isDark={true} />
    </div>
  );
}
