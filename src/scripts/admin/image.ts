import { isSafeImagePath } from '../../lib/safe';

/**
 * Prepara a foto escolhida no celular/computador antes de subir:
 *  - confere tipo e tamanho;
 *  - redesenha num canvas, o que REMOVE metadados (inclusive localização GPS);
 *  - reduz para no máximo 1600 px e converte para WebP (fica leve para o site).
 */

export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_INPUT = 15 * 1024 * 1024;
const MAX_OUTPUT = 2 * 1024 * 1024; // igual ao limite do bucket
const MAX_SIDE = 1600;

export class ImageError extends Error {}

export async function prepareImage(file: File): Promise<Blob> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImageError('Use uma foto em JPG, PNG, WebP ou AVIF. Fotos do iPhone (HEIC): exporte como JPG antes.');
  }
  if (file.size > MAX_INPUT) throw new ImageError('A foto passa de 15 MB. Escolha uma menor.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('Não foi possível abrir essa imagem. Ela pode estar corrompida.');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('Seu navegador não conseguiu processar a imagem.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
    if (blob && blob.type === 'image/webp' && blob.size <= MAX_OUTPUT) return blob;
    if (blob && blob.type !== 'image/webp') {
      // Navegador sem WebP no canvas: cai para JPEG
      const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
      if (jpg && jpg.size <= MAX_OUTPUT) return jpg;
    }
  }
  throw new ImageError('Mesmo reduzida, a foto ficou grande demais. Tente outra.');
}

/** Caminho no bucket: pasta/ano/uuid.ext — nunca o nome original do arquivo. */
export function imagePathFor(folder: 'promocoes' | 'destaques' | 'novidades', type: string): string {
  const ext = type === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `${folder}/${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  if (!isSafeImagePath(path)) throw new ImageError('Caminho de imagem inválido.');
  return path;
}
