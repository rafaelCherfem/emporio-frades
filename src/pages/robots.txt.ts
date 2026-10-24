import type { APIRoute } from 'astro';

// Gerado no build a partir de SITE_URL/BASE_PATH: trocar o domínio não exige editar arquivo.
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  const sitemap = new URL(`${base}sitemap.xml`, site).href;
  const body = `User-agent: *\nAllow: /\nDisallow: ${base}admin\n\nSitemap: ${sitemap}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
