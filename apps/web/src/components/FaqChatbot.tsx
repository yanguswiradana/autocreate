"use client";

import { useEffect, useRef, useState } from "react";
import { FAQ_ITEMS, FaqEntry } from "@/types/studio";

interface Message {
  id: string;
  who: "bot" | "user";
  text: string;
  showChips?: boolean;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "welcome",
    who: "bot",
    text: "Halo! Pilih salah satu topik di bawah ini untuk melihat panduannya:",
    showChips: true,
  },
];

export function FaqChatbot({ isDark = true }: { isDark?: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const selectFaq = (item: FaqEntry) => {
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, who: "user", text: item.q },
      {
        id: `b-${Date.now() + 1}`,
        who: "bot",
        text: item.a,
        showChips: true,
      },
    ]);
  };

  const resetFaq = () => {
    setMessages(INITIAL_MESSAGES);
  };

  const panelCls = isDark
    ? "bg-[#0e0e10] border-white/10 text-[#f4f4f5]"
    : "bg-white border-slate-200 text-slate-900";
  const surfaceCls = isDark
    ? "bg-[#131316] border-white/10 text-[#e4e4e7]"
    : "bg-slate-50 border-slate-200 text-slate-800";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed right-5 bottom-5 z-40 inline-flex h-11 items-center gap-2 rounded-full border border-[#ddf77b]/40 bg-[#ddf77b] px-4 text-xs font-bold text-[#181824] shadow-xl transition hover:-translate-y-0.5 hover:opacity-95"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>FAQ &amp; Alur</span>
      </button>

      {open && (
        <div
          className={`fixed right-5 bottom-20 z-50 flex h-[480px] w-[370px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelCls}`}
        >
          <div className={`flex items-center justify-between border-b px-4 py-3 ${surfaceCls}`}>
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[#ddf77b] text-xs font-extrabold text-[#181824]">
                ?
              </div>
              <div>
                <div className="text-sm font-bold">Panduan &amp; FAQ</div>
                <div className="text-[11px] text-[#a1a1aa]">Klik topik yang ingin ditanyakan</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs text-[#a1a1aa] hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <div
                  className={`max-w-[88%] whitespace-pre-line rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.who === "user"
                      ? "self-end rounded-br-sm bg-[#ddf77b] font-semibold text-[#181824]"
                      : `self-start rounded-bl-sm border ${surfaceCls}`
                  }`}
                >
                  {m.text}
                </div>
                {m.showChips && (
                  <div className="flex flex-wrap gap-1.5">
                    {FAQ_ITEMS.map((item) => (
                      <button
                        key={`${m.id}-${item.q}`}
                        type="button"
                        onClick={() => selectFaq(item)}
                        className="rounded-full border border-white/10 bg-[#1a1a1f] px-2.5 py-1 text-left text-[11px] text-[#d4d4d8] transition hover:border-[#ddf77b]/60 hover:text-[#ddf77b]"
                      >
                        {item.q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 text-[11px] text-[#a1a1aa]">
            <span>Pilih langsung topik di atas</span>
            <button
              type="button"
              onClick={resetFaq}
              className="rounded-lg border border-white/10 bg-[#1a1a1f] px-2.5 py-1 text-[11px] font-medium text-[#f4f4f5] hover:border-[#ddf77b]/50"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </>
  );
}
