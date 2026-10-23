/**
 * Criação de elementos do painel. Texto entra sempre por textContent;
 * atributos de evento (on*), style e innerHTML não são aceitos.
 */

type Attrs = Record<string, string | number | boolean | null | undefined>;

interface Props {
  class?: string;
  text?: string;
  attrs?: Attrs;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
}

export type Kid = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text != null) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    if (/^on/i.test(k) || k === 'style' || k === 'srcdoc') throw new Error(`Atributo não permitido: ${k}`);
    if (v == null || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const [ev, fn] of Object.entries(props.on ?? {})) {
    node.addEventListener(ev, fn as EventListener);
  }
  for (const k of kids) {
    if (k == null || k === false) continue;
    node.append(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return node;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => {
  const n = root.querySelector<T>(sel);
  if (!n) throw new Error(`Elemento não encontrado: ${sel}`);
  return n;
};

/** Aviso curto no rodapé da tela ("Salvo", "Apagado", erros). */
export function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  const region = document.querySelector<HTMLElement>('[data-toast]');
  if (!region) return;
  const item = el('p', { class: `toast toast--${kind}`, text: message, attrs: { role: kind === 'error' ? 'alert' : 'status' } });
  region.append(item);
  setTimeout(() => item.remove(), kind === 'error' ? 7000 : 3500);
}

/** Confirmação com <dialog> nativo (sem window.confirm, que trava a página). */
export function confirmDialog(message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el(
      'dialog',
      { class: 'confirm' },
      el('p', { text: message }),
      el(
        'form',
        { attrs: { method: 'dialog' }, class: 'confirm__actions' },
        el('button', { class: 'btn btn--ghost', text: 'Cancelar', attrs: { value: 'cancel' } }),
        el('button', { class: 'btn btn--danger', text: confirmLabel, attrs: { value: 'ok' } }),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
