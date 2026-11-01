import { useEffect } from 'react';
import { uiStore, useUi } from '../../core/state/hooks';

export function Toast() {
  const toast = useUi((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      if (uiStore.get().toast?.id === toast.id) uiStore.set({ toast: null });
    }, 2600);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div
      className={`toast${toast.tone === 'danger' ? ' toast--danger' : ''}`}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  );
}
