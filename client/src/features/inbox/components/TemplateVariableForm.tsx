/**
 * Renders one text input per positional body variable a template expects
 * (variableCount, falling back to a render of {{1}}..{{n}} found in the body).
 * Values are POSITIONAL — index 0 maps to {{1}} and so on — matching the server
 * which maps input.variables to the Meta template body components in order.
 */
import type { TemplateDTO } from '@thinkai/shared';
import { Input } from '@/components/ui/input';

interface TemplateVariableFormProps {
  template: TemplateDTO;
  values: string[];
  onChange: (values: string[]) => void;
}

/**
 * Determine how many positional variables to collect. Prefer the server-provided
 * variableCount; otherwise infer from the highest {{n}} placeholder in the body.
 */
export function resolveVariableCount(template: TemplateDTO): number {
  if (typeof template.variableCount === 'number' && template.variableCount >= 0) {
    return template.variableCount;
  }
  if (!template.body) return 0;
  const matches = template.body.match(/\{\{\s*(\d+)\s*\}\}/g);
  if (!matches) return 0;
  let max = 0;
  for (const token of matches) {
    const n = Number(token.replace(/[^\d]/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function TemplateVariableForm({
  template,
  values,
  onChange,
}: TemplateVariableFormProps) {
  const count = resolveVariableCount(template);

  if (count === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This template has no variables. It will be sent as-is.
      </p>
    );
  }

  function update(index: number, next: string): void {
    const copy = values.slice();
    copy[index] = next;
    onChange(copy);
  }

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <label key={i} className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{`Variable {{${i + 1}}}`}</span>
          <Input
            type="text"
            value={values[i] ?? ''}
            onChange={(e) => update(i, e.target.value)}
            placeholder={`Value for {{${i + 1}}}`}
          />
        </label>
      ))}
    </div>
  );
}
