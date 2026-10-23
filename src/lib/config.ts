import { safeHttpsUrl } from './safe';

/**
 * Variáveis públicas (vão para o navegador). A chave anon do Supabase é
 * pública por desenho: quem protege os dados é a RLS do banco.
 * NUNCA coloque a service_role aqui.
 */
export interface PublicConfig {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  enabled: boolean;
}

export function readConfig(env: Record<string, string | undefined> = import.meta.env): PublicConfig {
  const url = safeHttpsUrl(env['PUBLIC_SUPABASE_URL'] ?? '')?.replace(/\/$/, '');
  const key = (env['PUBLIC_SUPABASE_ANON_KEY'] ?? '').trim();
  // Formato JWT (legado) ou chave publicável nova (sb_publishable_...)
  const keyOk = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key) || /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (key.startsWith('sb_secret_')) {
    throw new Error('PUBLIC_SUPABASE_ANON_KEY contém uma chave SECRETA. Use a chave pública (anon/publishable).');
  }
  return {
    supabaseUrl: url ?? undefined,
    supabaseAnonKey: keyOk ? key : undefined,
    enabled: Boolean(url && keyOk),
  };
}
