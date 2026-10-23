# Empório Frades

Site do Empório Frades (comidas e bebidas) com painel para o dono atualizar promoções, produtos em alta, novidades, endereço, contatos e horários sem precisar de programador.

- **Site**: Astro + TypeScript, animações com GSAP (ScrollTrigger), fontes hospedadas no próprio site.
- **Conteúdo**: Supabase (banco Postgres + login + fotos), protegido por RLS.
- **Hospedagem**: Cloudflare Pages.
- **Custo**: zero nos planos gratuitos das duas plataformas. Só o domínio (opcional) é pago.

O plano técnico completo (arquitetura, modelo de dados, ameaças, design) está em [`docs/PLANO.md`](docs/PLANO.md) e o relatório de segurança em [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

---

## Rodar no computador

Pré-requisito: **Node.js 24** (ou 22.23+). No Windows: `winget install OpenJS.NodeJS.LTS`.

```bash
npm install
npm run dev          # http://localhost:4321  (painel em /admin)
```

Sem o arquivo `.env`, o site abre em **modo demonstração** com o conteúdo de exemplo de `src/data/seed.ts`.

## Testes

```bash
npm test                         # unitários + segurança + RLS no Postgres (PGlite)
npx playwright install chromium  # só na primeira vez
npm run test:e2e                 # navegador real, com a CSP de produção ligada
npm run audit                    # dependências
```

| Suíte | O que prova |
| --- | --- |
| `tests/unit` | validadores de URL, telefone, e-mail e redes; preço; horário no fuso da loja; schemas; escape de HTML |
| `tests/security/rls.test.ts` | roda a migração num Postgres real e testa as políticas: visitante e usuário comum não escrevem nada, rascunhos ficam ocultos, só admin edita, constraints barram dados inválidos |
| `tests/security/static.test.ts` | CSP e cabeçalhos; varredura do código por `innerHTML`, `eval`, segredos; HTML gerado sem script/estilo embutido |
| `tests/e2e` | site com dados do banco, conteúdo malicioso exibido como texto, banco fora do ar, mapa sob demanda, acessibilidade (axe), login, permissão, criação com foto, exclusão, dados da loja |

---

## Colocar no ar (uma vez)

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo).
2. **SQL Editor** → cole e rode `supabase/migrations/20261023000000_init.sql`. Depois, se quiser, `supabase/seed.sql`.
3. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**. Ninguém se cadastra sozinho.
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do site; em *Redirect URLs* adicione `https://SEU-DOMINIO/admin/` (necessário para "Esqueci a senha").
5. **Authentication → Users → Add user**: crie o usuário do dono (e-mail e uma senha provisória; ele troca depois por "Esqueci a senha").
6. Dê permissão de edição a ele no **SQL Editor**:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'email-do-dono@exemplo.com';
   ```
7. Recomendado: em **Authentication → Multi-Factor**, habilite TOTP.
8. **Project Settings → API**: copie a *Project URL* e a chave **pública** (`anon` ou `publishable`). Nunca use a `service_role`/`secret` no site.

### 2. Cloudflare Pages

1. Suba este repositório para o GitHub.
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → escolha o repositório.
3. Configuração de build:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Variáveis: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` e `NODE_VERSION=24`
4. Domínio próprio (opcional): **Custom domains** no projeto. Atualize `site` em `astro.config.mjs`, `public/robots.txt` e `public/sitemap.xml`.

O build gera `dist/_headers` com a CSP já apontando para o seu Supabase.

---

## Guia rápido para o dono

1. Acesse `https://SEU-DOMINIO/admin` e entre com e-mail e senha. (Salve esse endereço nos favoritos; ele não aparece no site.)
2. Escolha a aba: **Promoções**, **Em alta**, **Novidades** ou **Dados da loja**.
3. Clique em **Nova promoção** (ou **Editar**), preencha e clique em **Publicar**.
4. Recarregue o site: a mudança aparece na hora, sem esperar nada.

Dicas:
- **Promoções** somem do site sozinhas depois da data de término. Uma data de início futura agenda a promoção.
- Desmarque **Publicada no site** para guardar como rascunho.
- Fotos tiradas no celular podem ser enviadas direto: o painel reduz, otimiza e remove a localização da foto antes de subir.
- As setas ↑ ↓ mudam a ordem em que os itens aparecem.
- Em **Dados da loja** ficam endereço, telefone, WhatsApp (e a mensagem que já vem escrita), redes sociais e horários.

---

## Estrutura

```
src/
  pages/index.astro        página pública
  pages/admin/index.astro  painel
  lib/                     regras compartilhadas (schemas, validadores, preço, horário, renderizador seguro)
  scripts/site.ts          conteúdo ao vivo, menu, mapa
  scripts/motion.ts        animações de scroll
  scripts/admin/           painel (formulários, fotos, login)
  styles/                  tokens e estilos
  data/seed.ts             conteúdo de reserva/demonstração
supabase/                  migração, seed
scripts/                   cabeçalhos de segurança, servidor e build de teste
tests/                     unitários, segurança, e2e
```

## Antes de publicar

Dados da loja já preenchidos (em `src/data/seed.ts` e `supabase/seed.sql`): Av. do Cursino, 129, Vila da Saúde, São Paulo, CEP 04133-000; telefone (11) 3542-9564; Instagram @emporiofrades_; seg. a sex. 9h às 19h, sáb. 9h às 18h, dom. fechado. Sem WhatsApp por enquanto: os botões principais mostram "Ligar". Quando houver WhatsApp, basta cadastrar no painel que os botões trocam sozinhos.

- [ ] **Fotos**: as do salão (`public/media/`) vieram do perfil da loja no Google. Confirme com o dono que pode usá-las (ou substitua por fotos próprias, com os mesmos nomes de arquivo). A foto da fachada não foi usada porque é do Street View.
- [ ] **Grafia da marca**: a placa diz "FRADE'S"; Instagram e Google dizem "Frades". O site usa "Frades". Confirmar com o dono.
- [ ] Coordenadas da loja no painel (deixa o mapa exato; sem elas, o mapa busca pelo endereço)
- [ ] Domínio atualizado em `astro.config.mjs`, `robots.txt` e `sitemap.xml`
- [ ] Promoções e produtos reais cadastrados pelo painel (os do modo demonstração nunca aparecem com o Supabase configurado)
