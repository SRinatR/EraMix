export interface ShutdownOptions {
  readonly timeoutMs: number;
  readonly onShutdown: () => Promise<void>;
}

export function createGracefulShutdown({ timeoutMs, onShutdown }: ShutdownOptions) {
  return async function shutdown(): Promise<'completed' | 'timed-out'> {
    const timeout = new Promise<'timed-out'>((resolve) =>
      setTimeout(() => resolve('timed-out'), timeoutMs),
    );
    const completion = onShutdown().then(() => 'completed' as const);
    return Promise.race([completion, timeout]);
  };
}
