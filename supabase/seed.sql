-- Dados reais da loja. Rode depois da migração.
-- Depois disso, tudo pode ser alterado pelo painel (/admin > Dados da loja).

update public.store_settings set
  name = 'Empório Frade’s',
  tagline = 'Vinhos, espumantes, cervejas especiais e destilados na Avenida do Cursino, com a prateleira cheia e gente que entende do assunto.',
  about = 'Um empório de bairro na Vila da Saúde, com rótulos do mundo inteiro: tintos, brancos e rosés, espumantes para brindar, cervejas especiais, destilados, taças e acessórios. Passe para conhecer ou ligue para saber se temos o que você procura.',
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
