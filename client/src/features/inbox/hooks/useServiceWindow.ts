/**
 * Tracks whether a conversation's 24h service window is currently open and how
 * long remains. The server already computes `windowOpen` at fetch time, but the
 * window can lapse between polls, so we re-evaluate against a live clock that
 * ticks every second. Free-text replies are only allowed while open.
 */
import { useEffect, useState } from 'react';
import type { ConversationDTO } from '@thinkai/shared';

export interface ServiceWindowState {
  /** True while now < windowExpiresAt. */
  open: boolean;
  /** Ms until the window closes (0 when closed). */
  msRemaining: number;
  /** Epoch ms when the window closes, or null when no conversation is selected. */
  expiresAt: number | null;
}

/** Format a positive ms duration as a compact "Xh Ym" / "Ym" / "<1m" label. */
export function formatWindowRemaining(msRemaining: number): string {
  if (msRemaining <= 0) return 'closed';
  const totalMinutes = Math.floor(msRemaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m left`;
  return '<1m left';
}

export function useServiceWindow(
  conversation: ConversationDTO | null,
): ServiceWindowState {
  const expiresAt = conversation ? conversation.windowExpiresAt : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt === null) return;
    // Tick once per second to keep the countdown + open flag fresh.
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (expiresAt === null) {
    return { open: false, msRemaining: 0, expiresAt: null };
  }

  const msRemaining = Math.max(0, expiresAt - now);
  return { open: msRemaining > 0, msRemaining, expiresAt };
}
