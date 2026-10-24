# Empório Frades

Site do Empório Frade’s (vinhos e bebidas) com painel para o dono atualizar banners da vitrine, promoções, produtos em alta, novidades, endereço, contatos e horários sem precisar de programador.

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
2. **SQL Editor** → cole e rode, nesta ordem, `supabase/migrations/20261023000000_init.sql` e `supabase/migrations/20261024000000_banners.sql`. Depois, se quiser, `supabase/seed.sql`.
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

### Prévia no GitHub Pages (já configurada)

Todo push na `main` roda os testes e publica em `https://<usuario>.github.io/emporio-frades/` (workflow `pages.yml`). Serve para validar visual, animações e navegação. Ali a CSP vai por `<meta>`, porque o Pages não aceita cabeçalhos próprios; a proteção contra iframe (`frame-ancestors`) só existe no Cloudflare. Para o painel funcionar na prévia, cadastre `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` em *Settings → Secrets and variables → Actions → Variables*.

### 2. Cloudflare Pages (produção)

1. Cloudflare → **Workers & Pages → Create application**. Na tela de Workers, clique no link **"Looking to deploy Pages? Get started"** e escolha **Import an existing Git repository**.
2. Autorize o Cloudflare no GitHub (só o repositório `emporio-frades` basta) e selecione o repositório.
3. Configuração de build:
   - Project name: `emporio-frades` (vira `emporio-frades.pages.dev`)
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Variáveis de ambiente (Production):
     - `PUBLIC_SUPABASE_URL` = `https://SEU-PROJETO.supabase.co`
     - `PUBLIC_SUPABASE_ANON_KEY` = chave **publishable**/anon
     - `SITE_URL` = o endereço final, ex. `https://emporio-frades.pages.dev` (depois, o domínio próprio)
     - `NODE_VERSION` = `24`
4. **Save and Deploy**. Todo push na `main` publica de novo sozinho.
5. Supabase → **Authentication → URL Configuration**: *Site URL* = o endereço do Cloudflare; em *Redirect URLs* adicione `https://SEU-ENDERECO/admin/` (mantenha o do GitHub Pages se ainda usar a prévia).

O build gera `dist/_headers` (CSP com o seu Supabase, HSTS, bloqueio de iframe etc.), `robots.txt` e `sitemap.xml`, todos a partir das variáveis acima. Para conferir: `curl -I https://SEU-ENDERECO/` deve mostrar `content-security-policy` e `strict-transport-security`.

**Domínio próprio depois** (ex. `.com.br` no Registro.br): projeto no Cloudflare → **Custom domains → Set up a domain**, siga as instruções de DNS, troque `SITE_URL` para o domínio novo, publique de novo e atualize as URLs no Supabase.

---

## Guia rápido para o dono

1. Acesse `https://SEU-DOMINIO/admin` e entre com e-mail e senha. (Salve esse endereço nos favoritos; ele não aparece no site.)
2. Escolha a aba: **Banners**, **Promoções**, **Em alta**, **Novidades** ou **Dados da loja**.
3. Clique em **Nova promoção** (ou **Editar**), preencha e clique em **Publicar**.
4. Recarregue o site: a mudança aparece na hora, sem esperar nada.

Dicas:
- **Promoções** somem do site sozinhas depois da data de término. Uma data de início futura agenda a promoção.
- Desmarque **Publicada no site** para guardar como rascunho.
- Fotos tiradas no celular podem ser enviadas direto: o painel reduz, otimiza e remove a localização da foto antes de subir.
- As setas ↑ ↓ mudam a ordem em que os itens aparecem.
- **Banners** são os cartazes que passam no topo do site, logo abaixo do toldo. Faça a arte no Canva (ou onde preferir) em **1920 × 720 px** e, se quiser uma versão própria para celular, em **1080 × 1350 px**. Deixe o texto importante longe das bordas. Em "O que o banner diz", escreva o texto da arte (é o que leitores de tela e o Google leem). Com datas de início e fim, o banner entra e sai sozinho. Enquanto não houver nenhum banner publicado, o site mostra três cartazes prontos (espumantes, vinhos, destilados).
- Em **Em alta** e **Novidades**, a foto da garrafa com fundo branco (ou PNG sem fundo) fica com cara de vitrine. Sem foto, o site usa um desenho da bebida escolhido pelo nome/categoria (espumante, tinto, rosé, cerveja, whisky...).
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

Dados da loja já preenchidos (em `src/data/seed.ts` e `supabase/seed.sql`): Empório Frade’s, Av. do Cursino, 129, Vila da Saúde, São Paulo, CEP 04133-000; telefone (11) 3542-9564; Instagram @emporiofrades_; seg. a sex. 9h às 19h, sáb. 9h às 18h, dom. fechado. Sem WhatsApp por enquanto: os botões principais mostram "Ligar". Quando houver WhatsApp, basta cadastrar no painel que os botões trocam sozinhos.

- [x] Grafia da marca: **Empório Frade’s**, como na placa
- [x] Fotos do salão liberadas para uso (`public/media/`)
- [x] Coordenadas: -23.6037774, -46.6153218
- [ ] Domínio atualizado em `astro.config.mjs`, `robots.txt` e `sitemap.xml`
- [ ] Promoções e produtos reais cadastrados pelo painel (os do modo demonstração nunca aparecem com o Supabase configurado)
