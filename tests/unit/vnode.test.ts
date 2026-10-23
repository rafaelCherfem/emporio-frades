import { describe, expect, it } from 'vitest';
import { escapeHtml, h, isAllowedUrl, toHTML } from '../../src/lib/vnode';

const XSS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  "'><iframe src=javascript:alert(1)>",
  '</li><script>fetch("//evil")</script>',
];

describe('toHTML', () => {
  it.each(XSS)('escapa texto malicioso: %s', (payload) => {
    const html = toHTML(h('p', {}, payload));
    expect(html).not.toMatch(/<script|<img|<svg|<iframe/i);
    expect(html).toBe(`<p>${escapeHtml(payload)}</p>`);
  });

  it.each(XSS)('escapa atributos: %s', (payload) => {
    const html = toHTML(h('img', { alt: payload, src: '/x.png' }));
    expect(html).not.toMatch(/"\s*on\w+=/i);
    expect(html).not.toContain('<script');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'http://x.com', 'vbscript:x'])(
    'descarta href perigoso: %s',
    (href) => {
      expect(toHTML(h('a', { href }, 'x'))).toBe('<a>x</a>');
    },
  );

  it('força rel=noopener noreferrer e target em link externo', () => {
    const html = toHTML(h('a', { href: 'https://wa.me/55', rel: 'opener', target: '_self' }, 'x'));
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('opener"');
  });

  it('recusa tags e atributos fora da lista', () => {
    expect(() => h('script')).toThrow();
    expect(() => h('iframe')).toThrow();
    expect(() => toHTML(h('p', { onclick: 'x' }))).toThrow();
    expect(() => toHTML(h('p', { style: 'x' }))).toThrow();
  });

  it('isAllowedUrl', () => {
    expect(isAllowedUrl('#promocoes')).toBe(true);
    expect(isAllowedUrl('/media/a.webp')).toBe(true);
    expect(isAllowedUrl('tel:+5511912345678')).toBe(true);
    expect(isAllowedUrl('tel:alert(1)')).toBe(false);
    expect(isAllowedUrl('mailto:a@b.com')).toBe(true);
  });
});
