// Servidor estático para testes: serve dist/ aplicando os MESMOS cabeçalhos do
// Cloudflare (CSP inclusa). Assim os testes e2e provam que o site funciona com a
// política de segurança ligada. Uso: node scripts/serve-dist.mjs [porta]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { headersFor } from './security-headers.mjs';

const root = resolve(process.env['DIST'] ?? 'dist');
const port = Number(process.argv[2] ?? process.env['PORT'] ?? 4322);
const supabaseUrl = process.env['PUBLIC_SUPABASE_URL'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  let file = normalize(join(root, pathname));
  if (!file.startsWith(root)) {
    res.writeHead(400).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;

  // HSTS não faz sentido em http://localhost
  const headers = headersFor(pathname, { supabaseUrl });
  delete headers['Strict-Transport-Security'];
  const csp = headers['Content-Security-Policy'];
  if (csp) headers['Content-Security-Policy'] = csp.replace('; upgrade-insecure-requests', '');

  if (!existsSync(file)) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`dist/ em http://localhost:${port}`));
