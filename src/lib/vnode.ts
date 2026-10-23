/**
 * Mini árvore de elementos usada para gerar a mesma marcação em dois lugares:
 *  - no build (toHTML, com escape de tudo) para o HTML estático e SEO;
 *  - no navegador (toDOM, só com createElement/textContent) para o conteúdo ao vivo.
 *
 * Só tags e atributos da lista abaixo são aceitos. href/src passam por
 * verificação de esquema no momento da renderização, mesmo que já tenham sido
 * validados antes (defesa em profundidade).
 */

export type Child = VNode | string | null | undefined | false;
export interface VNode {
  tag: string;
  attrs: Record<string, string | number | boolean | null | undefined>;
  children: Child[];
}

const TAGS = new Set([
  'a', 'article', 'b', 'div', 'figure', 'figcaption', 'h3', 'h4', 'img', 'li', 'ol', 'p',
  'section', 'small', 'span', 'strong', 's', 'time', 'ul', 'del', 'ins', 'data', 'abbr',
  'picture', 'source',
]);

const VOID = new Set(['img', 'source']);

const ATTRS = new Set([
  'class', 'href', 'src', 'srcset', 'media', 'sizes', 'fetchpriority', 'alt', 'title', 'datetime', 'value', 'loading', 'decoding',
  'aria-roledescription', 'data-slide', 'data-index',
  'width', 'height', 'target', 'rel', 'role', 'id', 'tabindex', 'lang',
  'aria-label', 'aria-hidden', 'aria-current', 'aria-describedby',
  'data-id', 'data-kind', 'data-day', 'data-today', 'data-state',
]);

// srcset aqui sempre leva UMA url (sem descritores), validada como as demais
const URL_ATTRS = new Set(['href', 'src', 'srcset']);

export function isAllowedUrl(value: string): boolean {
  const v = value.trim();
  if (v.startsWith('#') || (v.startsWith('/') && !v.startsWith('//'))) return true;
  return /^(https:\/\/|tel:\+\d{8,15}$|mailto:[^\s<>"']+$)/i.test(v);
}

export function h(tag: string, attrs: VNode['attrs'] = {}, ...children: Child[]): VNode {
  if (!TAGS.has(tag)) throw new Error(`Tag não permitida: ${tag}`);
  return { tag, attrs, children: children.flat() as Child[] };
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

function attrEntries(node: VNode): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, raw] of Object.entries(node.attrs)) {
    if (raw == null || raw === false) continue;
    if (!ATTRS.has(k)) throw new Error(`Atributo não permitido: ${k}`);
    const v = raw === true ? '' : String(raw);
    if (URL_ATTRS.has(k) && !isAllowedUrl(v)) continue;
    out.push([k, v]);
  }
  // Link externo sempre isolado da página de origem
  if (node.tag === 'a' && out.some(([k, v]) => k === 'href' && v.startsWith('https://'))) {
    const rest = out.filter(([k]) => k !== 'rel' && k !== 'target');
    rest.push(['target', '_blank'], ['rel', 'noopener noreferrer']);
    return rest;
  }
  return out;
}

export function toHTML(node: Child | Child[]): string {
  if (Array.isArray(node)) return node.map(toHTML).join('');
  if (node == null || node === false) return '';
  if (typeof node === 'string') return escapeHtml(node);
  const attrs = attrEntries(node)
    .map(([k, v]) => (v === '' && k !== 'alt' ? ` ${k}` : ` ${k}="${escapeHtml(v)}"`))
    .join('');
  if (VOID.has(node.tag)) return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(toHTML).join('')}</${node.tag}>`;
}

export function toDOM(node: Child, doc: Document = document): Node | null {
  if (node == null || node === false) return null;
  if (typeof node === 'string') return doc.createTextNode(node);
  const el = doc.createElement(node.tag);
  for (const [k, v] of attrEntries(node)) el.setAttribute(k, v);
  for (const c of node.children) {
    const n = toDOM(c, doc);
    if (n) el.appendChild(n);
  }
  return el;
}

/** Troca o conteúdo de um container pelos nós gerados. */
export function mount(container: Element, nodes: Child[]): void {
  const frag = container.ownerDocument.createDocumentFragment();
  for (const n of nodes) {
    const d = toDOM(n, container.ownerDocument);
    if (d) frag.appendChild(d);
  }
  container.replaceChildren(frag);
}
