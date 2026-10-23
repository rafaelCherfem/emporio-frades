# Relatório de segurança

Escopo: código deste repositório (site público, painel `/admin`, migração SQL, cabeçalhos HTTP). Data: 23/10/2026.

## Resumo executivo

O site público é estático e só lê dados já filtrados pelo banco. Toda escrita passa pela RLS do Postgres, que só autoriza contas listadas em `admins`; isso foi provado com testes contra a migração real. O navegador roda com CSP sem `unsafe-inline`/`unsafe-eval` e com Trusted Types obrigatório, e os testes e2e rodam com essa política ligada. Nenhum achado crítico ou alto em aberto. O maior risco residual é o comprometimento da senha do dono.

## Superfície de ataque

| Entrada | Quem acessa | Proteção principal |
| --- | --- | --- |
| Página pública | qualquer pessoa | HTML estático, CSP, dados renderizados só como texto |
| API REST do Supabase (chave anon) | qualquer pessoa | RLS: leitura do publicado; escrita negada |
| Login `/admin` | qualquer pessoa | Supabase Auth (limite de tentativas), cadastro desligado, mensagem genérica de erro |
| Escrita de conteúdo | dono logado | RLS `is_admin()`, CHECK constraints, validação Zod no painel |
| Upload de fotos | dono logado | MIME e tamanho limitados no bucket, caminho validado no banco, sem SVG, nome gerado (UUID) |
| Mapa | visitante, sob clique | iframe com `sandbox`, `frame-src` limitado ao Google |

## Controles e evidências

| Controle | Onde | Teste |
| --- | --- | --- |
| Visitante não escreve em nenhuma tabela nem no storage | migração, RLS + `revoke/grant` | `rls.test.ts` › escrita bloqueada para anon |
| Usuário logado que não é admin não escreve nem se promove | `admins` sem policy de escrita | `rls.test.ts` › usuário logado que NÃO é admin |
| Rascunhos, promoções vencidas/futuras e notícias agendadas ficam ocultos | policies de select | `rls.test.ts` › leitura pública |
| `is_admin()` com `SECURITY DEFINER` e `search_path = ''` | migração | revisão |
| Limites de tamanho, preço coerente, telefone, e-mail, UF, CEP, caminho de imagem | CHECK constraints | `rls.test.ts` › constraints |
| Admin só altera colunas permitidas de `store_settings` (não muda `id`) | `grant update (colunas)` | `rls.test.ts` › admin |
| XSS: texto do banco nunca vira HTML | `vnode.ts` (lista de tags/atributos, escape), `textContent` no painel | `vnode.test.ts`, e2e "conteúdo malicioso" |
| Links só `https:`, `tel:+`, `mailto:` válidos; redes só do domínio oficial | `safe.ts` | `safe.test.ts`, e2e |
| Link externo com `noopener noreferrer` | `vnode.ts`, `index.astro` | `static.test.ts` |
| CSP estrita + Trusted Types + `frame-ancestors 'none'` | `scripts/security-headers.mjs` | `static.test.ts`, e2e com CSP ligada |
| HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP | idem | `static.test.ts`, e2e |
| Painel sem cache e fora dos buscadores | `_headers`, `robots.txt`, `noindex` | e2e |
| Sem `innerHTML`, `eval`, `document.write`, `alert/confirm` | todo `src/` | `static.test.ts` (varredura) |
| Chave secreta nunca vai para o front | `config.ts` recusa `sb_secret_` | `static.test.ts` |
| Fotos sem metadados (GPS) e no tamanho certo | `admin/image.ts` (redesenho em canvas) | e2e "cria uma promoção com foto" |
| Arquivo que não é imagem recusado antes do envio | `admin/image.ts` + bucket | e2e |
| Sem fontes, scripts ou CSS de terceiros | fontes em `/public/fonts` | CSP `'self'` |
| Dependências sem vulnerabilidades conhecidas | `package-lock.json` | `npm audit`: 0 vulnerabilidades |

## Achados durante o desenvolvimento (já corrigidos)

| Achado | Severidade | Correção |
| --- | --- | --- |
| Zod 3 com alerta novo (GHSA-mrhx-c7xc-m3w5): validação de listas enormes pode esgotar memória | Alta | atualizado para Zod 4.6.7, listas limitadas a 200 itens antes de validar e modo `jitless` (sem `new Function`, compatível com a CSP/Trusted Types); teste de regressão em `domain.test.ts` |
| Astro 5 trazia `sharp`/`esbuild` com CVEs (1 crítica, 1 alta) | Alta | atualizado para Astro 7 (0 vulnerabilidades) |
| Links de WhatsApp/Maps/Waze no HTML do build sem `rel="noopener noreferrer"` | Baixa | atributos adicionados; teste de regressão em `static.test.ts` |
| Helper do teste de RLS considerava qualquer `SELECT` como "negado" | Média (teste podia passar no vazio) | helper corrigido e controle positivo adicionado |
| Abertura animada via JS causaria piscar e dependência de script | Baixa (UX) | abertura movida para CSS |

## Riscos residuais e recomendações

1. **Conta do dono comprometida** (phishing, senha repetida). Mitigar: senha longa e única, MFA TOTP no Supabase, e-mail de recuperação protegido com 2FA. Com a conta, um invasor pode alterar textos e o número do WhatsApp; a validação impede scripts e links perigosos, mas não um número trocado. Revise os dados da loja de tempos em tempos.
2. **Abuso da API pública** (muitas leituras). Plano gratuito tem limites; a leitura é leve e limitada (`limit`). Se virar problema, ativar cache no Cloudflare.
3. **Sessão do painel em `localStorage`** (padrão do supabase-js). Mitigado pela CSP + Trusted Types, que dificultam qualquer script injetado. Sair do painel em computadores compartilhados.
4. **Backups**: o plano gratuito do Supabase não guarda backups diários acessíveis. Exportar o banco periodicamente (`pg_dump` ou Dashboard).

## O que não foi verificado

- Teste dinâmico (DAST) contra o ambiente publicado e configuração real do Supabase (sign-up desligado, URLs de redirect). Rodar o checklist do README após o deploy.
- Comportamento do `_headers` diretamente no Cloudflare (testado com servidor que reproduz as regras). Conferir com `curl -I https://SEU-DOMINIO/` depois do deploy.
