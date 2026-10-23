import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCsp, headersFor, renderHeadersFile } from '../../scripts/security-headers.mjs';
import { readConfig } from '../../src/lib/config';

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

describe('Content-Security-Policy', () => {
  const csp: string = buildCsp({ supabaseUrl: 'https://abc.supabase.co' });
  const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

  it('sem unsafe-inline, unsafe-eval ou curingas', () => {
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*/);
  });

  it('scripts só do próprio site; Trusted Types obrigatório', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  it('libera só a origem do Supabase do projeto', () => {
    expect(directive('connect-src')).toBe("connect-src 'self' https://abc.supabase.co");
    expect(directive('img-src')).toBe("img-src 'self' https://abc.supabase.co");
  });

  it('ignora URL de Supabase que não seja https', () => {
    expect(buildCsp({ supabaseUrl: 'http://abc.supabase.co' })).not.toContain('abc.supabase.co');
    expect(buildCsp({ supabaseUrl: "https://x.co; script-src 'unsafe-inline'" })).not.toContain('unsafe-inline');
  });

  it('bloqueia iframe da página, plugins e <base>', () => {
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'self'"]) {
      expect(csp).toContain(d);
    }
  });

  it('painel: sem iframes, com blob: só para pré-visualizar fotos', () => {
    const admin: string = buildCsp({ supabaseUrl: 'https://abc.supabase.co', admin: true });
    expect(admin).toContain("frame-src 'none'");
    expect(admin).toContain('blob:');
    expect(csp).not.toContain('blob:');
  });
});

describe('CSP por <meta> (GitHub Pages)', () => {
  it('mesma política, sem frame-ancestors (que <meta> não aceita)', () => {
    const meta: string = buildCsp({ supabaseUrl: 'https://abc.supabase.co', meta: true });
    expect(meta).not.toContain('frame-ancestors');
    expect(meta).toContain("script-src 'self'");
    expect(meta).toContain("require-trusted-types-for 'script'");
    expect(meta).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
});

describe('arquivo _headers', () => {
  const file: string = renderHeadersFile({ supabaseUrl: 'https://abc.supabase.co' });

  it('tem HSTS, nosniff, frame e referrer', () => {
    expect(file).toContain('Strict-Transport-Security: max-age=63072000; includeSubDomains; preload');
    expect(file).toContain('X-Content-Type-Options: nosniff');
    expect(file).toContain('X-Frame-Options: DENY');
    expect(file).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(file).toContain('Permissions-Policy: camera=()');
  });

  it('painel substitui a CSP geral (não soma duas) e não é guardado em cache', () => {
    const admin = file.split('\n\n').find((b) => b.startsWith('/admin*'))!;
    expect(admin).toContain('! Content-Security-Policy');
    expect(admin).toContain('Cache-Control: no-store');
    expect(admin).toContain('X-Robots-Tag: noindex');
    const h = headersFor('/admin/');
    expect(h['Content-Security-Policy']).toContain("frame-src 'none'");
  });
});

describe('varredura do código-fonte', () => {
  const files = walk('src', ['.ts', '.astro', '.mjs']);

  it('encontrou arquivos para varrer', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each([
    ['innerHTML/outerHTML', /\.(inner|outer)HTML\s*=/],
    ['insertAdjacentHTML', /insertAdjacentHTML/],
    ['document.write', /document\.write/],
    ['eval / new Function', /\beval\(|new Function\(/],
    ['setTimeout com string', /setTimeout\(\s*['"`]/],
    ['window.confirm/alert', /\b(window\.)?(alert|confirm|prompt)\(/],
  ])('nenhum uso de %s', (_name, re) => {
    const hits = files.filter((f) => re.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('set:html só recebe saída de toHTML (que escapa tudo) ou JSON com "<" escapado', () => {
    for (const f of files.filter((x) => x.endsWith('.astro'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/set:html=\{([^}]+)\}/g)) {
        const expr = m[1]!.trim();
        expect(expr).toMatch(/^toHTML\(|^ld$|^initial$/);
        if (expr === 'ld' || expr === 'initial') {
          // a variável precisa ter sido gerada com JSON.stringify(...).replace(/</g, ...)
          expect(src).toMatch(new RegExp(`const ${expr} = .*JSON\\.stringify\\(.*\\.replace\\(/</g`));
        }
      }
    }
  });

  it('nenhum segredo no código ou no repositório', () => {
    const all = [...files, ...walk('supabase', ['.sql']), ...walk('scripts', ['.mjs']), '.env.example'];
    const secret = /sb_secret_[A-Za-z0-9]|service_role["']?\s*[:=]\s*["']ey|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/;
    expect(all.filter((f) => secret.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('config recusa chave secreta usada por engano como pública', () => {
    expect(() => readConfig({ PUBLIC_SUPABASE_URL: 'https://a.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abc' })).toThrow(/SECRETA/);
    expect(readConfig({ PUBLIC_SUPABASE_URL: 'http://a.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x' }).enabled).toBe(false);
    expect(readConfig({ PUBLIC_SUPABASE_URL: 'https://a.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x' }).enabled).toBe(true);
  });
});

describe('HTML gerado (dist/)', () => {
  const html = walk('dist', ['.html']);
  it.skipIf(html.length === 0)('sem <script> executável embutido, sem style="" e sem on*=', () => {
    for (const f of html) {
      const s = readFileSync(f, 'utf8');
      const inlineScripts = [...s.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="application\/(ld\+)?json"/.test(m[1]!));
      expect(inlineScripts, f).toEqual([]);
      expect(s, f).not.toMatch(/\sstyle="/);
      expect(s, f).not.toMatch(/\son[a-z]+="/i);
    }
  });

  it.skipIf(html.length === 0)('blocos JSON embutidos não conseguem fechar a tag </script>', () => {
    for (const f of html) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)) {
        expect(m[1], f).not.toContain('<');
        expect(() => JSON.parse(m[1]!), f).not.toThrow();
      }
    }
  });

  it.skipIf(html.length === 0)('links externos com rel=noopener', () => {
    for (const f of html) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/<a\b[^>]*href="https:\/\/[^"]*"[^>]*>/g)) {
        expect(m[0], f).toMatch(/rel="noopener noreferrer"/);
      }
    }
  });
});
