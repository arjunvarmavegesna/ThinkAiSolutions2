/**
 * Tag input with autocomplete from the tenant's tag palette + colored chips. Reused anywhere a
 * contact's tags are edited (add modal, edit modal, import defaults). Pure presentational state.
 */
import { useMemo, useState } from 'react';
import type { ContactTag } from '@thinkai/shared';

const DEFAULT_COLOR = '#2563eb';

/** Resolve a tag's chip color from the palette (falls back to the brand blue). */
export function tagColor(name: string, palette: ContactTag[]): string {
  return palette.find((t) => t.name === name)?.color ?? DEFAULT_COLOR;
}

/** A single colored tag chip, optionally removable. */
export function TagChip({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
}): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="leading-none hover:opacity-70" aria-label={`Remove ${name}`}>
          ×
        </button>
      )}
    </span>
  );
}

export function TagPicker({
  value,
  onChange,
  palette,
  placeholder = 'Add a tag…',
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  palette: ContactTag[];
  placeholder?: string;
}): JSX.Element {
  const [input, setInput] = useState('');

  const add = (raw: string): void => {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setInput('');
  };
  const remove = (tag: string): void => onChange(value.filter((t) => t !== tag));

  const suggestions = useMemo(
    () =>
      palette
        .filter((p) => !value.includes(p.name) && p.name.toLowerCase().includes(input.toLowerCase()))
        .slice(0, 6),
    [palette, value, input],
  );

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-1.5">
        {value.map((t) => (
          <TagChip key={t} name={t} color={tagColor(t, palette)} onRemove={() => remove(t)} />
        ))}
      </div>
      <div className="relative">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(input);
            }
          }}
          placeholder={placeholder}
          className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        {input.trim().length > 0 && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => add(s.name)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
