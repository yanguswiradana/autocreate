"use client";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Ya, Lanjutkan",
  cancelLabel = "Batal",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={() => {
        if (!busy) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl border border-white/15 bg-[#131316] p-5 text-[#f4f4f5] shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
              danger
                ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                : "bg-[#ddf77b]/15 text-[#ddf77b] border border-[#ddf77b]/30"
            }`}
          >
            !
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="text-sm font-bold text-[#f4f4f5]">{title}</h3>
            <p className="break-words text-xs leading-relaxed text-[#a1a1aa]">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-[#1a1a1f] px-3.5 py-1.5 text-xs font-medium text-[#d4d4d8] transition hover:border-white/25 hover:text-white disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
              danger
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "bg-[#ddf77b] text-[#181824] hover:opacity-90"
            }`}
          >
            {busy ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
