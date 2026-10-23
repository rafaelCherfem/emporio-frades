import { afterEach, describe, expect, it, vi } from 'vitest';
import { asset } from '../../src/lib/paths';

afterEach(() => vi.unstubAllEnvs());

describe('asset()', () => {
  it('na raiz', () => {
    vi.stubEnv('BASE_URL', '/');
    expect(asset('media/a.webp')).toBe('/media/a.webp');
    expect(asset('/favicon.svg')).toBe('/favicon.svg');
    expect(asset('')).toBe('/');
  });

  it('em subcaminho (GitHub Pages)', () => {
    vi.stubEnv('BASE_URL', '/emporio-frades/');
    expect(asset('media/a.webp')).toBe('/emporio-frades/media/a.webp');
    expect(asset('')).toBe('/emporio-frades/');
  });
});
