import { defineConfig } from 'vite';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const PUNTJE_DIR = join(process.cwd(), 'public', 'assets', 'puntje');
const TYPES = { '.png': 'image/png', '.json': 'application/json' };

// Vite caches the list of files in public/ at start-up. Frames rendered or
// re-cropped while the dev server runs can then be answered with index.html.
// This middleware always serves assets/puntje/* straight from disk, uncached.
function puntjeAssets() {
  return {
    name: 'puntje-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        const prefix = '/assets/puntje/';
        if (!url.startsWith(prefix)) return next();

        const file = normalize(join(PUNTJE_DIR, url.slice(prefix.length)));
        if (!file.startsWith(PUNTJE_DIR + sep)) return next();
        let stat;
        try {
          stat = statSync(file);
        } catch {
          res.statusCode = 404;
          return res.end('not found');
        }
        if (!stat.isFile()) return next();

        res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  plugins: [puntjeAssets()],
});
