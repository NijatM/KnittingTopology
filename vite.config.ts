import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/KnittingTopology/',
  // Browser traces contain HTML snapshots; writing them must not reload the live app.
  server: { watch: { ignored: ['**/tmp/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 750 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
