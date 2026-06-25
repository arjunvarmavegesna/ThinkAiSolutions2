import { useEffect } from 'react';

const SUFFIX = 'ThinkAiSolutions';

/**
 * Tiny per-page <title> setter. Avoids pulling in react-helmet as a dependency.
 * Pass the page-specific part; the brand suffix is appended automatically.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX;
  }, [title]);
}
