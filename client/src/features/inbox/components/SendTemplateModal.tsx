/**
 * Modal to start (or re-open) a conversation by sending an approved template.
 * Collects a destination phone (E.164), a chosen template, and its positional
 * body variables, then POSTs /api/inbox/send-template via the send hook.
 *
 * Positional variables: index 0 -> {{1}}. We trim and require every declared
 * variable to be filled before enabling Send.
 */
import { useEffect, useMemo, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import type { SendTemplateRequest, TemplateDTO } from '@thinkai/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApprovedTemplates } from '../hooks/useApprovedTemplates';
import { resolveVariableCount, TemplateVariableForm } from './TemplateVariableForm';

interface SendTemplateModalProps {
  open: boolean;
  /** Pre-fill the destination phone when launched from an existing thread. */
  initialPhone?: string;
  sending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (req: SendTemplateRequest) => Promise<void>;
}

/** Shared select styling (no Select primitive in the system — match the Input look). */
const selectCls =
  'flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50';

/** Loose E.164 check: leading + and 8–15 digits. */
function isLikelyE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

export function SendTemplateModal({
  open,
  initialPhone,
  sending,
  error,
  onClose,
  onSubmit,
}: SendTemplateModalProps): JSX.Element {
  // Only fetch templates while the modal is open.
  const { templates, loading: templatesLoading, error: templatesError } = useApprovedTemplates(open);

  const [toPhone, setToPhone] = useState(initialPhone ?? '');
  const [templateName, setTemplateName] = useState('');
  const [variables, setVariables] = useState<string[]>([]);

  // Reset form state each time the modal (re)opens.
  useEffect(() => {
    if (open) {
      setToPhone(initialPhone ?? '');
      setTemplateName('');
      setVariables([]);
    }
  }, [open, initialPhone]);

  const selectedTemplate: TemplateDTO | undefined = useMemo(
    () => templates.find((t) => t.name === templateName),
    [templates, templateName],
  );

  // When the selected template changes, size the variable array to its count.
  useEffect(() => {
    if (!selectedTemplate) {
      setVariables([]);
      return;
    }
    const count = resolveVariableCount(selectedTemplate);
    setVariables(Array.from({ length: count }, () => ''));
  }, [selectedTemplate]);

  const phoneValid = isLikelyE164(toPhone);
  const requiredCount = selectedTemplate ? resolveVariableCount(selectedTemplate) : 0;
  const allVarsFilled =
    variables.length >= requiredCount &&
    variables.slice(0, requiredCount).every((v) => v.trim().length > 0);
  const canSubmit = !sending && phoneValid && Boolean(selectedTemplate) && allVarsFilled;

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || !selectedTemplate) return;
    const req: SendTemplateRequest = {
      toPhone: toPhone.trim(),
      templateName: selectedTemplate.name,
      languageCode: selectedTemplate.language,
      variables: variables.slice(0, requiredCount).map((v) => v.trim()),
    };
    await onSubmit(req);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Send template</DialogTitle>
          <DialogDescription>Start or re-open a conversation with an approved template.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-emphasis">
              {error}
            </p>
          )}

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">To (E.164)</span>
            <Input
              type="tel"
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value)}
              placeholder="+919812345678"
            />
            {toPhone.length > 0 && !phoneValid && (
              <span className="text-[11px] text-destructive-emphasis">
                Enter a valid number in E.164 format (e.g. +919812345678).
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Template</span>
            <select
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              disabled={templatesLoading}
              className={selectCls}
            >
              <option value="">{templatesLoading ? 'Loading templates…' : 'Select a template'}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.language} · {t.category})
                </option>
              ))}
            </select>
            {templatesError && <span className="text-[11px] text-destructive-emphasis">{templatesError}</span>}
            {!templatesLoading && !templatesError && templates.length === 0 && (
              <span className="text-[11px] text-muted-foreground">No approved templates available.</span>
            )}
          </label>

          {selectedTemplate?.body && (
            <div className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Preview</p>
              <p className="whitespace-pre-wrap">{selectedTemplate.body}</p>
            </div>
          )}

          {selectedTemplate && (
            <TemplateVariableForm template={selectedTemplate} values={variables} onChange={setVariables} />
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            <SendHorizontal />
            {sending ? 'Sending…' : 'Send template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
