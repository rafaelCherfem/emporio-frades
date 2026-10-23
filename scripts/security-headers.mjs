// Cabeçalhos HTTP de segurança, gerados no build para o Cloudflare Pages (dist/_headers).
// Fonte única: usada pela integração do Astro, pelo servidor de testes e pelos testes.

/** @param {string | undefined} supabaseUrl */
export function supabaseOrigin(supabaseUrl) {
  try {
    const u = new URL(supabaseUrl ?? '');
    return u.protocol === 'https:' ? u.origin : '';
  } catch {
    return '';
  }
}

/**
 * @param {{ supabaseUrl?: string, admin?: boolean }} opts
 * @returns {string}
 */
export function buildCsp({ supabaseUrl, admin = false } = {}) {
  const sb = supabaseOrigin(supabaseUrl);
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", sb, admin ? 'blob:' : ''].filter(Boolean),
    'font-src': ["'self'"],
    'connect-src': ["'self'", sb].filter(Boolean),
    'frame-src': admin ? ["'none'"] : ['https://www.google.com', 'https://maps.google.com'],
    'manifest-src': ["'self'"],
    'worker-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'require-trusted-types-for': ["'script'"],
    'trusted-types': ["'none'"],
    'upgrade-insecure-requests': [],
  };
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

const COMMON = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/**
 * Regras por caminho, no formato do arquivo _headers.
 * @param {{ supabaseUrl?: string }} opts
 * @returns {{ path: string, headers: Record<string, string> }[]}
 */
export function headerRules({ supabaseUrl } = {}) {
  return [
    { path: '/*', headers: { ...COMMON, 'Content-Security-Policy': buildCsp({ supabaseUrl }) } },
    {
      path: '/admin*',
      headers: {
        'Content-Security-Policy': buildCsp({ supabaseUrl, admin: true }),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
    { path: '/_astro/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    { path: '/fonts/*', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
  ];
}

/** Gera o texto do arquivo _headers. No Cloudflare, regras mais específicas se somam;
 *  por isso a CSP do /admin* remove a geral antes de definir a própria (sintaxe "! Header"). */
export function renderHeadersFile(opts = {}) {
  return headerRules(opts)
    .map(({ path, headers }) => {
      const lines = Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`);
      if (path === '/admin*') lines.unshift('  ! Content-Security-Policy');
      return [path, ...lines].join('\n');
    })
    .join('\n\n')
    .concat('\n');
}

/**
 * Resolve os cabeçalhos finais de um caminho, imitando o Cloudflare
 * (usado pelo servidor de testes).
 * @param {string} pathname
 */
export function headersFor(pathname, opts = {}) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const { path, headers } of headerRules(opts)) {
    const re = new RegExp('^' + path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (re.test(pathname)) Object.assign(out, headers);
  }
  return out;
}
