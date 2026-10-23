-- Dados iniciais opcionais. Rode depois da migração.
-- Troque endereço, telefones e redes pelos reais (ou edite depois no painel).

update public.store_settings set
  name = 'Empório Frades',
  tagline = 'Comidas e bebidas escolhidas a dedo, do jeito que a gente gosta de servir em casa.',
  about = 'Queijos curados, frios fatiados na hora, vinhos, cervejas especiais, azeites e aquele pão que acaba antes do almoço. Um empório de bairro, com atendimento de quem conhece cada prateleira.',
  whatsapp_message = 'Olá! Vi o site do Empório Frades e queria fazer uma pergunta.',
  hours = '[
    {"day":0,"closed":false,"open":"09:00","close":"13:00"},
    {"day":1,"closed":false,"open":"08:00","close":"20:00"},
    {"day":2,"closed":false,"open":"08:00","close":"20:00"},
    {"day":3,"closed":false,"open":"08:00","close":"20:00"},
    {"day":4,"closed":false,"open":"08:00","close":"20:00"},
    {"day":5,"closed":false,"open":"08:00","close":"21:00"},
    {"day":6,"closed":false,"open":"08:00","close":"21:00"}
  ]'::jsonb
where id = 1;

-- Para dar acesso ao dono depois de criar o usuário em Authentication > Users:
-- insert into public.admins (user_id)
--   select id from auth.users where email = 'email-do-dono@exemplo.com';
