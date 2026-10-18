// Build "Artifact": un unico file HTML pubblicabile su claude.ai.
// Sostituisce l'API HTTP con src/artifact/api.ts e i moduli Node del server con varianti browser.
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

const root = path.resolve(__dirname);
const swaps: Record<string, string> = {
  [path.join(root, 'src/api.ts')]: path.join(root, 'src/artifact/api.ts'),
  [path.join(root, 'server/db.ts')]: path.join(root, 'server/db.browser.ts'),
  [path.join(root, 'server/sanitize.ts')]: path.join(root, 'server/sanitize.browser.ts'),
};

function artifactSwaps(): Plugin {
  return {
    name: 'workcenter-artifact-swaps',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved && swaps[resolved.id] ? swaps[resolved.id] : null;
    },
  };
}

export default defineConfig({
  plugins: [artifactSwaps(), react(), viteSingleFile()],
  build: { outDir: 'dist-artifact', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 10_000 },
});
