-- ===========================================================================
-- Duotone — o username deixa de mudar, e as conversas passam a ter ordem
-- ===========================================================================
-- Correr UMA vez no SQL Editor, depois do profile-media.sql e do
-- social-profiles.sql. Repetível.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) O username é a identidade da conta, como o email
-- ---------------------------------------------------------------------------
-- Muda-se o username e parte-se tudo o que aponta para ele: quem te procura
-- por @nome deixa de te encontrar, e o login por username passa a abrir outra
-- conta (ou nenhuma). O ecrã de edição já não o deixa mudar, mas isto não pode
-- viver só no cliente -- a RPC é chamável à mão.
--
-- Continua a aceitar-se o mesmo valor, porque o editor envia sempre o perfil
-- inteiro; o que se recusa é um valor DIFERENTE. E quem ainda não tem username
-- pode escolher um, uma vez.
create or replace function public.save_profile_appearance(p_value jsonb, p_version bigint, p_name text)
returns void language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid(); atual public.profile_appearance;
  avatar text:=nullif(p_value->>'avatar_path',''); capa text:=nullif(p_value->>'cover_path','');
  novo text; actual_username text;
begin
  if uid is null then raise exception 'Sessão necessária'; end if;
  select * into atual from public.profile_appearance where user_id=uid for update;
  if atual.version is not null and atual.version<>p_version then
    raise exception 'O perfil foi alterado noutro dispositivo' using errcode='40001';
  end if;

  insert into public.profile_appearance(user_id,avatar_path,legacy_avatar_url,cover_path,cover_position,emoji,gradient_index,bio,accent,version)
  values(uid,avatar,nullif(p_value->>'legacy_avatar_url',''),capa,coalesce((p_value->>'cover_position')::real,0.5),
    coalesce(nullif(p_value->>'emoji',''),'🎧'),coalesce((p_value->>'gradient_index')::int,0),
    coalesce(p_value->>'bio',''),coalesce(p_value->>'accent','#A78BFA'),coalesce(atual.version,0)+1)
  on conflict(user_id) do update set avatar_path=excluded.avatar_path,legacy_avatar_url=excluded.legacy_avatar_url,
    cover_path=excluded.cover_path,cover_position=excluded.cover_position,emoji=excluded.emoji,
    gradient_index=excluded.gradient_index,bio=excluded.bio,accent=excluded.accent,version=excluded.version,updated_at=now();

  if p_value ? 'username' then
    novo:=lower(trim(p_value->>'username'));
    select lower(username) into actual_username from public.profiles where id=uid;
    if actual_username is not null and novo<>actual_username then
      raise exception 'O username não pode ser alterado';
    end if;
    if actual_username is null then
      if novo !~ '^[a-z0-9_]{3,30}$' then raise exception 'O username precisa de 3–30 letras, números ou underscores'; end if;
      if exists(select 1 from public.profiles where lower(username)=novo and id<>uid) then raise exception 'Este username já está em uso'; end if;
      update public.profiles set username=novo where id=uid;
    end if;
  end if;

  update public.profiles set name=trim(p_name) where id=uid;
end; $$;
revoke all on function public.save_profile_appearance(jsonb,bigint,text) from public;
grant execute on function public.save_profile_appearance(jsonb,bigint,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Quando é que cada conversa mexeu pela última vez
-- ---------------------------------------------------------------------------
-- A lista de amigos estava por ordem fixa. Ordenar só pelo que se RECEBE dava
-- ordem errada: uma conversa onde a última palavra foi tua não subia. Isto
-- conta as duas direcções, que é o que faz uma lista de conversas.
create or replace function public.conversation_activity()
returns table(outro uuid, ultima timestamptz)
language sql stable security invoker set search_path=public as $$
  select case when s.sender_id=auth.uid() then s.recipient_id else s.sender_id end as outro,
         max(s.created_at) as ultima
  from public.shared_items s
  where s.group_id is null and auth.uid() in (s.sender_id,s.recipient_id)
    and s.recipient_id is not null
  group by 1;
$$;
revoke all on function public.conversation_activity() from public;
grant execute on function public.conversation_activity() to authenticated;

commit;
