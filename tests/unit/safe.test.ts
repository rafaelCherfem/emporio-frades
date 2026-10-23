import { describe, expect, it } from 'vitest';
import {
  facebookHref,
  formatBrPhone,
  imageUrl,
  instagramHref,
  isSafeImagePath,
  mailtoHref,
  normalizeBrPhone,
  safeHttpsUrl,
  telHref,
  tiktokHref,
  whatsappHref,
} from '../../src/lib/safe';

describe('safeHttpsUrl', () => {
  it('aceita https comum', () => {
    expect(safeHttpsUrl('https://exemplo.com/a?b=1')).toBe('https://exemplo.com/a?b=1');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    'http://exemplo.com',
    '//exemplo.com',
    'https://user:senha@exemplo.com',
    'file:///etc/passwd',
    '',
    'https://' + 'a'.repeat(3000) + '.com',
  ])('recusa %s', (v) => {
    expect(safeHttpsUrl(v)).toBeNull();
  });

  it('recusa tipos não-string', () => {
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl({ toString: () => 'https://x.com' })).toBeNull();
  });
});

describe('telefone e WhatsApp', () => {
  it('normaliza celular com e sem DDI', () => {
    expect(normalizeBrPhone('(11) 91234-5678')).toBe('5511912345678');
    expect(normalizeBrPhone('+55 11 91234-5678')).toBe('5511912345678');
    expect(normalizeBrPhone('1133334444')).toBe('551133334444');
  });

  it.each(['123', '00912345678', 'abc', '5511912345678999', ''])('recusa %s', (v) => {
    expect(normalizeBrPhone(v)).toBeNull();
  });

  it('formata para exibição', () => {
    expect(formatBrPhone('11912345678')).toBe('(11) 91234-5678');
    expect(formatBrPhone('1133334444')).toBe('(11) 3333-4444');
  });

  it('gera tel: com +55', () => {
    expect(telHref('11912345678')).toBe('tel:+5511912345678');
  });

  it('gera wa.me com mensagem codificada e sem injeção de parâmetros', () => {
    const href = whatsappHref('11912345678', 'Oi & tchau?x=<script>');
    expect(href).toBe('https://wa.me/5511912345678?text=Oi%20%26%20tchau%3Fx%3D%3Cscript%3E');
  });

  it('limita o tamanho da mensagem', () => {
    const href = whatsappHref('11912345678', 'a'.repeat(2000))!;
    expect(decodeURIComponent(href.split('text=')[1]!)).toHaveLength(500);
  });

  it('não gera link para número inválido', () => {
    expect(whatsappHref('abc', 'oi')).toBeNull();
  });
});

describe('redes sociais', () => {
  it('aceita usuário, @usuário e URL do próprio domínio', () => {
    expect(instagramHref('emporiofrades')).toBe('https://www.instagram.com/emporiofrades/');
    expect(instagramHref('@emporio.frades')).toBe('https://www.instagram.com/emporio.frades/');
    expect(instagramHref('https://www.instagram.com/emporiofrades/?hl=pt')).toBe(
      'https://www.instagram.com/emporiofrades/',
    );
    expect(tiktokHref('https://www.tiktok.com/@emporio')).toBe('https://www.tiktok.com/@emporio');
    expect(facebookHref('https://m.facebook.com/emporiofrades')).toBe('https://www.facebook.com/emporiofrades');
  });

  it('recusa domínio trocado e caracteres perigosos', () => {
    expect(instagramHref('https://instagram.com.golpe.io/emporio')).toBeNull();
    expect(instagramHref('https://evil.com/emporio')).toBeNull();
    expect(instagramHref('emporio"><script>')).toBeNull();
    expect(instagramHref('../../admin')).toBeNull();
    expect(facebookHref('javascript:alert(1)')).toBeNull();
  });
});

describe('e-mail', () => {
  it('aceita e-mail comum', () => {
    expect(mailtoHref('contato@emporio.com.br')).toBe('mailto:contato@emporio.com.br');
  });
  it.each(['sem-arroba', 'a@b', 'a@b.com?bcc=x@y.com', 'a@b.com\nBcc: x@y.com', '"a"@b.com'])('recusa %s', (v) => {
    expect(mailtoHref(v)).toBeNull();
  });
});

describe('imagens', () => {
  it('aceita caminhos do bucket', () => {
    expect(isSafeImagePath('promocoes/2026/abc-123.webp')).toBe(true);
  });

  it.each([
    '../segredo.png',
    'a/../../b.png',
    '/abs.png',
    'arquivo.svg',
    'arquivo.html',
    'Maiuscula.png',
    'x.png?y=1',
    'https://evil.com/x.png',
  ])('recusa %s', (v) => {
    expect(isSafeImagePath(v)).toBe(false);
  });

  it('monta a URL pública só com base https', () => {
    expect(imageUrl('a/b.webp', 'https://xyz.supabase.co')).toBe(
      'https://xyz.supabase.co/storage/v1/object/public/media/a/b.webp',
    );
    expect(imageUrl('a/b.webp', 'http://xyz.supabase.co')).toBeNull();
    expect(imageUrl('a/b.webp', undefined)).toBeNull();
  });

  it('aceita fotos locais em /media', () => {
    expect(imageUrl('/media/fachada.webp', undefined)).toBe('/media/fachada.webp');
    expect(imageUrl('/media/../x.webp', undefined)).toBeNull();
  });
});
