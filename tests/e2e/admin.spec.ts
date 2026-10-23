import { expect, test, type Page } from '@playwright/test';
import { fakeSupabase, promo } from './fake-supabase';

async function login(page: Page, password = 'senha-correta-123') {
  await page.goto('/admin/');
  await page.locator('#email').fill('dono@emporio.com');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Imagem PNG gerada na hora (100x80), sem depender de arquivo no repositório. */
async function pngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 100;
    c.height = 80;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f4c430';
    ctx.fillRect(0, 0, 100, 80);
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

test.describe('painel do dono', () => {
  test.skip(({ isMobile }) => isMobile, 'fluxos do painel testados no desktop');

  test('senha errada mostra mensagem clara e limpa o campo', async ({ page }) => {
    await fakeSupabase(page);
    await login(page, 'errada');
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
    await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('');
  });

  test('usuário logado sem permissão não entra no painel', async ({ page }) => {
    await fakeSupabase(page, { isAdmin: false });
    await login(page);
    await expect(page.getByRole('heading', { name: 'Sem acesso ao painel' })).toBeVisible();
    await expect(page.locator('[data-view="app"]')).toBeHidden();
  });

  test('cria uma promoção com foto: valida, otimiza e envia no formato certo', async ({ page }) => {
    const state = await fakeSupabase(page, { promotions: [promo({ title: 'Existente' })] });
    await login(page);
    await expect(page.getByRole('heading', { name: 'Promoções', level: 1 })).toBeVisible();
    await expect(page.locator('.row__title')).toHaveText(['Existente']);

    await page.getByRole('button', { name: 'Nova promoção' }).click();
    const dialog = page.getByRole('dialog');

    // Validação: preço "por" maior que "de"
    await dialog.getByLabel('Produto').fill('Vinho do Porto');
    await dialog.getByLabel('Preço normal (De)').fill('50,00');
    await dialog.getByLabel('Preço da promoção (Por)').fill('80,00');
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(dialog.locator('#f-price_cents-err')).toHaveText('O preço promocional precisa ser menor que o preço normal');
    await expect(dialog.getByLabel('Preço da promoção (Por)')).toHaveAttribute('aria-invalid', 'true');

    // Formato de dinheiro inválido
    await dialog.getByLabel('Preço da promoção (Por)').fill('abc');
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(dialog.locator('#f-price_cents-err')).toHaveText('Use o formato 24,90');

    // Foto sem descrição é recusada
    await dialog.getByLabel('Preço da promoção (Por)').fill('39,90');
    await dialog.getByLabel('Foto', { exact: true }).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await pngBuffer(page) });
    await expect(dialog.locator('.image-field__preview img')).toHaveAttribute('src', /^blob:/);
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(dialog.locator('#f-image_alt-err')).toHaveText('Descreva a foto em poucas palavras.');

    await dialog.getByLabel('Descrição da foto').fill('Garrafa de vinho do Porto');
    await dialog.getByLabel('Termina em').fill('2099-12-31');
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Publicado.' })).toBeVisible();

    // Upload: caminho gerado (não o nome original), WebP
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]!.path).toMatch(/^promocoes\/\d{4}\/[0-9a-f-]{36}\.webp$/);
    expect(state.uploads[0]!.contentType).toContain('image/webp');

    // Linha gravada no formato do banco
    const row = state.inserts[0]!;
    expect(row.table).toBe('promotions');
    expect(row.body).toMatchObject({
      title: 'Vinho do Porto',
      price_from_cents: 5000,
      price_cents: 3990,
      published: true,
      image_path: state.uploads[0]!.path,
      image_alt: 'Garrafa de vinho do Porto',
      ends_at: '2100-01-01T02:59:59.000Z',
      sort_order: 20,
    });
    expect(row.body).not.toHaveProperty('id');
  });

  test('cria um banner: exige imagem e texto da arte, sobe na pasta de banners', async ({ page }) => {
    const state = await fakeSupabase(page);
    await login(page);
    await page.getByRole('link', { name: 'Banners' }).click();
    await expect(page.getByRole('heading', { name: 'Banners', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Novo banner' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Nome do banner').fill('Espumantes de fim de ano');
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(dialog.locator('#f-image_path-err')).toHaveText('Escolha a imagem.');
    expect(state.inserts).toHaveLength(0);

    await dialog.getByLabel('Imagem (computador)').setInputFiles({ name: 'arte.png', mimeType: 'image/png', buffer: await pngBuffer(page) });
    await dialog.getByLabel('Ao tocar no banner, abrir').fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(dialog.locator('#f-image_alt-err')).toHaveText('Escreva o texto da arte.');
    await expect(dialog.locator('#f-link_url-err')).toContainText('Use um endereço https://');

    await dialog.getByLabel('O que o banner diz').fill('Espumantes com 15% de desconto');
    await dialog.getByLabel('Ao tocar no banner, abrir').fill('#promocoes');
    await dialog.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Publicado.' })).toBeVisible();

    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]!.path).toMatch(/^banners\/\d{4}\/[0-9a-f-]{36}\.webp$/);
    expect(state.inserts[0]).toMatchObject({
      table: 'banners',
      body: {
        title: 'Espumantes de fim de ano',
        image_path: state.uploads[0]!.path,
        image_mobile_path: null,
        image_alt: 'Espumantes com 15% de desconto',
        link_url: '#promocoes',
        published: true,
        sort_order: 10,
      },
    });
  });

  test('arquivo que não é imagem é recusado antes de subir', async ({ page }) => {
    const state = await fakeSupabase(page);
    await login(page);
    await page.getByRole('button', { name: 'Nova promoção' }).click();
    await page.getByRole('dialog').getByLabel('Foto', { exact: true }).setInputFiles({ name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') });
    await expect(page.locator('#f-image_path-err')).toContainText('Use uma foto em JPG, PNG, WebP ou AVIF');
    expect(state.uploads).toHaveLength(0);
  });

  test('apagar pede confirmação', async ({ page }) => {
    await fakeSupabase(page, { promotions: [promo({ title: 'Para apagar' })] });
    await login(page);
    await page.getByRole('button', { name: 'Apagar' }).click();
    const confirm = page.locator('dialog.confirm');
    await expect(confirm).toContainText('Apagar "Para apagar"?');
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.row__title')).toHaveText(['Para apagar']);
    await page.getByRole('button', { name: 'Apagar' }).click();
    await page.locator('dialog.confirm').getByRole('button', { name: 'Apagar' }).click();
    await expect(page.getByText('Nenhum item ainda.')).toBeVisible();
  });

  test('dados da loja: normaliza telefone e recusa e-mail inválido', async ({ page }) => {
    const state = await fakeSupabase(page);
    await login(page);
    await page.getByRole('link', { name: 'Dados da loja' }).click();
    await expect(page.getByRole('heading', { name: 'Dados da loja' })).toBeVisible();

    await page.locator('[data-panel]').getByLabel('E-mail').fill('isso-nao-e-email');
    await page.getByRole('button', { name: 'Salvar dados da loja' }).click();
    await expect(page.locator('#f-email-err')).toHaveText('E-mail inválido');
    expect(state.updates).toHaveLength(0);

    await page.locator('[data-panel]').getByLabel('E-mail').fill('loja@emporio.com.br');
    await page.getByLabel('WhatsApp', { exact: true }).fill('(19) 98888-7777');
    await page.locator('#h-0-closed').uncheck();
    await page.getByLabel('Domingo, abre às').fill('09:00');
    await page.getByLabel('Domingo, fecha às').fill('13:00');
    await page.getByRole('button', { name: 'Salvar dados da loja' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Dados da loja salvos.' })).toBeVisible();

    const body = state.updates.at(-1)!.body;
    expect(body['whatsapp']).toBe('19988887777');
    expect(body['email']).toBe('loja@emporio.com.br');
    expect((body['hours'] as { day: number }[]).find((h) => h.day === 0)).toEqual({ day: 0, closed: false, open: '09:00', close: '13:00' });
  });
});
