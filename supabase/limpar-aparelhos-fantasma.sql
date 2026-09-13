-- ============================================================
-- DUOTONE — Apagar os aparelhos fantasma do "Play on another device"
-- Correr UMA vez no SQL Editor. Seguro para voltar a executar.
--
-- ## O que são fantasmas
--
-- O `device_id` de cada aparelho vive no AsyncStorage e MORRE com a app: um
-- iPhone reinstalado é um aparelho novo para a base de dados. Quem instala uma
-- build por versão (o caso do sideload) deixa uma linha em `player_sessions`
-- por instalação, todas com o mesmo nome -- a 12/9 eram OITO linhas "iPhone"
-- na lista, e sete delas nunca mais vão responder a ordem nenhuma.
--
-- A app já não as MOSTRA (agrupa por tipo + nome e fica com o mais recente) e,
-- a partir da 2.7.9, apaga sozinha as que esconde. Isto é para as que ficaram
-- para trás: o gatilho de higiene do `player-sessions.sql` só as apaga aos
-- 30 dias.
--
-- ## A regra
--
-- Por conta, e por TIPO + NOME de aparelho, fica a linha mais recente. É a
-- mesma decisão que a app toma para desenhar a lista -- dois aparelhos com o
-- mesmo nome são indistinguíveis no ecrã, e escolher entre eles não é escolha
-- nenhuma. Se tiveres mesmo dois aparelhos com o mesmo nome, dá-lhes nomes
-- diferentes nas Definições ANTES de correr isto; o que perdem é a oferta de
-- "continuar aqui" até voltarem a abrir a app, que reescreve a linha.
-- ============================================================

-- 1) VER primeiro o que vai desaparecer. Corre só isto, confirma, e só depois
--    corre o DELETE lá em baixo.
select s.device_id,
       s.device_kind,
       coalesce(nullif(btrim(s.device_name), ''), '(sem nome)') as nome,
       s.updated_at,
       now() - s.updated_at as ha_quanto_tempo
  from public.player_sessions s
 where exists (
         select 1
           from public.player_sessions m
          where m.user_id = s.user_id
            and m.device_kind = s.device_kind
            and btrim(coalesce(m.device_name, '')) = btrim(coalesce(s.device_name, ''))
            and m.updated_at > s.updated_at
       )
 order by nome, s.updated_at desc;

-- 2) APAGAR. Fica a linha mais recente de cada tipo+nome.
delete from public.player_sessions s
 where exists (
         select 1
           from public.player_sessions m
          where m.user_id = s.user_id
            and m.device_kind = s.device_kind
            and btrim(coalesce(m.device_name, '')) = btrim(coalesce(s.device_name, ''))
            and m.updated_at > s.updated_at
       );

-- 3) O que sobrou: deve ser uma linha por aparelho teu.
select device_kind,
       coalesce(nullif(btrim(device_name), ''), '(sem nome)') as nome,
       updated_at
  from public.player_sessions
 order by updated_at desc;
