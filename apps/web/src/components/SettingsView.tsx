"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "./ConfirmModal";
import {
  ASPECT_RATIOS,
  BGM_OPTIONS,
  BRANDKIT_FONT_OPTIONS,
  BrandkitConfig,
  DEFAULT_BRANDKIT_CONFIG,
  DraftConfig,
  FAQ_ITEMS,
  LANGUAGES,
  PRESET_OPTIONS,
  SERIES_OPTIONS,
  readImageFileAsDataUrl,
  SLIDE_COUNTS,
  VISUAL_PROVIDERS,
  VOICE_OPTIONS,
} from "@/types/studio";

interface SettingsViewProps {
  draft: DraftConfig;
  onUpdateDraft: (updater: (prev: DraftConfig) => DraftConfig) => void;
  totalJobs: number;
  completedJobs: number;
}

interface StoredProviderKey {
  id: number;
  provider: "gemini" | "opencode";
  masked_key: string;
  model?: string | null;
  is_active: boolean;
  last_test_status?: string | null;
  updated_at: string;
}

type SettingsTab = "provider" | "defaults" | "brandkit" | "social" | "faq" | "system";

interface StoredSocialAccount {
  id: number;
  platform: "instagram" | "youtube" | "tiktok";
  account_name: string;
  account_id?: string | null;
  masked_token: string;
  is_active: boolean;
  last_error?: string | null;
}

export function SettingsView({
  draft,
  onUpdateDraft,
  totalJobs,
  completedJobs,
}: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>("provider");
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const [storedKeys, setStoredKeys] = useState<StoredProviderKey[]>([]);
  const [keyInputs, setKeyInputs] = useState<{ gemini: string; opencode: string }>({
    gemini: "",
    opencode: "",
  });
  const [modelInputs, setModelInputs] = useState<{ gemini: string; opencode: string }>({
    gemini: "gemini-2.5-flash",
    opencode: "glm-5.3-flash",
  });
  const [availableModels, setAvailableModels] = useState<{
    gemini: string[];
    opencode: string[];
  }>({
    gemini: ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-2.5-pro"],
    opencode: ["glm-5.3-flash", "qwen-3-coder", "deepseek-v3"],
  });
  const [keyFeedback, setKeyFeedback] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const [healthResult, setHealthResult] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [storageStats, setStorageStats] = useState<{
    totalBytes: number;
    folderCount: number;
    orphanCount: number;
    orphanBytes: number;
  } | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [storageFeedback, setStorageFeedback] = useState<string | null>(null);
  const [rssCount, setRssCount] = useState<number>(2);
  const [runningRss, setRunningRss] = useState(false);
  const [rssFeedback, setRssFeedback] = useState<string | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<StoredSocialAccount[]>([]);
  const [socialForms, setSocialForms] = useState<
    Record<"instagram" | "youtube" | "tiktok", { accountName: string; accountId: string; accessToken: string }>
  >({
    instagram: { accountName: "", accountId: "", accessToken: "" },
    youtube: { accountName: "", accountId: "", accessToken: "" },
    tiktok: { accountName: "", accountId: "", accessToken: "" },
  });
  const [busySocial, setBusySocial] = useState<string | null>(null);
  const [socialFeedback, setSocialFeedback] = useState<Record<string, { ok: boolean; text: string }>>({});

  const loadSocialAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSocialAccounts(data.accounts || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSocialAccounts();
  }, [loadSocialAccounts]);

  const handleSaveSocial = async (platform: "instagram" | "youtube" | "tiktok") => {
    const f = socialForms[platform];
    if (!f.accountName.trim() || f.accessToken.trim().length < 8) {
      setSocialFeedback((prev) => ({
        ...prev,
        [platform]: { ok: false, text: "Nama akun dan Access Token (min. 8 karakter) wajib diisi." },
      }));
      return;
    }
    setBusySocial(platform);
    try {
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          account_name: f.accountName.trim(),
          account_id: f.accountId.trim() || undefined,
          access_token: f.accessToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Gagal menyimpan akun");
      setSocialForms((prev) => ({
        ...prev,
        [platform]: { ...prev[platform], accessToken: "" },
      }));
      setSocialFeedback((prev) => ({
        ...prev,
        [platform]: { ok: true, text: "Akun sosmed terhubung & token terenkripsi." },
      }));
      await loadSocialAccounts();
    } catch (e) {
      setSocialFeedback((prev) => ({
        ...prev,
        [platform]: { ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan" },
      }));
    } finally {
      setBusySocial(null);
    }
  };

  const handleDisconnectSocial = async (platform: "instagram" | "youtube" | "tiktok") => {
    setBusySocial(platform);
    try {
      await fetch(`/api/social-accounts/${platform}`, { method: "DELETE" });
      setSocialFeedback((prev) => ({
        ...prev,
        [platform]: { ok: true, text: "Koneksi akun diputuskan." },
      }));
      await loadSocialAccounts();
    } finally {
      setBusySocial(null);
    }
  };

  const handleRunAutoDiscover = async () => {
    setRunningRss(true);
    setRssFeedback(null);
    try {
      const res = await fetch("/api/auto-discover/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: rssCount, mock: draft.mock }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menjalankan Auto-Discover RSS");
      setRssFeedback(
        `Berhasil: ${data.queuedCount || 0} draft masuk antrean render (${data.skippedCount || 0} topik duplikat dilewati). Cek menu Render/Riwayat.`
      );
    } catch (e) {
      setRssFeedback(e instanceof Error ? e.message : "Gagal Auto-Discover RSS");
    } finally {
      setRunningRss(false);
    }
  };

  const loadStorageStats = useCallback(async () => {
    setLoadingStorage(true);
    setStorageFeedback(null);
    try {
      const res = await fetch("/api/storage", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal memuat info storage");
      setStorageStats(await res.json());
    } catch (e) {
      setStorageFeedback(e instanceof Error ? e.message : "Gagal memuat storage");
    } finally {
      setLoadingStorage(false);
    }
  }, []);

  const handleCleanupOrphans = () => {
    if (!storageStats || storageStats.orphanCount === 0) return;
    setConfirmCleanupOpen(true);
  };

  const executeCleanupOrphans = async () => {
    if (!storageStats) return;
    setCleaningStorage(true);
    setStorageFeedback(null);
    try {
      const res = await fetch("/api/storage/cleanup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membersihkan folder");
      const mb = ((data.freedBytes || 0) / (1024 * 1024)).toFixed(2);
      setStorageFeedback(`Berhasil menghapus ${data.removedCount || 0} folder (${mb} MB dibebaskan).`);
      setConfirmCleanupOpen(false);
      await loadStorageStats();
    } catch (e) {
      setStorageFeedback(e instanceof Error ? e.message : "Gagal cleanup storage");
    } finally {
      setCleaningStorage(false);
    }
  };

  const [savingBrandkit, setSavingBrandkit] = useState(false);
  const [brandkitFeedback, setBrandkitFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const handleExportConfig = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      defaults: {
        preset: draft.preset,
        series: draft.series,
        aspectRatio: draft.aspectRatio,
        language: draft.language,
        slides: draft.slides,
        visualProvider: draft.visualProvider,
        voice: draft.voice,
        bgm: draft.bgm,
        bgmVolume: draft.bgmVolume,
        mock: draft.mock,
      },
      brandkit: draft.brandkit,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autocreate-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBrandkitFeedback({ ok: true, text: "Config & Brandkit diekspor ke JSON." });
  };

  const handleImportConfig = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Format JSON tidak valid.");
      }
      onUpdateDraft((prev) => ({
        ...prev,
        ...(parsed.defaults && typeof parsed.defaults === "object"
          ? {
              preset: parsed.defaults.preset || prev.preset,
              series: parsed.defaults.series || prev.series,
              aspectRatio: parsed.defaults.aspectRatio || prev.aspectRatio,
              language: parsed.defaults.language || prev.language,
              slides: Number(parsed.defaults.slides) || prev.slides,
              visualProvider: parsed.defaults.visualProvider || prev.visualProvider,
              voice: parsed.defaults.voice || prev.voice,
              bgm: parsed.defaults.bgm || prev.bgm,
              bgmVolume:
                typeof parsed.defaults.bgmVolume === "number"
                  ? parsed.defaults.bgmVolume
                  : prev.bgmVolume,
              mock:
                typeof parsed.defaults.mock === "boolean"
                  ? parsed.defaults.mock
                  : prev.mock,
            }
          : {}),
        brandkit:
          parsed.brandkit && typeof parsed.brandkit === "object"
            ? { ...DEFAULT_BRANDKIT_CONFIG, ...parsed.brandkit }
            : prev.brandkit,
      }));
      setBrandkitFeedback({
        ok: true,
        text: "Config & Brandkit berhasil diimpor! Klik Simpan ke Database jika ingin permanen.",
      });
    } catch (e) {
      setBrandkitFeedback({
        ok: false,
        text: e instanceof Error ? e.message : "Gagal membaca file JSON.",
      });
    }
  };

  const handleSaveBrandkit = async () => {
    setSavingBrandkit(true);
    setBrandkitFeedback(null);
    try {
      const res = await fetch("/api/brandkit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.brandkit),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Gagal menyimpan Brandkit");
      setBrandkitFeedback({ ok: true, text: "Brandkit tersimpan di PostgreSQL." });
    } catch (err) {
      setBrandkitFeedback({
        ok: false,
        text: err instanceof Error ? err.message : "Gagal menyimpan Brandkit",
      });
    } finally {
      setSavingBrandkit(false);
    }
  };

  const handleResetBrandkit = async () => {
    setSavingBrandkit(true);
    setBrandkitFeedback(null);
    try {
      await fetch("/api/brandkit", { method: "DELETE" });
      onUpdateDraft((prev) => ({
        ...prev,
        brandkit: DEFAULT_BRANDKIT_CONFIG,
      }));
      setBrandkitFeedback({ ok: true, text: "Brandkit direset ke default." });
    } catch {
      onUpdateDraft((prev) => ({
        ...prev,
        brandkit: DEFAULT_BRANDKIT_CONFIG,
      }));
    } finally {
      setSavingBrandkit(false);
    }
  };

  const loadProviderKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/provider-keys", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list: StoredProviderKey[] = data.keys || [];
      setStoredKeys(list);
      setModelInputs((prev) => {
        const next = { ...prev };
        for (const item of list) {
          if (item.model) {
            next[item.provider] = item.model;
          }
        }
        return next;
      });
    } catch {
      // ignore transient fetch error
    }
  }, []);

  useEffect(() => {
    loadProviderKeys();
  }, [loadProviderKeys]);

  const handleSaveProviderKey = async (provider: "gemini" | "opencode") => {
    const apiKey = keyInputs[provider].trim();
    const hasStored = storedKeys.some((k) => k.provider === provider);
    if (!hasStored && apiKey.length < 8) {
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: false, text: "API key minimal 8 karakter." },
      }));
      return;
    }
    if (apiKey.length > 0 && apiKey.length < 8) {
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: false, text: "API key minimal 8 karakter." },
      }));
      return;
    }

    setBusyProvider(provider);
    try {
      const res = await fetch("/api/provider-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey || undefined,
          model: modelInputs[provider].trim() || undefined,
          isActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Gagal menyimpan key");
      setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: true, text: data.message || "Tersimpan terenkripsi di PostgreSQL." },
      }));
      await loadProviderKeys();
    } catch (err) {
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: false, text: err instanceof Error ? err.message : "Gagal menyimpan" },
      }));
    } finally {
      setBusyProvider(null);
    }
  };

  const handleFetchModels = async (provider: "gemini" | "opencode") => {
    setBusyProvider(provider);
    try {
      const res = await fetch(`/api/provider-keys/models?provider=${provider}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengambil daftar model");
      if (Array.isArray(data.models) && data.models.length > 0) {
        setAvailableModels((prev) => ({ ...prev, [provider]: data.models }));
      }
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: {
          ok: true,
          text: `Daftar model diperbarui (${data.models?.length ?? 0} model, sumber: ${data.source}).`,
        },
      }));
    } catch (err) {
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: false, text: err instanceof Error ? err.message : "Gagal memuat model" },
      }));
    } finally {
      setBusyProvider(null);
    }
  };

  const handleTestProviderKey = async (provider: "gemini" | "opencode") => {
    setBusyProvider(provider);
    try {
      const typed = keyInputs[provider].trim();
      const res = await fetch("/api/provider-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: typed || undefined,
        }),
      });
      const data = await res.json();
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: Boolean(data.ok), text: data.message || "Selesai dicek." },
      }));
      await loadProviderKeys();
    } catch {
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: false, text: "Gagal menghubungi endpoint test key." },
      }));
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDeleteProviderKey = async (provider: "gemini" | "opencode") => {
    setBusyProvider(provider);
    try {
      await fetch(`/api/provider-keys/${provider}`, { method: "DELETE" });
      setKeyFeedback((prev) => ({
        ...prev,
        [provider]: { ok: true, text: "BYOK key dihapus (kembali ke fallback .env server)." },
      }));
      await loadProviderKeys();
    } finally {
      setBusyProvider(null);
    }
  };

  const handleCheckHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = await res.json();
      setHealthResult(
        res.ok
          ? `OK · ${data.status || "healthy"} (${data.service || "laravel-api"})`
          : `Error HTTP ${res.status}`
      );
    } catch {
      setHealthResult("Tidak dapat terhubung ke /api/health");
    } finally {
      setCheckingHealth(false);
    }
  };

  return (
    <section className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-[880px] space-y-6">
        <div>
          <h2 className="text-lg font-bold text-[#f4f4f5]">Setting Studio</h2>
          <p className="text-xs text-[#a1a1aa]">
            Kelola BYOK (Bring Your Own Key) terenkripsi di PostgreSQL, provider visual, preferensi default, panduan FAQ, dan status sistem.
          </p>
        </div>

        {/* Sub-navigation */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {(
            [
              { id: "provider", label: "Provider & BYOK" },
              { id: "defaults", label: "Preferensi Default" },
              { id: "brandkit", label: "Brandkit" },
              { id: "social", label: "Sosmed & Publish" },
              { id: "faq", label: "Alur & FAQ" },
              { id: "system", label: "Status Sistem" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                tab === item.id
                  ? "bg-[#ddf77b] text-[#181824]"
                  : "border border-white/10 bg-[#131316] text-[#a1a1aa] hover:border-white/25 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* TAB 1: PROVIDER & BYOK */}
        {tab === "provider" && (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                Provider Visual Aktif
              </p>
              {VISUAL_PROVIDERS.map((vp) => (
                <div
                  key={vp.id}
                  className="flex items-center justify-between rounded-[14px] border border-white/10 bg-[#131316] p-4"
                >
                  <div>
                    <b className="text-sm font-semibold text-[#f4f4f5]">{vp.label}</b>
                    <p className="font-mono text-[11px] text-[#a1a1aa]">{vp.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDraft((prev) => ({ ...prev, visualProvider: vp.id }))
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      draft.visualProvider === vp.id
                        ? "bg-[#ddf77b] text-[#181824]"
                        : "border border-white/10 bg-[#1a1a1f] text-[#a1a1aa] hover:text-white"
                    }`}
                  >
                    {draft.visualProvider === vp.id ? "Aktif" : "Pilih"}
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                  BYOK — Encrypted API Keys (PostgreSQL)
                </p>
                <p className="mt-0.5 text-xs text-[#a1a1aa]">
                  Key dienkripsi dengan Laravel <code className="text-[#ddf77b]">Crypt::encryptString</code> sebelum disimpan. Key asli tidak pernah dikirim balik ke browser; jika kosong, sistem otomatis fallback ke <code className="text-[#d4d4d8]">.env</code> server.
                </p>
              </div>

              {(
                [
                  {
                    id: "gemini" as const,
                    title: "Google Gemini API Key",
                    placeholder: "AIzaSy...",
                    desc: "Dipakai untuk penulisan naskah AI (Mock OFF) & Gemini Imagen.",
                  },
                  {
                    id: "opencode" as const,
                    title: "OpenCode Go API Key (Fallback LLM)",
                    placeholder: "sk-...",
                    desc: "Fallback otomatis jika Gemini limit/error atau jika Gemini kosong.",
                  },
                ] as const
              ).map((cfg) => {
                const stored = storedKeys.find((k) => k.provider === cfg.id);
                const fb = keyFeedback[cfg.id];
                const isBusy = busyProvider === cfg.id;

                return (
                  <div
                    key={cfg.id}
                    className="rounded-[14px] border border-white/10 bg-[#131316] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[#f4f4f5]">{cfg.title}</h3>
                        <p className="text-xs text-[#a1a1aa]">{cfg.desc}</p>
                      </div>
                      {stored ? (
                        <span className="rounded-full border border-[#ddf77b]/40 bg-[#ddf77b]/10 px-2.5 py-0.5 font-mono text-[11px] text-[#ddf77b]">
                          Tersimpan: {stored.masked_key}
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-[#1a1a1f] px-2.5 py-0.5 text-[11px] text-[#63636b]">
                          Pakai .env server
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <input
                        type="password"
                        value={keyInputs[cfg.id]}
                        onChange={(e) =>
                          setKeyInputs((prev) => ({ ...prev, [cfg.id]: e.target.value }))
                        }
                        placeholder={
                          stored ? `Ganti key (${stored.masked_key})` : cfg.placeholder
                        }
                        className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSaveProviderKey(cfg.id)}
                        className="rounded-lg bg-[#ddf77b] px-3.5 py-2 text-xs font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleTestProviderKey(cfg.id)}
                        className="rounded-lg border border-white/15 bg-[#1a1a1f] px-3 py-2 text-xs font-medium text-[#f4f4f5] hover:border-[#ddf77b]/50 disabled:opacity-50"
                      >
                        Test Key
                      </button>
                      {stored && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDeleteProviderKey(cfg.id)}
                          className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      )}
                    </div>

                    {/* Model Selector (Kunci Model Hemat) */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[11px] text-[#a1a1aa]">Model:</span>
                      <select
                        value={
                          availableModels[cfg.id].includes(modelInputs[cfg.id])
                            ? modelInputs[cfg.id]
                            : "__custom__"
                        }
                        onChange={(e) => {
                          if (e.target.value !== "__custom__") {
                            setModelInputs((prev) => ({ ...prev, [cfg.id]: e.target.value }));
                          }
                        }}
                        className="rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                      >
                        {availableModels[cfg.id].map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                        <option value="__custom__">Custom model...</option>
                      </select>
                      <input
                        type="text"
                        value={modelInputs[cfg.id]}
                        onChange={(e) =>
                          setModelInputs((prev) => ({ ...prev, [cfg.id]: e.target.value }))
                        }
                        placeholder="Nama model..."
                        className="min-w-[160px] flex-1 rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5 font-mono text-xs text-[#ddf77b] outline-none focus:border-[#ddf77b]/60"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleFetchModels(cfg.id)}
                        className="rounded-lg border border-white/15 bg-[#1a1a1f] px-2.5 py-1.5 text-[11px] font-medium text-[#d4d4d8] hover:border-[#ddf77b]/50 disabled:opacity-50"
                      >
                        Ambil List Model
                      </button>
                    </div>

                    {fb && (
                      <p
                        className={`text-xs ${
                          fb.ok ? "text-[#ddf77b]" : "text-rose-400"
                        }`}
                      >
                        {fb.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: PREFERENSI DEFAULT */}
        {tab === "defaults" && (
          <div className="rounded-[14px] border border-white/10 bg-[#131316] p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#f4f4f5]">Mode Mock Default</h3>
                <p className="text-xs text-[#a1a1aa]">
                  Aktifkan untuk test layout &amp; video cepat tanpa memakai token AI.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateDraft((prev) => ({ ...prev, mock: !prev.mock }))
                }
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold ${
                  draft.mock
                    ? "bg-[#ddf77b] text-[#181824]"
                    : "border border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                }`}
              >
                {draft.mock ? "Mock: ON" : "Mock: OFF"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Preset Visual Default
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        onUpdateDraft((prev) => ({ ...prev, preset: p.id }))
                      }
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        draft.preset === p.id
                          ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                          : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Rasio Default
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ASPECT_RATIOS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        onUpdateDraft((prev) => ({ ...prev, aspectRatio: r.id }))
                      }
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        draft.aspectRatio === r.id
                          ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                          : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Jumlah Slide Default
                </p>
                <div className="flex gap-1.5">
                  {SLIDE_COUNTS.map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() =>
                        onUpdateDraft((prev) => ({ ...prev, slides: cnt }))
                      }
                      className={`rounded-lg border px-3 py-1.5 font-mono text-xs ${
                        draft.slides === cnt
                          ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                          : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Bahasa Default
                </p>
                <div className="flex gap-1.5">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() =>
                        onUpdateDraft((prev) => ({ ...prev, language: l.id }))
                      }
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        draft.language === l.id
                          ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                          : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Gaya Layout Default
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SERIES_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        onUpdateDraft((prev) => ({ ...prev, series: s.id }))
                      }
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                        draft.series === s.id
                          ? "border-[#ddf77b] bg-[#ddf77b]/15 text-[#ddf77b]"
                          : "border-white/10 bg-[#1a1a1f] text-[#a1a1aa]"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Voiceover TTS Default
                </p>
                <select
                  value={draft.voice}
                  onChange={(e) =>
                    onUpdateDraft((prev) => ({ ...prev, voice: e.target.value }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa]">
                  Musik Latar (BGM) Default
                </p>
                <select
                  value={draft.bgm}
                  onChange={(e) =>
                    onUpdateDraft((prev) => ({ ...prev, bgm: e.target.value }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                >
                  {BGM_OPTIONS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ALUR & FAQ */}
        {tab === "faq" && (
          <div className="space-y-4">
            <div className="rounded-[14px] border border-white/10 bg-[#131316] p-4 space-y-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#ddf77b]">
                Alur Penggunaan Singkat
              </span>
              <ol className="grid grid-cols-1 gap-2 text-xs text-[#d4d4d8] sm:grid-cols-2">
                <li className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                  <b>1. Mulai Brief</b> — Pilih <i>Dari topik</i>, <i>Remix</i>, atau <i>Link</i> lalu kirim topik/URL.
                </li>
                <li className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                  <b>2. Pilih Opsi</b> — Klik Format, Rasio, Preset, dan Jumlah Slide di kartu terstruktur.
                </li>
                <li className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                  <b>3. Konfirmasi</b> — Cek ringkasan lalu klik <i>Gas Generate Sekarang</i>.
                </li>
                <li className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                  <b>4. Preview &amp; ZIP</b> — Buka panel preview di kanan, salin caption, atau unduh ZIP.
                </li>
              </ol>
            </div>

            <div className="space-y-2">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div
                    key={item.q}
                    className="rounded-[14px] border border-white/10 bg-[#131316] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-[#f4f4f5] hover:bg-white/[0.03]"
                    >
                      <span>{item.q}</span>
                      <span className="ml-3 text-[#ddf77b]">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-white/5 px-4 py-3 text-xs leading-relaxed whitespace-pre-line text-[#d4d4d8]">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB: BRANDKIT */}
        {tab === "brandkit" && (
          <div className="space-y-5">
            <div className="rounded-[14px] border border-white/10 bg-[#131316] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#f4f4f5]">
                    Input Brandkit Studio
                  </h3>
                  <p className="text-xs text-[#a1a1aa]">
                    Simpan identitas brand (nama, handle, warna, font, logo, dan tone) ke PostgreSQL. Saat aktif, otomatis diterapkan ke Renderer (slide/poster/video) dan watermark Video Editor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDraft((prev) => ({
                      ...prev,
                      brandkit: {
                        ...prev.brandkit,
                        enabled: !prev.brandkit.enabled,
                      },
                    }))
                  }
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                    draft.brandkit.enabled
                      ? "bg-[#ddf77b] text-[#181824]"
                      : "border border-white/10 bg-[#1a1a1f] text-[#a1a1aa] hover:text-white"
                  }`}
                >
                  {draft.brandkit.enabled ? "Brandkit: AKTIF" : "Brandkit: NONAKTIF"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Nama Brand / Channel
                  </label>
                  <input
                    type="text"
                    value={draft.brandkit.brandName}
                    onChange={(e) =>
                      onUpdateDraft((prev) => ({
                        ...prev,
                        brandkit: { ...prev.brandkit, brandName: e.target.value },
                      }))
                    }
                    placeholder="Contoh: Autocreate Studio"
                    className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Handle / Watermark
                  </label>
                  <input
                    type="text"
                    value={draft.brandkit.handle}
                    onChange={(e) =>
                      onUpdateDraft((prev) => ({
                        ...prev,
                        brandkit: { ...prev.brandkit, handle: e.target.value },
                      }))
                    }
                    placeholder="Contoh: @autocreate.id"
                    className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Tagline / CTA Default
                  </label>
                  <input
                    type="text"
                    value={draft.brandkit.tagline}
                    onChange={(e) =>
                      onUpdateDraft((prev) => ({
                        ...prev,
                        brandkit: { ...prev.brandkit, tagline: e.target.value },
                      }))
                    }
                    placeholder="Contoh: Simpan & bagikan jika bermanfaat"
                    className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                    Font Brand
                  </label>
                  <select
                    value={draft.brandkit.fontFamily}
                    onChange={(e) =>
                      onUpdateDraft((prev) => ({
                        ...prev,
                        brandkit: { ...prev.brandkit, fontFamily: e.target.value },
                      }))
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] outline-none focus:border-[#ddf77b]/60"
                  >
                    {BRANDKIT_FONT_OPTIONS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(
                  [
                    { key: "primaryColor" as const, label: "Warna Utama (Primary)" },
                    { key: "secondaryColor" as const, label: "Warna Latar (Secondary)" },
                    { key: "accentColor" as const, label: "Warna Teks / Aksen" },
                  ] satisfies Array<{ key: keyof BrandkitConfig; label: string }>
                ).map((c) => {
                  const val = String(draft.brandkit[c.key] || "#000000");
                  return (
                    <div key={c.key} className="space-y-1.5">
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                        {c.label}
                      </label>
                      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5">
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : "#ddf77b"}
                          onChange={(e) =>
                            onUpdateDraft((prev) => ({
                              ...prev,
                              brandkit: { ...prev.brandkit, [c.key]: e.target.value },
                            }))
                          }
                          className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                        <input
                          type="text"
                          value={val}
                          onChange={(e) =>
                            onUpdateDraft((prev) => ({
                              ...prev,
                              brandkit: { ...prev.brandkit, [c.key]: e.target.value },
                            }))
                          }
                          className="w-full bg-transparent font-mono text-xs text-[#f4f4f5] outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Logo Upload */}
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                  Logo Brand (PNG / JPG / WEBP / SVG)
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {draft.brandkit.logoDataUrl ? (
                    <img
                      src={draft.brandkit.logoDataUrl}
                      alt="Logo Brand"
                      className="h-12 w-12 rounded-xl border border-white/15 bg-[#1a1a1f] object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#1a1a1f] text-[10px] text-[#63636b]">
                      Logo
                    </div>
                  )}

                  <label className="cursor-pointer rounded-lg border border-white/15 bg-[#1a1a1f] px-3 py-2 text-xs font-semibold text-[#f4f4f5] hover:border-[#ddf77b]/60">
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const dataUrl = await readImageFileAsDataUrl(file);
                          onUpdateDraft((prev) => ({
                            ...prev,
                            brandkit: { ...prev.brandkit, logoDataUrl: dataUrl },
                          }));
                        } catch {
                          // ignore invalid image
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {draft.brandkit.logoDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateDraft((prev) => ({
                          ...prev,
                          brandkit: { ...prev.brandkit, logoDataUrl: null },
                        }))
                      }
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20"
                    >
                      Hapus Logo
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#63636b]">
                  Catatan Gaya &amp; Tone of Voice
                </label>
                <textarea
                  rows={3}
                  value={draft.brandkit.notes}
                  onChange={(e) =>
                    onUpdateDraft((prev) => ({
                      ...prev,
                      brandkit: { ...prev.brandkit, notes: e.target.value },
                    }))
                  }
                  placeholder="Contoh: Bahasa lugas, santai tapi kredibel, hindari jargon berlebihan, selalu tutup dengan CTA singkat."
                  className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                />
              </div>

              {/* Mini Preview & Reset */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div
                  className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-2.5"
                  style={{
                    backgroundColor: draft.brandkit.secondaryColor || "#181824",
                    color: draft.brandkit.accentColor || "#f4f4f5",
                  }}
                >
                  {draft.brandkit.logoDataUrl && (
                    <img
                      src={draft.brandkit.logoDataUrl}
                      alt="Preview"
                      className="h-7 w-7 rounded-md object-contain"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold"
                        style={{ color: draft.brandkit.primaryColor || "#ddf77b" }}
                      >
                        {draft.brandkit.brandName || "Nama Brand"}
                      </span>
                      {draft.brandkit.handle && (
                        <span className="text-[11px] opacity-75">
                          {draft.brandkit.handle}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] opacity-80">
                      {draft.brandkit.tagline || "Tagline / CTA default"} · {draft.brandkit.fontFamily}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {brandkitFeedback && (
                    <span
                      className={`text-xs ${
                        brandkitFeedback.ok ? "text-[#ddf77b]" : "text-red-300"
                      }`}
                    >
                      {brandkitFeedback.text}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleExportConfig}
                    className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#d4d4d8] hover:border-white/25 hover:text-white"
                  >
                    Export JSON
                  </button>
                  <label className="cursor-pointer rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#d4d4d8] hover:border-white/25 hover:text-white">
                    Import JSON
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        handleImportConfig(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingBrandkit}
                    onClick={handleResetBrandkit}
                    className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-2 text-xs text-[#a1a1aa] hover:border-white/25 hover:text-white disabled:opacity-50"
                  >
                    Reset Brandkit
                  </button>
                  <button
                    type="button"
                    disabled={savingBrandkit}
                    onClick={handleSaveBrandkit}
                    className="rounded-lg bg-[#ddf77b] px-4 py-2 text-xs font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
                  >
                    {savingBrandkit ? "Menyimpan..." : "Simpan ke Database"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SOSMED & AUTO-PUBLISH */}
        {tab === "social" && (
          <div className="space-y-4">
            <div className="rounded-[14px] border border-white/10 bg-[#131316] p-4 text-xs text-[#a1a1aa]">
              Hubungkan akun sosmed dengan Access Token resmi untuk mengaktifkan tombol <b className="text-[#ddf77b]">Publish Sosmed</b> di panel Preview. Catatan: Instagram &amp; TikTok membutuhkan <code className="text-[#f4f4f5]">PUBLIC_BASE_URL</code> (HTTPS publik) di <code className="text-[#f4f4f5]">.env</code>; YouTube Shorts mengunggah file MP4 langsung.
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {(
                [
                  {
                    id: "instagram",
                    title: "Instagram Business",
                    subtitle: "Graph API v21.0 (Reels & Feed)",
                    idLabel: "IG Business User ID",
                    idPlaceholder: "contoh: 17841400...",
                  },
                  {
                    id: "youtube",
                    title: "YouTube Shorts",
                    subtitle: "YouTube Data API v3 (OAuth Token)",
                    idLabel: "Channel ID (Opsional)",
                    idPlaceholder: "contoh: UC...",
                  },
                  {
                    id: "tiktok",
                    title: "TikTok",
                    subtitle: "Content Posting API v2",
                    idLabel: "Open ID (Opsional)",
                    idPlaceholder: "opsional",
                  },
                ] as const
              ).map((plat) => {
                const stored = socialAccounts.find((a) => a.platform === plat.id);
                const form = socialForms[plat.id];
                const fb = socialFeedback[plat.id];
                return (
                  <div
                    key={plat.id}
                    className="flex flex-col justify-between rounded-[14px] border border-white/10 bg-[#131316] p-4 space-y-3"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-[#f4f4f5]">{plat.title}</h3>
                          <p className="text-[11px] text-[#a1a1aa]">{plat.subtitle}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            stored
                              ? "bg-[#ddf77b]/15 text-[#ddf77b]"
                              : "bg-white/5 text-[#63636b]"
                          }`}
                        >
                          {stored ? "Terhubung" : "Belum"}
                        </span>
                      </div>

                      {stored && (
                        <div className="rounded-lg border border-white/10 bg-[#0e0e10] p-2.5 text-[11px]">
                          <p className="font-semibold text-[#f4f4f5]">{stored.account_name}</p>
                          <p className="font-mono text-[#a1a1aa]">{stored.masked_token}</p>
                        </div>
                      )}

                      <input
                        type="text"
                        value={form.accountName}
                        onChange={(e) =>
                          setSocialForms((prev) => ({
                            ...prev,
                            [plat.id]: { ...prev[plat.id], accountName: e.target.value },
                          }))
                        }
                        placeholder="Nama Akun / Brand"
                        className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                      />
                      <input
                        type="text"
                        value={form.accountId}
                        onChange={(e) =>
                          setSocialForms((prev) => ({
                            ...prev,
                            [plat.id]: { ...prev[plat.id], accountId: e.target.value },
                          }))
                        }
                        placeholder={`${plat.idLabel} (${plat.idPlaceholder})`}
                        className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                      />
                      <input
                        type="password"
                        value={form.accessToken}
                        onChange={(e) =>
                          setSocialForms((prev) => ({
                            ...prev,
                            [plat.id]: { ...prev[plat.id], accessToken: e.target.value },
                          }))
                        }
                        placeholder="Paste Access Token..."
                        className="w-full rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs text-[#f4f4f5] placeholder-[#63636b] outline-none focus:border-[#ddf77b]/60"
                      />
                      {fb && (
                        <p className={`text-[11px] ${fb.ok ? "text-[#ddf77b]" : "text-rose-400"}`}>
                          {fb.text}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busySocial === plat.id}
                        onClick={() => handleSaveSocial(plat.id)}
                        className="flex-1 rounded-lg bg-[#ddf77b] px-3 py-1.5 text-xs font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
                      >
                        {busySocial === plat.id ? "Menyimpan..." : "Simpan Koneksi"}
                      </button>
                      {stored && (
                        <button
                          type="button"
                          disabled={busySocial === plat.id}
                          onClick={() => handleDisconnectSocial(plat.id)}
                          className="rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          Putus
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: STATUS SISTEM */}
        {tab === "system" && (
          <div className="rounded-[14px] border border-white/10 bg-[#131316] p-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                <span className="block text-[#63636b]">Arsitektur</span>
                <b className="mt-0.5 block text-[#f4f4f5]">Next.js + Laravel + PG + Remotion</b>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                <span className="block text-[#63636b]">Total Project</span>
                <b className="mt-0.5 block font-mono text-[#ddf77b]">{totalJobs}</b>
              </div>
              <div className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                <span className="block text-[#63636b]">Selesai Render</span>
                <b className="mt-0.5 block font-mono text-[#ddf77b]">{completedJobs}</b>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={checkingHealth}
                onClick={handleCheckHealth}
                className="rounded-lg bg-[#ddf77b] px-3.5 py-2 text-xs font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
              >
                {checkingHealth ? "Mengecek..." : "Cek Koneksi API Laravel"}
              </button>
              {healthResult && (
                <span className="font-mono text-xs text-[#d4d4d8]">{healthResult}</span>
              )}
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#f4f4f5]">
                    Manajemen Storage Output (outputs/)
                  </h4>
                  <p className="text-[11px] text-[#a1a1aa]">
                    Pantau ukuran folder hasil render dan bersihkan folder yatim (orphan) yang tidak lagi terdaftar di PostgreSQL.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loadingStorage}
                    onClick={loadStorageStats}
                    className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3 py-1.5 text-xs font-medium text-[#f4f4f5] hover:border-white/25 disabled:opacity-50"
                  >
                    {loadingStorage ? "Mengecek..." : "Cek Ukuran Storage"}
                  </button>
                  {storageStats && storageStats.orphanCount > 0 && (
                    <button
                      type="button"
                      disabled={cleaningStorage}
                      onClick={handleCleanupOrphans}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      {cleaningStorage
                        ? "Membersihkan..."
                        : `Bersihkan ${storageStats.orphanCount} Folder Yatim`}
                    </button>
                  )}
                </div>
              </div>

              {storageStats && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                  <div className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                    <span className="block text-[#63636b]">Total Pemakaian Disk</span>
                    <b className="mt-0.5 block font-mono text-[#ddf77b]">
                      {(storageStats.totalBytes / (1024 * 1024)).toFixed(2)} MB
                    </b>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                    <span className="block text-[#63636b]">Total Folder Output</span>
                    <b className="mt-0.5 block font-mono text-[#f4f4f5]">{storageStats.folderCount}</b>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-[#1a1a1f] p-3">
                    <span className="block text-[#63636b]">Folder Yatim (Orphan)</span>
                    <b className="mt-0.5 block font-mono text-amber-300">
                      {storageStats.orphanCount} ({(storageStats.orphanBytes / (1024 * 1024)).toFixed(2)} MB)
                    </b>
                  </div>
                </div>
              )}

              {storageFeedback && (
                <p className="text-xs text-[#ddf77b]">{storageFeedback}</p>
              )}
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#f4f4f5]">
                    Auto-Discover RSS → Render Draft
                  </h4>
                  <p className="text-[11px] text-[#a1a1aa]">
                    Ambil berita terbaru dari <code className="text-[#ddf77b]">feeds.config.json</code> lalu langsung antrekan render Carousel + Poster. Jadwal harian otomatis: <code className="text-[#d4d4d8]">07:00</code> (<code className="text-[#d4d4d8]">app:auto-discover-render</code>).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={rssCount}
                    onChange={(e) => setRssCount(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1.5 text-xs text-[#f4f4f5] outline-none"
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n} topik
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={runningRss}
                    onClick={handleRunAutoDiscover}
                    className="rounded-lg bg-[#ddf77b] px-3 py-1.5 text-xs font-bold text-[#181824] hover:opacity-90 disabled:opacity-50"
                  >
                    {runningRss ? "Mengambil RSS..." : "Ambil RSS & Render Draft"}
                  </button>
                </div>
              </div>
              {rssFeedback && (
                <p className="text-xs text-[#ddf77b]">{rssFeedback}</p>
              )}
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirmCleanupOpen}
        title="Bersihkan Folder Yatim?"
        description={`Sebanyak ${storageStats?.orphanCount || 0} folder output yatim (${((storageStats?.orphanBytes || 0) / (1024 * 1024)).toFixed(2)} MB) yang tidak terdaftar di PostgreSQL akan dihapus permanen.`}
        confirmLabel="Ya, Bersihkan"
        busy={cleaningStorage}
        onConfirm={executeCleanupOrphans}
        onCancel={() => setConfirmCleanupOpen(false)}
      />
    </section>
  );
}
