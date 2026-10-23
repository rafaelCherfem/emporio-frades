import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fakeSupabase, promo } from './fake-supabase';

/** Junta erros de JS e violações de CSP para falhar o teste se aparecerem. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|503|net::/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test.describe('site público', () => {
  test('carrega com conteúdo do banco e sem erros de CSP/JS', async ({ page }) => {
    const errors = watchErrors(page);
    await fakeSupabase(page, { promotions: [promo({ title: 'Picanha maturada' })] });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Empório');
    await expect(page.locator('[data-bind="tagline"]')).toHaveText('Frase vinda do banco.');
    await expect(page.locator('.tag__title')).toHaveText(['Picanha maturada']);
    await expect(page.locator('[data-promo-count]')).toHaveText('1 oferta');
    expect(errors).toEqual([]);
  });

  test('links de contato usam os dados do banco, validados', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto('/');
    await expect(page.locator('[data-bind="tagline"]')).toHaveText('Frase vinda do banco.');

    const wa = page.locator('.contacts a[data-link="whatsapp"]');
    await expect(wa).toHaveAttribute('href', 'https://wa.me/5519987654321?text=Oi%2C%20vim%20pelo%20site');
    await expect(wa).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('.contacts a[data-link="phone"]')).toHaveAttribute('href', 'tel:+551933334444');
    await expect(page.locator('a[data-link="maps"]')).toHaveAttribute('href', /google\.com\/maps\/search\/.*-22\.9%2C-47\.06/);
    await expect(page.locator('[data-list="social"] a')).toHaveAttribute('href', 'https://www.instagram.com/emporiofrades/');
    await expect(page.locator('.visit__address')).toContainText('Rua das Oliveiras, 45');
  });

  test('conteúdo malicioso vindo do banco aparece como texto, nunca como código', async ({ page }) => {
    const errors = watchErrors(page);
    let alerted = false;
    page.on('dialog', async (d) => {
      alerted = true;
      await d.dismiss();
    });
    await fakeSupabase(page, {
      promotions: [promo({ title: '<img src=x onerror=alert(1)>', description: '<script>alert(2)</script>' })],
      settings: {
        tagline: '"><svg onload=alert(3)>',
        instagram: 'javascript:alert(4)',
        whatsapp: '',
      },
    });
    await page.goto('/');
    await expect(page.locator('.tag__title')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(page.locator('[data-bind="tagline"]')).toHaveText('"><svg onload=alert(3)>');
    await expect(page.locator('.tag img, .hero svg[onload]')).toHaveCount(0);
    await expect(page.locator('[data-list="social"] a')).toHaveCount(0);
    // Sem WhatsApp cadastrado: botões somem em vez de virar link quebrado
    await expect(page.locator('.contacts a[data-link="whatsapp"]')).toBeHidden();
    expect(alerted).toBe(false);
    expect(errors).toEqual([]);
  });

  test('configuração fora do formato é descartada inteira (não aparece pela metade)', async ({ page }) => {
    await fakeSupabase(page, {
      settings: { tagline: 'Não deveria aparecer', whatsapp: 'abc' },
      promotions: [promo({ title: 'Promo válida chega normalmente' })],
    });
    const settingsLoaded = page.waitForResponse((r) => r.url().includes('/rest/v1/store_settings'));
    await page.goto('/');
    await settingsLoaded;
    // As outras listas válidas continuam chegando; só a linha inválida é descartada
    await expect(page.locator('.tag__title')).toHaveText(['Promo válida chega normalmente']);
    await expect(page.locator('[data-bind="tagline"]')).not.toHaveText('Não deveria aparecer');
    await expect(page.locator('.contacts a[data-link="whatsapp"]')).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+/);
  });

  test('banco fora do ar: o site continua com o conteúdo de reserva', async ({ page }) => {
    await fakeSupabase(page, { failRest: true });
    await page.goto('/');
    await expect(page.locator('.tag').first()).toBeVisible();
    await expect(page.locator('.menu__item').first()).toBeVisible();
    await expect(page.locator('[data-status]')).toBeVisible();
  });

  test('sem promoções ativas mostra o aviso e esconde o trilho', async ({ page }) => {
    await fakeSupabase(page, { promotions: [] });
    await page.goto('/');
    await expect(page.locator('[data-promo-empty]')).toBeVisible();
    await expect(page.locator('[data-rail]')).toBeHidden();
  });

  test('mapa só carrega depois do clique', async ({ page }) => {
    await fakeSupabase(page);
    let google = 0;
    await page.route('https://www.google.com/**', (r) => {
      google++;
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>mapa</p>' });
    });
    await page.goto('/');
    await page.locator('#onde-estamos').scrollIntoViewIfNeeded();
    expect(google).toBe(0);
    await page.getByRole('button', { name: 'Mostrar mapa' }).click();
    await expect(page.locator('[data-map] iframe')).toHaveAttribute('src', /google\.com\/maps\?q=-22\.9%2C-47\.06/);
    await expect(page.locator('[data-map] iframe')).toHaveAttribute('sandbox', /allow-scripts/);
  });

  test('menu do celular abre, fecha com Esc e devolve o foco', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'só no celular');
    await fakeSupabase(page);
    await page.goto('/');
    const toggle = page.locator('[data-nav-toggle]');
    await toggle.click();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('acessibilidade: sem violações sérias (axe)', async ({ page }) => {
    await fakeSupabase(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-bind="tagline"]')).toHaveText('Frase vinda do banco.');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  test('movimento reduzido: o nome aparece direto, sem animação', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fakeSupabase(page);
    await page.goto('/');
    const name = page.locator('[data-hero-name]');
    const anim = await name.evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('none');
  });
});

test.describe('cabeçalhos de segurança', () => {
  test('home e painel com CSP estrita e proteções', async ({ request }) => {
    for (const path of ['/', '/admin/']) {
      const res = await request.get(path);
      const h = res.headers();
      const csp = h['content-security-policy'] ?? '';
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('unsafe-eval');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("require-trusted-types-for 'script'");
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['x-frame-options']).toBe('DENY');
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    }
    const admin = await request.get('/admin/');
    expect(admin.headers()['cache-control']).toBe('no-store');
    expect(admin.headers()['x-robots-tag']).toContain('noindex');
    expect(admin.headers()['content-security-policy']).toContain("frame-src 'none'");
  });
});
