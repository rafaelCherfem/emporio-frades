// @ts-check
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { renderHeadersFile } from './scripts/security-headers.mjs';

const env = loadEnv(process.env['NODE_ENV'] ?? 'production', process.cwd(), 'PUBLIC_');

/** Gera dist/_headers (Cloudflare Pages) com a CSP apontando para o Supabase do projeto. */
function securityHeaders() {
  return /** @type {import('astro').AstroIntegration} */ ({
    name: 'security-headers',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const file = fileURLToPath(new URL('_headers', dir));
        writeFileSync(file, renderHeadersFile({ supabaseUrl: env['PUBLIC_SUPABASE_URL'] }));
      },
    },
  });
}

// Sem scripts ou estilos embutidos no HTML: assim a CSP pode proibir 'unsafe-inline'.
// Domínio e subcaminho configuráveis: GitHub Pages usa /emporio-frades/,
// Cloudflare ou domínio próprio usam a raiz.
const site = process.env['SITE_URL'] ?? 'https://emporiofrades.com.br';
const base = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'never', format: 'directory' },
  devToolbar: { enabled: false },
  integrations: [securityHeaders()],
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
