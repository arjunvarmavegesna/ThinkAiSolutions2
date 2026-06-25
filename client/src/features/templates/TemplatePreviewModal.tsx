/**
 * Read-only preview of a stored template, rendered in a Dialog. Reuses the same
 * WhatsApp-style TemplatePreview the editor uses, fed from the template's stored
 * body / synced components via `toPreviewModel`. No network, no mutation.
 */
import type { TemplateDTO } from '@thinkai/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { TemplatePreview } from './TemplatePreview';
import { toPreviewModel } from './templateBody';

export function TemplatePreviewModal({
  template,
  onClose,
}: {
  template: TemplateDTO | null;
  onClose: () => void;
}): JSX.Element {
  const model = template ? toPreviewModel(template) : null;

  return (
    <Dialog open={Boolean(template)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {template && model && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate font-mono text-base">{template.name}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                <Badge variant="outline" className="capitalize">
                  {template.category}
                </Badge>
                <Badge variant="outline" className="uppercase">
                  {template.language}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {template.status}
                </Badge>
              </DialogDescription>
            </DialogHeader>

            <TemplatePreview
              headerType={model.headerType}
              headerText={model.headerText}
              body={model.body}
              placeholders={model.placeholders}
              // No stored sample values here — show raw {{n}} placeholders as-is.
              samples={model.placeholders.map(() => '')}
              footer={model.footer}
              buttons={model.buttons}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
