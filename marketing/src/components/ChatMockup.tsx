/**
 * A self-contained WhatsApp conversation mockup used in the hero. Pure JSX + Tailwind (no
 * images), so it stays crisp at any size and ships nothing to download. It shows a verified
 * business sending an approved utility *template* (an appointment reminder) with quick-reply
 * buttons — communicating at a glance exactly what the platform does.
 */

function VerifiedTick() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-sky-500" fill="currentColor" aria-hidden="true">
      <path d="M10 1.5a2.1 2.1 0 0 1 1.6.74l.83.97 1.27-.13a2.1 2.1 0 0 1 2.3 2.3l-.13 1.27.97.83a2.1 2.1 0 0 1 0 3.18l-.97.83.13 1.27a2.1 2.1 0 0 1-2.3 2.3l-1.27-.13-.83.97a2.1 2.1 0 0 1-3.18 0l-.83-.97-1.27.13a2.1 2.1 0 0 1-2.3-2.3l.13-1.27-.97-.83a2.1 2.1 0 0 1 0-3.18l.97-.83-.13-1.27a2.1 2.1 0 0 1 2.3-2.3l1.27.13.83-.97A2.1 2.1 0 0 1 10 1.5Zm3.03 6.01a.9.9 0 0 0-1.3-1.24l-2.6 2.72-1-1a.9.9 0 1 0-1.27 1.27l1.65 1.65a.9.9 0 0 0 1.29-.02l3.23-3.38Z" />
    </svg>
  );
}

function DoubleCheck() {
  return (
    <svg viewBox="0 0 18 12" className="h-3.5 w-4 text-sky-500" fill="none" aria-hidden="true">
      <path d="M1 6.5 4 9.5 10.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 9 7 9.5 13.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ChatMockup() {
  return (
    <div className="animate-pop-in [animation-delay:240ms]">
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-chat ring-1 ring-black/5">
        {/* Chat header */}
        <div className="flex items-center gap-3 bg-brand-700 px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
            CC
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-sm font-semibold">CityCare Clinic</span>
              <VerifiedTick />
            </div>
            <span className="text-xs text-brand-100">Business account · online</span>
          </div>
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-brand-100" fill="currentColor" aria-hidden="true">
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2Z" />
          </svg>
        </div>

        {/* Conversation body — WhatsApp's signature warm beige canvas */}
        <div className="space-y-3 bg-[#efe7dd] px-4 py-5 bg-dotgrid">
          <div className="mx-auto w-fit rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-slate-500">
            Today
          </div>

          {/* Outbound template message bubble */}
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3.5 py-2.5 shadow-sm">
            <p className="text-[13px] font-semibold text-ink">Appointment reminder</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
              Hi Aarav, this is a reminder of your appointment with Dr. Mehta on
              <span className="font-semibold"> Thu, 12 June at 4:30 PM</span>. Reply below to confirm.
            </p>
            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
              <span>4:02 PM</span>
              <DoubleCheck />
            </div>
          </div>

          {/* Quick-reply buttons (template buttons) */}
          <div className="ml-auto flex max-w-[85%] flex-col gap-1.5">
            <button className="rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-brand-700 shadow-sm">
              ✓ Confirm
            </button>
            <button className="rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-brand-700 shadow-sm">
              Reschedule
            </button>
          </div>

          {/* Inbound reply */}
          <div className="mr-auto max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm">
            <p className="text-[13px] leading-relaxed text-slate-700">Confirm ✅</p>
            <div className="mt-1 text-right text-[10px] text-slate-400">4:05 PM</div>
          </div>
        </div>

        {/* Composer */}
        <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5">
          <div className="flex-1 rounded-full bg-slate-100 px-3 py-2 text-[13px] text-slate-400">
            Type a message
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.39 10l12.6 2-12.6 2 .01 6.4Z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
