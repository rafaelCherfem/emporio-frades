import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { ZodError } from 'zod';
import { readConfig } from '../../lib/config';
import { formatBRL, formatDateShort, isPromotionActive } from '../../lib/format';
import { DAY_NAMES } from '../../lib/hours';
import { imageUrl } from '../../lib/safe';
import {
  highlightSchema,
  newsSchema,
  promotionSchema,
  storeSettingsSchema,
  type DayHours,
  type StoreSettings,
} from '../../lib/schemas';
import { $, confirmDialog, el, toast } from './dom';
import { ENTITIES, fromInput, toInput, type Entity, type EntityConfig, type Field } from './fields';
import { ImageError, imagePathFor, prepareImage, ACCEPTED } from './image';

type Row = Record<string, unknown> & { id: string };

const cfg = readConfig();
let sb: SupabaseClient;

const SCHEMAS = { promotions: promotionSchema, highlights: highlightSchema, news: newsSchema } as const;

/* =========================================================
   Telas
   ========================================================= */

function show(view: 'loading' | 'login' | 'recovery' | 'denied' | 'app' | 'setup') {
  for (const v of document.querySelectorAll<HTMLElement>('[data-view]')) {
    v.hidden = v.dataset['view'] !== view;
  }
  const focusable = document.querySelector<HTMLElement>(`[data-view="${view}"] [autofocus], [data-view="${view}"] h1`);
  focusable?.focus();
}

function setBusy(btn: HTMLButtonElement, busy: boolean, label?: string) {
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
  if (label) btn.textContent = label;
}

/** Mensagens de erro em linguagem do dono, sem detalhes internos. */
function friendlyError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? '');
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme o e-mail antes de entrar (veja sua caixa de entrada).';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/jwt|session|not authenticated/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  if (/row-level security|permission denied/i.test(msg)) return 'Sua conta não tem permissão para essa alteração.';
  if (/violates check constraint/i.test(msg)) return 'Algum campo está fora do formato permitido. Revise e tente de novo.';
  if (/failed to fetch|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.';
  if (/password/i.test(msg) && /weak|short|least/i.test(msg)) return 'Senha fraca. Use pelo menos 10 caracteres, misturando letras e números.';
  return 'Não foi possível concluir. Tente de novo em instantes.';
}

/* =========================================================
   Login, recuperação de senha e checagem de admin
   ========================================================= */

function initLogin() {
  const form = $<HTMLFormElement>('[data-login-form]');
  const error = $('[data-login-error]');
  const submit = $<HTMLButtonElement>('button[type="submit"]', form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (!email || !password) {
      error.textContent = 'Preencha e-mail e senha.';
      error.hidden = false;
      return;
    }
    setBusy(submit, true, 'Entrando…');
    const { error: err } = await sb.auth.signInWithPassword({ email, password });
    setBusy(submit, false, 'Entrar');
    if (err) {
      error.textContent = friendlyError(err);
      error.hidden = false;
      form.querySelector<HTMLInputElement>('[name="password"]')!.value = '';
    }
  });

  $('[data-forgot]').addEventListener('click', async () => {
    const email = String(new FormData(form).get('email') ?? '').trim();
    if (!email) {
      error.textContent = 'Digite seu e-mail acima e clique de novo em "Esqueci a senha".';
      error.hidden = false;
      return;
    }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin/` });
    // Mesma resposta exista ou não a conta (não revela quem está cadastrado)
    error.hidden = true;
    toast('Se esse e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
  });
}

function initRecovery() {
  const form = $<HTMLFormElement>('[data-recovery-form]');
  const error = $('[data-recovery-error]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const pass = String(data.get('password') ?? '');
    const again = String(data.get('confirm') ?? '');
    if (pass.length < 10) {
      error.textContent = 'Use pelo menos 10 caracteres.';
      error.hidden = false;
      return;
    }
    if (pass !== again) {
      error.textContent = 'As duas senhas não são iguais.';
      error.hidden = false;
      return;
    }
    const { error: err } = await sb.auth.updateUser({ password: pass });
    if (err) {
      error.textContent = friendlyError(err);
      error.hidden = false;
      return;
    }
    toast('Senha alterada.');
    form.reset();
    await enter((await sb.auth.getSession()).data.session);
  });
}

async function isAdmin(session: Session): Promise<boolean> {
  const { data, error } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  return !error && Boolean(data);
}

let entered = false;

async function enter(session: Session | null) {
  if (!session) {
    entered = false;
    show('login');
    return;
  }
  if (!(await isAdmin(session))) {
    show('denied');
    $('[data-denied-email]').textContent = session.user.email ?? '';
    return;
  }
  if (entered) return;
  entered = true;
  $('[data-user-email]').textContent = session.user.email ?? '';
  show('app');
  openTab(currentTab());
}

/* =========================================================
   Abas
   ========================================================= */

type Tab = Entity | 'settings';
const TABS: Tab[] = ['promotions', 'highlights', 'news', 'settings'];

function currentTab(): Tab {
  const t = location.hash.slice(1) as Tab;
  return TABS.includes(t) ? t : 'promotions';
}

function openTab(tab: Tab) {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-tab]')) {
    if (a.dataset['tab'] === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const panel = $('[data-panel]');
  panel.replaceChildren(el('p', { class: 'muted', text: 'Carregando…' }));
  if (tab === 'settings') void renderSettings(panel);
  else void renderEntity(panel, ENTITIES[tab]);
}

/* =========================================================
   Listas (promoções, em alta, novidades)
   ========================================================= */

function statusOf(cfgE: EntityConfig, row: Row): { label: string; tone: 'on' | 'off' | 'warn' } {
  if (!row['published']) return { label: 'Rascunho', tone: 'off' };
  if (cfgE.table === 'promotions') {
    const p = row as unknown as { published: boolean; starts_at: string | null; ends_at: string | null };
    if (p.ends_at && new Date(p.ends_at) < new Date()) return { label: 'Encerrada', tone: 'warn' };
    if (p.starts_at && new Date(p.starts_at) > new Date()) return { label: `Começa ${formatDateShort(p.starts_at)}`, tone: 'warn' };
    if (isPromotionActive(p)) return { label: 'No site', tone: 'on' };
  }
  if (cfgE.table === 'news' && new Date(String(row['published_at'])) > new Date()) {
    return { label: `Agendada ${formatDateShort(String(row['published_at']))}`, tone: 'warn' };
  }
  return { label: 'No site', tone: 'on' };
}

async function renderEntity(panel: HTMLElement, cfgE: EntityConfig) {
  const { data, error } = await sb
    .from(cfgE.table)
    .select('*')
    .order(cfgE.order.column, { ascending: cfgE.order.ascending })
    .limit(200);

  if (error) {
    panel.replaceChildren(el('p', { class: 'form-error', text: friendlyError(error) }));
    return;
  }
  const rows = (data ?? []) as Row[];

  const list = el('ul', { class: 'rows' });
  rows.forEach((row, i) => {
    const st = statusOf(cfgE, row);
    const thumb = imageUrl(row['image_path'], cfg.supabaseUrl);
    const price = typeof row['price_cents'] === 'number' ? formatBRL(row['price_cents']) : null;

    list.append(
      el(
        'li',
        { class: 'row' },
        thumb
          ? el('img', { class: 'row__thumb', attrs: { src: thumb, alt: '', width: 56, height: 56, loading: 'lazy' } })
          : el('span', { class: 'row__thumb row__thumb--empty', attrs: { 'aria-hidden': 'true' } }),
        el(
          'div',
          { class: 'row__main' },
          el('p', { class: 'row__title', text: String(row[cfgE.labelField] ?? '') }),
          el(
            'p',
            { class: 'row__meta' },
            el('span', { class: `chip chip--${st.tone}`, text: st.label }),
            price ? el('span', { text: price }) : null,
          ),
        ),
        el(
          'div',
          { class: 'row__actions' },
          cfgE.sortable
            ? el('button', {
                class: 'icon-btn',
                text: '↑',
                attrs: { type: 'button', 'aria-label': 'Subir na ordem', disabled: i === 0 },
                on: { click: () => void move(cfgE, rows, i, -1) },
              })
            : null,
          cfgE.sortable
            ? el('button', {
                class: 'icon-btn',
                text: '↓',
                attrs: { type: 'button', 'aria-label': 'Descer na ordem', disabled: i === rows.length - 1 },
                on: { click: () => void move(cfgE, rows, i, 1) },
              })
            : null,
          el('button', { class: 'btn btn--ghost btn--s', text: 'Editar', attrs: { type: 'button' }, on: { click: () => openEditor(cfgE, row, rows.length) } }),
          el('button', { class: 'btn btn--ghost btn--s', text: 'Apagar', attrs: { type: 'button' }, on: { click: () => void remove(cfgE, row) } }),
        ),
      ),
    );
  });

  panel.replaceChildren(
    el(
      'div',
      { class: 'panel__head' },
      el('h1', { class: 'panel__title', text: cfgE.title, attrs: { tabindex: -1 } }),
      el('button', { class: 'btn btn--label', text: cfgE.newLabel, attrs: { type: 'button' }, on: { click: () => openEditor(cfgE, null, rows.length) } }),
    ),
    rows.length
      ? list
      : el('p', { class: 'empty', text: `Nenhum item ainda. Clique em "${cfgE.newLabel}" para começar.` }),
  );
}

async function move(cfgE: EntityConfig, rows: Row[], index: number, dir: -1 | 1) {
  const a = rows[index]!;
  const b = rows[index + dir]!;
  // Renumera a lista inteira para não depender de valores repetidos
  const reordered = [...rows];
  reordered[index] = b;
  reordered[index + dir] = a;
  const updates = reordered.map((r, i) => sb.from(cfgE.table).update({ sort_order: (i + 1) * 10 }).eq('id', r.id));
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) toast(friendlyError(failed.error), 'error');
  openTab(cfgE.table);
}

async function remove(cfgE: EntityConfig, row: Row) {
  const name = String(row[cfgE.labelField] ?? cfgE.singular);
  const ok = await confirmDialog(`Apagar "${name}"? Isso não pode ser desfeito.`, 'Apagar');
  if (!ok) return;
  const { error } = await sb.from(cfgE.table).delete().eq('id', row.id);
  if (error) {
    toast(friendlyError(error), 'error');
    return;
  }
  if (typeof row['image_path'] === 'string') await sb.storage.from('media').remove([row['image_path']]);
  toast('Apagado.');
  openTab(cfgE.table);
}

/* =========================================================
   Editor
   ========================================================= */

function fieldId(name: string) {
  return `f-${name}`;
}

function buildField(f: Field, value: unknown, state: ImageState): HTMLElement {
  const id = fieldId(f.name);
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedBy = [f.help ? helpId : '', errId].filter(Boolean).join(' ');

  if (f.type === 'checkbox') {
    return el(
      'div',
      { class: 'field field--check' },
      el('input', { attrs: { type: 'checkbox', id, name: f.name, checked: Boolean(value), 'aria-describedby': describedBy } }),
      el('label', { text: f.label, attrs: { for: id } }),
      el('p', { class: 'field__error', attrs: { id: errId, hidden: true } }),
    );
  }

  if (f.type === 'image') {
    const preview = el('div', { class: 'image-field__preview' });
    const setPreview = (src: string | null) => {
      preview.replaceChildren(src ? el('img', { attrs: { src, alt: '' } }) : el('span', { class: 'muted', text: 'Sem foto' }));
    };
    setPreview(imageUrl(value, cfg.supabaseUrl));

    const input = el('input', {
      attrs: { type: 'file', id, accept: ACCEPTED.join(','), 'aria-describedby': describedBy },
      on: {
        change: async () => {
          const file = input.files?.[0];
          if (!file) return;
          const err = document.getElementById(errId)!;
          err.hidden = true;
          try {
            state.pending = await prepareImage(file);
            state.removed = false;
            if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
            state.previewUrl = URL.createObjectURL(state.pending);
            setPreview(state.previewUrl);
          } catch (e) {
            err.textContent = e instanceof ImageError ? e.message : 'Não foi possível usar essa foto.';
            err.hidden = false;
            input.value = '';
          }
        },
      },
    });
    const removeBtn = el('button', {
      class: 'btn btn--ghost btn--s',
      text: 'Remover foto',
      attrs: { type: 'button' },
      on: {
        click: () => {
          state.pending = null;
          state.removed = true;
          input.value = '';
          setPreview(null);
        },
      },
    });

    return el(
      'div',
      { class: 'field image-field' },
      el('label', { text: f.label, attrs: { for: id } }),
      preview,
      el('div', { class: 'image-field__actions' }, input, removeBtn),
      el('p', { class: 'field__help', text: 'JPG, PNG ou WebP. A foto é reduzida e otimizada automaticamente.', attrs: { id: helpId } }),
      el('p', { class: 'field__error', attrs: { id: errId, hidden: true } }),
    );
  }

  const common = {
    id,
    name: f.name,
    maxlength: f.max,
    required: f.required,
    placeholder: f.placeholder,
    'aria-describedby': describedBy,
  };
  let control: HTMLElement;
  if (f.type === 'textarea') {
    const ta = el('textarea', { attrs: { ...common, rows: 3 } });
    ta.value = toInput(f, value);
    control = ta;
  } else {
    const isDate = f.type.startsWith('date');
    const input = el('input', {
      attrs: {
        ...common,
        type: isDate ? 'date' : 'text',
        inputmode: f.type === 'money' ? 'decimal' : undefined,
        list: f.list ? `${id}-list` : undefined,
        autocomplete: 'off',
      },
    });
    input.value = toInput(f, value);
    control = input;
  }

  return el(
    'div',
    { class: `field${f.type === 'money' ? ' field--money' : ''}` },
    el('label', { text: f.label, attrs: { for: id } }),
    f.type === 'money' ? el('div', { class: 'money' }, el('span', { text: 'R$', attrs: { 'aria-hidden': 'true' } }), control) : control,
    f.list ? el('datalist', { attrs: { id: `${id}-list` } }, ...f.list.map((o) => el('option', { attrs: { value: o } }))) : null,
    f.help ? el('p', { class: 'field__help', text: f.help, attrs: { id: helpId } }) : null,
    el('p', { class: 'field__error', attrs: { id: errId, hidden: true } }),
  );
}

interface ImageState {
  pending: Blob | null;
  removed: boolean;
  previewUrl: string | null;
}

function showErrors(form: HTMLFormElement, errors: Record<string, string>) {
  for (const p of form.querySelectorAll<HTMLElement>('.field__error')) p.hidden = true;
  for (const c of form.querySelectorAll('[aria-invalid]')) c.removeAttribute('aria-invalid');
  let first: HTMLElement | null = null;
  for (const [name, msg] of Object.entries(errors)) {
    const err = form.querySelector<HTMLElement>(`#${fieldId(name)}-err`);
    const control = form.querySelector<HTMLElement>(`#${fieldId(name)}`);
    if (err) {
      err.textContent = msg;
      err.hidden = false;
    }
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      first ??= control;
    }
  }
  first?.focus();
}

function zodToErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (out[key]) continue;
    out[key] =
      issue.code === 'too_big'
        ? 'Texto longo demais.'
        : issue.code === 'too_small'
          ? 'Campo obrigatório.'
          : issue.message;
  }
  return out;
}

function openEditor(cfgE: EntityConfig, row: Row | null, count: number) {
  const dialog = $<HTMLDialogElement>('[data-editor]');
  const state: ImageState = { pending: null, removed: false, previewUrl: null };
  const isNew = !row;

  const fields = cfgE.fields.map((f) => buildField(f, row ? row[f.name] : f.type === 'checkbox' ? true : null, state));
  const formError = el('p', { class: 'form-error', attrs: { role: 'alert', hidden: true } });
  const save = el('button', { class: 'btn btn--label', text: isNew ? 'Publicar' : 'Salvar alterações', attrs: { type: 'submit' } });

  const form = el(
    'form',
    { class: 'editor', attrs: { novalidate: true } },
    el(
      'div',
      { class: 'editor__head' },
      el('h2', { text: isNew ? cfgE.newLabel : `Editar ${cfgE.singular}` }),
      el('button', {
        class: 'icon-btn',
        text: '×',
        attrs: { type: 'button', 'aria-label': 'Fechar sem salvar' },
        on: { click: () => dialog.close() },
      }),
    ),
    el('div', { class: 'editor__fields' }, ...fields),
    formError,
    el(
      'div',
      { class: 'editor__actions' },
      el('button', { class: 'btn btn--ghost', text: 'Cancelar', attrs: { type: 'button' }, on: { click: () => dialog.close() } }),
      save,
    ),
  );

  // Texto do botão acompanha o "Publicado"
  const pubBox = form.querySelector<HTMLInputElement>('[name="published"]');
  const syncLabel = () => {
    if (isNew) save.textContent = pubBox?.checked ? 'Publicar' : 'Salvar rascunho';
  };
  pubBox?.addEventListener('change', syncLabel);
  syncLabel();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;

    // 1. Ler e converter campos
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const f of cfgE.fields) {
      if (f.type === 'image') continue;
      if (f.type === 'checkbox') {
        values[f.name] = form.querySelector<HTMLInputElement>(`[name="${f.name}"]`)!.checked;
        continue;
      }
      const raw = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${f.name}"]`)!.value;
      const { value, error } = fromInput(f, raw);
      values[f.name] = value;
      if (error) errors[f.name] = error;
    }
    const currentPath = (row?.['image_path'] as string | null | undefined) ?? null;
    values['image_path'] = state.removed ? null : currentPath;
    if (cfgE.sortable) values['sort_order'] = row ? row['sort_order'] : (count + 1) * 10;
    if ((state.pending || values['image_path']) && !String(values['image_alt'] ?? '').trim()) {
      errors['image_alt'] = 'Descreva a foto em poucas palavras.';
    }

    // 2. Validar com o mesmo schema do site
    const parsed = SCHEMAS[cfgE.table].safeParse({ ...values, id: row?.id ?? 'seed-validate' });
    if (!parsed.success) Object.assign(errors, zodToErrors(parsed.error));
    if (Object.keys(errors).length) {
      showErrors(form, errors);
      return;
    }

    setBusy(save, true, 'Salvando…');
    let uploaded: string | null = null;
    try {
      // 3. Subir a foto nova (se houver)
      if (state.pending) {
        uploaded = imagePathFor(cfgE.folder, state.pending.type);
        const { error } = await sb.storage.from('media').upload(uploaded, state.pending, {
          contentType: state.pending.type,
          cacheControl: '31536000',
          upsert: false,
        });
        if (error) throw error;
        values['image_path'] = uploaded;
      }

      // 4. Gravar
      const { error } = row
        ? await sb.from(cfgE.table).update(values).eq('id', row.id)
        : await sb.from(cfgE.table).insert(values);
      if (error) throw error;

      // 5. Limpar foto antiga substituída/removida
      if (currentPath && currentPath !== values['image_path']) {
        await sb.storage.from('media').remove([currentPath]);
      }

      toast(isNew ? (values['published'] ? 'Publicado.' : 'Rascunho salvo.') : 'Alterações salvas.');
      dialog.close();
      openTab(cfgE.table);
    } catch (err) {
      if (uploaded) await sb.storage.from('media').remove([uploaded]);
      formError.textContent = friendlyError(err);
      formError.hidden = false;
      setBusy(save, false, isNew ? 'Publicar' : 'Salvar alterações');
    }
  });

  dialog.replaceChildren(form);
  dialog.addEventListener(
    'close',
    () => {
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    },
    { once: true },
  );
  dialog.showModal();
  form.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=file]), textarea')?.focus();
}

/* =========================================================
   Dados da loja
   ========================================================= */

const SETTINGS_FIELDS: { group: string; fields: (Field & { kind?: 'number' | 'digits' })[] }[] = [
  {
    group: 'A loja',
    fields: [
      { name: 'name', label: 'Nome', type: 'text', max: 80, required: true },
      { name: 'tagline', label: 'Frase de apresentação', type: 'textarea', max: 160, help: 'Aparece logo abaixo do nome, no topo do site.' },
      { name: 'about', label: 'Sobre a loja', type: 'textarea', max: 1200 },
    ],
  },
  {
    group: 'Endereço',
    fields: [
      { name: 'street', label: 'Rua', type: 'text', max: 120 },
      { name: 'number', label: 'Número', type: 'text', max: 20 },
      { name: 'district', label: 'Bairro', type: 'text', max: 80 },
      { name: 'city', label: 'Cidade', type: 'text', max: 80 },
      { name: 'state', label: 'UF', type: 'text', max: 2, placeholder: 'SP' },
      { name: 'zip', label: 'CEP', type: 'text', max: 9, placeholder: '00000-000' },
      { name: 'reference', label: 'Ponto de referência', type: 'text', max: 160 },
      { name: 'latitude', label: 'Latitude', type: 'text', kind: 'number', help: 'Opcional, deixa o mapa exato. No Google Maps, clique com o botão direito na loja e copie o primeiro número.' },
      { name: 'longitude', label: 'Longitude', type: 'text', kind: 'number', help: 'O segundo número.' },
    ],
  },
  {
    group: 'Contato',
    fields: [
      { name: 'phone', label: 'Telefone', type: 'text', kind: 'digits', help: 'Com DDD, só números. Ex.: 1133334444' },
      { name: 'whatsapp', label: 'WhatsApp', type: 'text', kind: 'digits', help: 'Com DDD, só números. Ex.: 11912345678' },
      { name: 'whatsapp_message', label: 'Mensagem que já vem escrita no WhatsApp', type: 'textarea', max: 300 },
      { name: 'email', label: 'E-mail', type: 'text', max: 254 },
      { name: 'instagram', label: 'Instagram', type: 'text', max: 120, help: 'O @ da loja ou o link do perfil.' },
      { name: 'facebook', label: 'Facebook', type: 'text', max: 120 },
      { name: 'tiktok', label: 'TikTok', type: 'text', max: 120 },
    ],
  },
];

async function renderSettings(panel: HTMLElement) {
  const { data, error } = await sb.from('store_settings').select('*').eq('id', 1).single();
  if (error || !data) {
    panel.replaceChildren(el('p', { class: 'form-error', text: friendlyError(error) }));
    return;
  }
  const s = data as StoreSettings;
  const state: ImageState = { pending: null, removed: false, previewUrl: null };

  const hours: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map(
    (d) => s.hours?.find((h) => h.day === d) ?? { day: d, closed: d === 0, open: '08:00', close: '18:00' },
  );
  const hoursRows = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const h = hours.find((x) => x.day === d)!;
    const closed = el('input', { attrs: { type: 'checkbox', id: `h-${d}-closed`, checked: h.closed } });
    const open = el('input', { attrs: { type: 'time', id: `h-${d}-open`, 'aria-label': `${DAY_NAMES[d]}, abre às`, value: h.open } });
    const close = el('input', { attrs: { type: 'time', id: `h-${d}-close`, 'aria-label': `${DAY_NAMES[d]}, fecha às`, value: h.close } });
    const sync = () => {
      open.disabled = closed.checked;
      close.disabled = closed.checked;
    };
    closed.addEventListener('change', sync);
    sync();
    return el(
      'div',
      { class: 'hours-row', attrs: { 'data-day': d } },
      el('span', { class: 'hours-row__day', text: DAY_NAMES[d]! }),
      open,
      el('span', { class: 'muted', text: 'às' }),
      close,
      el('label', { class: 'hours-row__closed' }, closed, ' Fechado'),
    );
  });

  const formError = el('p', { class: 'form-error', attrs: { role: 'alert', hidden: true } });
  const save = el('button', { class: 'btn btn--label', text: 'Salvar dados da loja', attrs: { type: 'submit' } });

  const form = el(
    'form',
    { class: 'settings', attrs: { novalidate: true } },
    ...SETTINGS_FIELDS.map((g) =>
      el('fieldset', { class: 'settings__group' }, el('legend', { text: g.group }), ...g.fields.map((f) => buildField(f, (s as unknown as Record<string, unknown>)[f.name] ?? '', state))),
    ),
    el('fieldset', { class: 'settings__group' }, el('legend', { text: 'Horário de funcionamento' }), el('p', { class: 'field__error', attrs: { id: 'f-hours-err', hidden: true } }), ...hoursRows),
    formError,
    el('div', { class: 'settings__actions' }, save),
  );

  // Números de latitude/longitude vêm como number; o input precisa de texto
  for (const name of ['latitude', 'longitude'] as const) {
    const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    input.value = s[name] == null ? '' : String(s[name]);
    input.inputMode = 'decimal';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    for (const g of SETTINGS_FIELDS) {
      for (const f of g.fields) {
        const raw = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${f.name}"]`)!.value.trim();
        if (f.kind === 'number') {
          const n = raw ? Number(raw.replace(',', '.')) : null;
          if (raw && !Number.isFinite(n)) errors[f.name] = 'Use só números, ex.: -23.5505';
          values[f.name] = n;
        } else if (f.kind === 'digits') {
          values[f.name] = raw.replace(/\D+/g, '');
        } else if (f.name === 'state') {
          values[f.name] = raw.toUpperCase();
        } else if (f.name === 'instagram' || f.name === 'facebook' || f.name === 'tiktok') {
          values[f.name] = raw;
        } else {
          values[f.name] = raw;
        }
      }
    }

    values['hours'] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day: d,
      closed: form.querySelector<HTMLInputElement>(`#h-${d}-closed`)!.checked,
      open: form.querySelector<HTMLInputElement>(`#h-${d}-open`)!.value || '08:00',
      close: form.querySelector<HTMLInputElement>(`#h-${d}-close`)!.value || '18:00',
    }));

    const parsed = storeSettingsSchema.safeParse(values);
    if (!parsed.success) Object.assign(errors, zodToErrors(parsed.error));
    if (errors['hours']) errors['hours'] = 'Confira os horários: abertura e fechamento não podem ser iguais.';
    if (Object.keys(errors).length) {
      showErrors(form, errors);
      return;
    }

    setBusy(save, true, 'Salvando…');
    const session = (await sb.auth.getSession()).data.session;
    const { error: err } = await sb
      .from('store_settings')
      .update({ ...values, updated_by: session?.user.id ?? null })
      .eq('id', 1);
    setBusy(save, false, 'Salvar dados da loja');
    if (err) {
      formError.textContent = friendlyError(err);
      formError.hidden = false;
      return;
    }
    toast('Dados da loja salvos.');
  });

  panel.replaceChildren(
    el(
      'div',
      { class: 'panel__head' },
      el('h1', { class: 'panel__title', text: 'Dados da loja', attrs: { tabindex: -1 } }),
    ),
    el('p', { class: 'muted', text: 'Endereço, contatos e horários aparecem no site e nos botões de WhatsApp e ligação.' }),
    form,
  );
}

/* =========================================================
   Início
   ========================================================= */

export async function initAdmin() {
  if (!cfg.enabled) {
    show('setup');
    return;
  }

  sb = createClient(cfg.supabaseUrl!, cfg.supabaseAnonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });

  initLogin();
  initRecovery();

  $('[data-logout]').addEventListener('click', async () => {
    await sb.auth.signOut();
    entered = false;
    show('login');
  });
  $('[data-denied-logout]').addEventListener('click', async () => {
    await sb.auth.signOut();
    show('login');
  });
  window.addEventListener('hashchange', () => entered && openTab(currentTab()));

  sb.auth.onAuthStateChange((event, session) => {
    // Evita chamar o banco dentro do callback (recomendação do supabase-js)
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') show('recovery');
      else if (event === 'SIGNED_OUT') {
        entered = false;
        show('login');
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void enter(session);
    }, 0);
  });
}
