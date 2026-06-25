/**
 * Banner shown above the composer indicating whether the 24h service window is
 * open. When open it shows a subtle countdown; when closed it explains why
 * free-text replies are disabled and that a template must be used to re-open.
 */
import type { ServiceWindowState } from '../hooks/useServiceWindow';
import { formatWindowRemaining } from '../hooks/useServiceWindow';

interface WindowStatusBannerProps {
  window: ServiceWindowState;
}

export function WindowStatusBanner({ window }: WindowStatusBannerProps) {
  if (window.open) {
    return (
      <div className="flex items-center gap-2 border-t border-success/20 bg-success/10 px-4 py-2 text-xs text-success-emphasis">
        <span className="inline-block h-2 w-2 rounded-full bg-success" />
        <span>Service window open · {formatWindowRemaining(window.msRemaining)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-t border-warning/20 bg-warning/10 px-4 py-2 text-xs text-warning-emphasis">
      <span className="inline-block h-2 w-2 rounded-full bg-warning" />
      <span>
        Service window closed. Free-text replies are disabled — send an approved
        template to re-open the conversation.
      </span>
    </div>
  );
}
