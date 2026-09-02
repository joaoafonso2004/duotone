-- Uploads privados. Aplicar depois de social-profiles.sql.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-avatars','profile-avatars',false,2097152,array['image/jpeg','image/png','image/webp']),
       ('profile-covers','profile-covers',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.profile_media_readable(bucket text, path text)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and bucket in ('profile-avatars','profile-covers') and
    (split_part(path,'/',1)=auth.uid()::text or exists (
      select 1 from public.profile_appearance a where
        (bucket='profile-avatars' and a.avatar_path=path) or
        (bucket='profile-covers' and a.cover_path=path and public.social_can_view(a.user_id))
    ));
$$;
revoke all on function public.profile_media_readable(text,text) from public;
grant execute on function public.profile_media_readable(text,text) to authenticated;
drop policy if exists "profile media: ler" on storage.objects;
create policy "profile media: ler" on storage.objects for select to authenticated
  using (public.profile_media_readable(bucket_id,name));
drop policy if exists "profile media: carregar próprio" on storage.objects;
create policy "profile media: carregar próprio" on storage.objects for insert to authenticated
  with check (bucket_id in ('profile-avatars','profile-covers') and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "profile media: apagar próprio" on storage.objects;
create policy "profile media: apagar próprio" on storage.objects for delete to authenticated
  using (bucket_id in ('profile-avatars','profile-covers') and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.save_profile_appearance(p_value jsonb, p_version bigint, p_name text)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); atual public.profile_appearance; avatar text:=nullif(p_value->>'avatar_path',''); capa text:=nullif(p_value->>'cover_path','');
begin
  if uid is null then raise exception 'Sessão necessária' using errcode='42501'; end if;
  perform 1 from public.profiles where id=uid for update;
  select * into atual from public.profile_appearance where user_id=uid;
  if coalesce(atual.version,0) <> p_version then raise exception 'O perfil mudou noutro dispositivo. Atualiza antes de guardar.' using errcode='40001'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 40 then raise exception 'O nome deve ter entre 2 e 40 caracteres'; end if;
  if avatar is not null and (split_part(avatar,'/',1)<>uid::text or not exists(select 1 from storage.objects where bucket_id='profile-avatars' and name=avatar)) then raise exception 'Fotografia inválida'; end if;
  if capa is not null and (split_part(capa,'/',1)<>uid::text or not exists(select 1 from storage.objects where bucket_id='profile-covers' and name=capa)) then raise exception 'Capa inválida'; end if;
  insert into public.profile_appearance(user_id,avatar_path,legacy_avatar_url,cover_path,cover_position,emoji,gradient_index,bio,accent,version)
  values(uid,avatar,nullif(p_value->>'legacy_avatar_url',''),capa,coalesce((p_value->>'cover_position')::real,0.5),
    coalesce(nullif(p_value->>'emoji',''),'🎧'),coalesce((p_value->>'gradient_index')::int,0),
    coalesce(p_value->>'bio',''),coalesce(p_value->>'accent','#A78BFA'),coalesce(atual.version,0)+1)
  on conflict(user_id) do update set avatar_path=excluded.avatar_path,legacy_avatar_url=excluded.legacy_avatar_url,
    cover_path=excluded.cover_path,cover_position=excluded.cover_position,emoji=excluded.emoji,
    gradient_index=excluded.gradient_index,bio=excluded.bio,accent=excluded.accent,version=excluded.version,updated_at=now();
  if p_value ? 'username' then
    if lower(trim(p_value->>'username')) !~ '^[a-z0-9_]{3,30}$' then raise exception 'O username precisa de 3–30 letras, números ou underscores'; end if;
    if exists(select 1 from public.profiles where lower(username)=lower(trim(p_value->>'username')) and id<>uid) then raise exception 'Este username já está em uso'; end if;
    update public.profiles set username=lower(trim(p_value->>'username')) where id=uid;
  end if;
  update public.profiles set name=trim(p_name) where id=uid;
end; $$;
revoke all on function public.save_profile_appearance(jsonb,bigint,text) from public;
grant execute on function public.save_profile_appearance(jsonb,bigint,text) to authenticated;
commit;
