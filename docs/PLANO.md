# Empório Frades: plano técnico

Site institucional e de divulgação para o Empório Frades (comidas e bebidas), com painel simples para o dono atualizar promoções, destaques, novidades e dados da loja sem depender de ninguém.

Restrição de custo: tudo em camadas gratuitas (Cloudflare Pages + Supabase free). Sem chave de API paga.

---

## 1. Objetivos

| Objetivo | Como atendemos |
| --- | --- |
| Divulgar promoções, novidades e produtos em alta | Três seções dinâmicas, editáveis no painel |
| Endereço, mapa, telefone, WhatsApp, redes sociais | Seção "Onde estamos", dados vindos das configurações da loja |
| Dono altera tudo sozinho | Painel `/admin` com formulários simples e login |
| Visual profissional, animações de scroll | Design próprio, GSAP + ScrollTrigger, respeito a `prefers-reduced-motion` |
| Segurança e testes de nível sênior | RLS no banco, CSP estrita, validação nas bordas, suíte de testes (seção 7) |

Fora do escopo agora: loja virtual, pagamento, carrinho. A arquitetura não impede evoluir depois.

---

## 2. Arquitetura

```
Visitante ──► Cloudflare Pages (HTML/CSS/JS estáticos, CDN, headers de segurança)
                 │
                 └─► Supabase REST (somente leitura, chave anon, protegido por RLS)
                       ├─ store_settings  (1 linha)
                       ├─ promotions
                       ├─ highlights
                       └─ news
                 └─► Supabase Storage (bucket público "media", só leitura)

Dono ──► /admin (login Supabase Auth) ──► mesma API, com sessão
                 └─ escreve apenas se estiver na tabela `admins` (RLS)
```

Decisões:

1. **Astro estático.** HTML pronto, JS mínimo, ótimo Lighthouse e SEO local.
2. **Conteúdo ao vivo.** A página carrega um *seed* embutido no build (funciona offline e se o Supabase cair) e depois atualiza com os dados reais via `fetch`. O dono edita e o site reflete sem novo deploy.
3. **Sem `supabase-js` no site público.** Leitura via `fetch` puro (menos bytes). O SDK entra só no `/admin`.
4. **Sem `innerHTML` com dado dinâmico.** Todo texto entra por `textContent`; links e imagens passam por validadores de URL.
5. **Validação dupla.** Zod no navegador e no cliente do admin, `CHECK constraints` no banco. O banco é a fonte final da verdade.

Stack: Astro 5, TypeScript estrito, GSAP (ScrollTrigger), Zod, Supabase, Vitest, Playwright, axe-core.

---

## 3. Modelo de dados

`store_settings` (linha única, `id = 1`): nome, slogan, sobre, endereço (rua, número, bairro, cidade, UF, CEP), latitude/longitude, telefone, WhatsApp (somente dígitos) + mensagem padrão, e-mail, Instagram, Facebook, TikTok, horários por dia da semana (JSON validado).

`promotions`: título, descrição, preço de/por (centavos, inteiro), validade (início/fim), imagem, ordem, `published`.

`highlights` (produtos em alta): nome, descrição curta, preço (centavos, opcional), categoria, imagem, ordem, `published`.

`news` (novidades): título, texto, data de publicação, imagem, `published`.

`admins`: `user_id` de quem pode editar.

Regras: valores em centavos (inteiro), limites de tamanho em todos os textos, `updated_at` automático.

---

## 4. Modelo de ameaças (STRIDE resumido)

| Ameaça | Vetor plausível | Mitigação |
| --- | --- | --- |
| Spoofing | Alguém tenta logar como dono | Supabase Auth, senha forte, MFA recomendado, cadastro público desativado |
| Tampering | Escrever nas tabelas via chave anon | RLS: escrita só para `is_admin()`; testes SQL provam |
| Information disclosure | Ler rascunhos ou tabela `admins` | RLS: público só lê `published`; `admins` sem política pública |
| XSS armazenado | Dono (ou conta invadida) grava `<script>` num título | `textContent`, URLs validadas, CSP sem `unsafe-inline` em scripts |
| Upload malicioso | Arquivo que não é imagem, SVG com script | Bucket limita MIME (jpeg, png, webp, avif) e tamanho; sem SVG; nome gerado no servidor |
| DoS / custo | Abuso da API pública | Leitura é cacheável; limites do plano gratuito; consultas com `limit` |
| Clickjacking | Site embutido em iframe de terceiro | `frame-ancestors 'none'` |
| Supply chain | Pacote npm comprometido | Lockfile, `npm audit` no CI, poucas dependências, SRI não necessário (sem CDN) |
| Vazamento de segredo | Chave no repositório | Só a chave `anon` (pública por desenho) no front; `service_role` nunca entra no projeto |
| Phishing de contato | Telefone/WhatsApp adulterado por conta invadida | Validação rigorosa de formato; log de alterações em `updated_at` |

Risco residual: conta do dono comprometida. Recomendações: senha longa única, MFA TOTP, e-mail de recuperação protegido.

---

## 5. Plano de design

Princípio: o site parece uma loja real, não um template. O fio condutor é a **etiqueta de gôndola** (as etiquetas amarelas de preço nas prateleiras) e a **placa da fachada**.

**Paleta** (tirada da placa da fachada: quadro verde, filete cobre, letras douradas; e das etiquetas amarelas de preço que a loja já usa nas prateleiras)

| Nome | Hex | Uso |
| --- | --- | --- |
| Papel | `#E8EBE2` | fundo principal (cinza esverdeado frio, não creme) |
| Verde da placa | `#1F5E2C` | nome da loja, logo, ícones |
| Verde fundo | `#1B4426` | blocos de cor (promoções, rodapé, mapa) |
| Cobre | `#C08550` / `#8A5322` | filete da logo / categorias e datas (versão escura, contraste AA) |
| Dourado | `#EDC56E` | letras da logo e nome no rodapé |
| Etiqueta | `#F4C430` | exclusivamente nas etiquetas de preço e no botão principal |
| Tinto | `#8C2233` | preço "de" riscado e percentual de desconto |
| Tinta | `#17201B` | texto |

**Tipografia** (hospedada localmente, sem CDN)
- Serifada: **Fraunces** variável (tamanho óptico, peso e eixo SOFT). Nome da loja, títulos de seção, frase de apresentação (itálico), texto "Sobre" com capitular, nomes de produtos e endereço. Dá o tom de rótulo de vinho.
- Grotesca condensada: **Archivo** (eixo de largura). Só na voz de gôndola: etiquetas de preço, selos de desconto e a logo no estilo da placa.
- Texto: **Instrument Sans**, legível e neutra, para parágrafos e botões.

**Movimento**
- Letreiro: letras entram uma a uma (CSS, sem piscar); relevo em verde mais fundo proporcional ao tamanho da letra; no scroll a placa tomba em perspectiva e o relevo cresce.
- Varal de promoções: só trava quando as etiquetas estão inteiras na tela (pé do varal no rodapé da tela), com barra de progresso; em telas baixas (< 600 px) ou celular, vira rolagem lateral comum.
- Toldo: gomos com volume, filete cobre e costura dourada, pendurado na foto do salão; balança de leve com a velocidade do scroll.

**Layout**
- Cabeçalho: logo no estilo da placa (quadro verde, filete cobre, letras douradas) e botão de contato (WhatsApp se houver, senão "Ligar").
- Hero: nome da loja em escala de fachada, ocupando a largura. O eixo de largura da fonte anima no scroll (o momento memorável da página). Abaixo, estado ao vivo: "Aberto agora, fecha às 19h".
- Foto do salão em faixa inteira; o toldo recortado da seção de promoções passa por cima dela, como na fachada.
- Promoções: trilho horizontal fixado (pin) com etiquetas de preço de verdade, rolando lateralmente conforme o scroll vertical. Em celular vira lista rolável.
- Mais procurados: lista no estilo de cardápio, com linha pontilhada entre nome e preço. Sem grade de cartões idênticos.
- Novidades: mural de avisos, entradas com data.
- Onde estamos: endereço, horários com o dia de hoje marcado, mapa, botões de ligar e WhatsApp.

**Revisão contra os clichês** (feita antes de codar)
- Evitado creme + serif + terracota: base fria esverdeada, grotesca condensada.
- Evitado fundo quase preto com acento ácido: verde-garrafa é só bloco de seção, amarelo só em objeto funcional (a etiqueta).
- Evitado kit de cartões iguais com sombra cinza: lista de cardápio e etiquetas com formas próprias.
- Evitados rótulos em caixa-alta acima de títulos, setas "→" em links, numeração decorativa e destaque de uma palavra no título.
- Movimento: um momento orquestrado no hero e o trilho das promoções. O resto não anima por animar.

**Qualidade mínima**: responsivo até 320px, foco visível, contraste AA, `prefers-reduced-motion` respeitado, imagens com `alt` editável.

---

## 6. Segurança em camadas

1. **Borda (Cloudflare `_headers`)**: CSP estrita, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`, COOP.
2. **Aplicação**: sem `eval`, sem `innerHTML` dinâmico, validadores de URL (somente `https:`, `tel:`, `mailto:`), telefone só dígitos, links externos com `rel="noopener noreferrer"`.
3. **Dados**: RLS ligada em todas as tabelas, `is_admin()` com `SECURITY DEFINER` e `search_path` fixo, `CHECK constraints`, bucket com MIME e tamanho limitados.
4. **Autenticação**: cadastro público desligado, MFA recomendado, sessão no padrão do Supabase.
5. **Dependências**: `npm audit` e lockfile, poucas libs.

---

## 7. Estratégia de testes

| Camada | Ferramenta | O que cobre |
| --- | --- | --- |
| Unitário | Vitest | validadores de URL/telefone, formatação de preço, horário de funcionamento, schemas Zod com payloads maliciosos |
| Segurança | Vitest | `_headers` contém CSP sem `unsafe-inline`/`unsafe-eval` em scripts, `frame-ancestors`, HSTS; busca por `innerHTML` e segredos no código |
| Banco | SQL (`supabase/tests/rls.test.sql`) | anon não escreve, anon não lê rascunho, anon não lê `admins`, não-admin autenticado não escreve |
| E2E | Playwright | página carrega, navegação, WhatsApp com número correto, mapa e contato, fallback quando a API falha, admin exige login |
| Acessibilidade | axe-core + Playwright | sem violações sérias na home e no login |
| Performance | build + inspeção | tamanho de JS no público, imagens com dimensões |

---

## 8. Como o dono edita

1. Abre `/admin`, entra com e-mail e senha.
2. Escolhe a aba: Promoções, Em alta, Novidades ou Dados da loja.
3. Preenche o formulário, escolhe a foto, marca "Publicado", salva.
4. O site público mostra a mudança no próximo carregamento, sem deploy.

Princípios do painel: poucos campos, textos claros, botão "Salvar" que vira "Salvo", confirmação antes de apagar, erros que dizem o que corrigir.

---

## 9. Checklist de entrega

- [ ] Build sem erros e sem avisos
- [ ] Testes unitários, de segurança e e2e passando
- [ ] `npm audit` sem vulnerabilidades altas ou críticas
- [ ] Migração SQL revisada e testes de RLS escritos
- [ ] Sem segredos no repositório, `.env.example` documentado
- [ ] README com passo a passo de Supabase, Cloudflare e criação do usuário dono
- [ ] Dados reais da loja preenchidos no painel (endereço, telefones, horários, redes)

---

## 10. Pendências que dependem do cliente

- Endereço, telefones, WhatsApp, redes sociais e horários reais
- Coordenadas exatas da loja (ou endereço para eu localizar)
- Fotos de qualidade da fachada e dos produtos
- Domínio próprio (opcional no começo, vale `.pages.dev` enquanto isso)
- Conta no Supabase e no Cloudflare (ambas gratuitas)
