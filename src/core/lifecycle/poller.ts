// Periodic refresh that stops while the page is hidden and catches up when it returns,
// so a background tab makes no provider requests.

import { statusStore } from '../state/appState';

export interface Poller {
  start(): void;
  stop(): void;
  refreshNow(): void;
}

export function createPoller(
  run: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
): Poller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let lastRun = 0;
  let running = false;

  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(tick, delay);
  };

  const tick = async () => {
    if (!running) return;
    if (document.visibilityState === 'hidden') return; // resumed by the visibility listener
    controller?.abort();
    controller = new AbortController();
    lastRun = Date.now();
    try {
      await run(controller.signal);
    } finally {
      if (running) schedule(intervalMs);
    }
  };

  const onVisibility = () => {
    statusStore.set({ hidden: document.visibilityState === 'hidden' });
    if (!running) return;
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer);
    } else {
      schedule(Math.max(0, intervalMs - (Date.now() - lastRun)));
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      document.addEventListener('visibilitychange', onVisibility);
      schedule(0);
    },
    stop() {
      running = false;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    },
    refreshNow() {
      if (running) schedule(0);
    },
  };
}
