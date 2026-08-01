import { loadEnv } from '@eramix/infrastructure';
import { createGracefulShutdown } from './shutdown.js';

const env = loadEnv();
console.log(JSON.stringify({ msg: 'worker starting', nodeEnv: env.NODE_ENV }));

const shutdown = createGracefulShutdown({
  timeoutMs: 10_000,
  onShutdown: async () => {
    console.log(JSON.stringify({ msg: 'worker shutting down' }));
  },
});

process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
