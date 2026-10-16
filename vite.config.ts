import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { ENGINE_FILE } from './src/lib/pdf/protocol.ts';

/**
 * The PDF engine (Typst as WebAssembly, 28 MB) served gzipped (11 MB) as a file of its own: a static
 * host may or may not compress .wasm, so the worker unzips it itself. Built once per version.
 */
function engine(): Plugin {
  let gz: Buffer | undefined;
  const bytes = () => {
    const require = createRequire(import.meta.url);
    gz ??= gzipSync(readFileSync(require.resolve('@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm')), { level: 9 });
    return gz;
  };
  return {
    name: 'nuskha-engine',
    configureServer(server) {
      server.middlewares.use(`/${ENGINE_FILE}`, (_req, res) => {
        res.setHeader('content-type', 'application/gzip');
        res.end(bytes());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: ENGINE_FILE, source: bytes() });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), engine()],
  // Relative paths so the site works under any GitHub Pages path.
  base: './',
  worker: { format: 'es' },
});
