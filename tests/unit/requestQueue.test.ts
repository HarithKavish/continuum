import { describe, expect, it } from 'vitest';
import { isAbortError, RequestQueue } from '../../src/core/net/RequestQueue';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('RequestQueue', () => {
  it('never runs more jobs at once than its limit', async () => {
    const queue = new RequestQueue('test', 2);
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    const results = gates.map((g, i) =>
      queue.enqueue(`k${i}`, async () => {
        running++;
        peak = Math.max(peak, running);
        await g.promise;
        running--;
        return i;
      }),
    );
    expect(queue.stats.active).toBe(2);
    expect(queue.stats.queued).toBe(3);
    gates.forEach((g) => g.resolve());
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it('shares one job between duplicate requests for the same key', async () => {
    const queue = new RequestQueue('test', 1);
    let calls = 0;
    const job = async () => {
      calls++;
      return 'tile';
    };
    const [a, b] = await Promise.all([queue.enqueue('same', job), queue.enqueue('same', job)]);
    expect([a, b]).toEqual(['tile', 'tile']);
    expect(calls).toBe(1);
  });

  it('runs the highest-priority queued job next', async () => {
    const queue = new RequestQueue('test', 1);
    const gate = deferred<void>();
    const order: string[] = [];
    const first = queue.enqueue('busy', async () => {
      await gate.promise;
      order.push('busy');
    });
    const low = queue.enqueue('low', async () => void order.push('low'), 1);
    const high = queue.enqueue('high', async () => void order.push('high'), 9);
    gate.resolve();
    await Promise.all([first, low, high]);
    expect(order).toEqual(['busy', 'high', 'low']);
  });

  it('aborts running jobs through their signal and rejects with an AbortError', async () => {
    const queue = new RequestQueue('test', 1);
    let sawAbort = false;
    const p = queue.enqueue(
      'k',
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            sawAbort = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
      0,
      { west: 10 },
    );
    const n = queue.abortWhere((tag) => (tag as { west: number }).west > 5);
    expect(n).toBe(1);
    await expect(p).rejects.toSatisfy(isAbortError);
    expect(sawAbort).toBe(true);
    expect(queue.size).toBe(0);
  });

  it('drops queued jobs without ever starting them', async () => {
    const queue = new RequestQueue('test', 1);
    const gate = deferred<void>();
    let started = false;
    const busy = queue.enqueue('busy', () => gate.promise);
    const dropped = queue.enqueue('later', async () => {
      started = true;
    });
    queue.abort('later');
    gate.resolve();
    await busy;
    await expect(dropped).rejects.toSatisfy(isAbortError);
    expect(started).toBe(false);
  });
});
