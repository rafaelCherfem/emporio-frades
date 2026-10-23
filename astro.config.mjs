// @ts-check
import { defineConfig } from 'astro/config';

// Sem scripts ou estilos embutidos no HTML: assim a CSP pode proibir
// 'unsafe-inline' (ver public/_headers).
export default defineConfig({
  site: 'https://emporiofrades.com.br',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
