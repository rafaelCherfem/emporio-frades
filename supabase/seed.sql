-- Dados reais da loja. Rode depois da migração.
-- Depois disso, tudo pode ser alterado pelo painel (/admin > Dados da loja).

update public.store_settings set
  name = 'Empório Frade’s',
  tagline = 'Rótulos do mundo inteiro e atendimento de quem conhece cada garrafa.',
  about = 'Na Avenida do Cursino, em plena Vila da Saúde, o Frade’s reúne centenas de rótulos num só lugar: tintos, brancos, rosés e espumantes de vários países, cervejas especiais, destilados, taças e acessórios. Procurando o vinho do jantar, um presente ou aquele gin difícil de achar? Passe na loja ou ligue. A gente ajuda a escolher.',
  street = 'Av. do Cursino',
  number = '129',
  district = 'Vila da Saúde',
  city = 'São Paulo',
  state = 'SP',
  zip = '04133-000',
  latitude = -23.6037774,
  longitude = -46.6153218,
  phone = '1135429564',
  whatsapp = '',
  instagram = 'emporiofrades_',
  hours = '[
    {"day":0,"closed":true,"open":"09:00","close":"18:00"},
    {"day":1,"closed":false,"open":"09:00","close":"19:00"},
    {"day":2,"closed":false,"open":"09:00","close":"19:00"},
    {"day":3,"closed":false,"open":"09:00","close":"19:00"},
    {"day":4,"closed":false,"open":"09:00","close":"19:00"},
    {"day":5,"closed":false,"open":"09:00","close":"19:00"},
    {"day":6,"closed":false,"open":"09:00","close":"18:00"}
  ]'::jsonb
where id = 1;

-- Para dar acesso ao dono depois de criar o usuário em Authentication > Users:
-- insert into public.admins (user_id)
--   select id from auth.users where email = 'email-do-dono@exemplo.com';
