// Build usado só pelos testes e2e: aponta para um Supabase fictício
// (as chamadas são interceptadas pelo Playwright) e sai em dist-test/.
// Funciona igual no Windows, Linux e macOS.
import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co',
  PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.dGVzdA',
};
const r = spawnSync('npx', ['astro', 'build', '--outDir', 'dist-test'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
