/**
 * Caminho de arquivo público respeitando o subcaminho de publicação
 * (ex.: GitHub Pages em /emporio-frades/). Em produção na raiz, vira "/x".
 */
export function asset(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
