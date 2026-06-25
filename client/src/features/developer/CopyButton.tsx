/** Tiny copy-to-clipboard button with a transient "Copied!" confirmation. */
import { useState } from 'react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (e.g. insecure context) — silently no-op.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}
