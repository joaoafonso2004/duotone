-- Leituras por revisão: playlists e histórico, incluindo apagamentos.
-- Idempotente; os clientes antigos continuam a funcionar.
begin;
lock table public.user_play_counts, public.playlists, public.playlist_tracks in share row exclusive mode;

create table if not exists public.user_sync_revisions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plays bigint not null default 0,
  playlists bigint not null default 0
);
create table if not exists public.user_play_count_changes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null,
  source_id text not null,
  revision bigint not null,
  deleted boolean not null default false,
  primary key(user_id,source,source_id)
);
create index if not exists play_count_changes_revision_idx
  on public.user_play_count_changes(user_id,revision);
create table if not exists public.user_playlist_changes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  playlist_id uuid not null, revision bigint not null, deleted boolean not null default false,
  primary key(user_id,playlist_id)
);
create index if not exists playlist_changes_revision_idx on public.user_playlist_changes(user_id,revision);
alter table public.user_sync_revisions enable row level security;
alter table public.user_play_count_changes enable row level security;
alter table public.user_playlist_changes enable row level security;
revoke all on public.user_sync_revisions, public.user_play_count_changes, public.user_playlist_changes from anon, authenticated;

insert into public.user_sync_revisions(user_id)
select distinct user_id from public.user_play_counts on conflict do nothing;
insert into public.user_sync_revisions(user_id,playlists)
select distinct owner_id,1 from public.playlists on conflict(user_id)
do update set playlists=greatest(user_sync_revisions.playlists,1);

-- Uma linha compacta por faixa, mesmo depois de milhares de reproduções.
with missing as (
  select p.user_id,p.source,p.source_id,
    r.plays+row_number() over(partition by p.user_id order by p.source,p.source_id) as revision
  from public.user_play_counts p join public.user_sync_revisions r using(user_id)
  left join public.user_play_count_changes c using(user_id,source,source_id)
  where c.user_id is null
)
insert into public.user_play_count_changes(user_id,source,source_id,revision)
select user_id,source,source_id,revision from missing;
update public.user_sync_revisions r set plays=greatest(r.plays,
  coalesce((select max(c.revision) from public.user_play_count_changes c where c.user_id=r.user_id),0));
with missing as (
  select p.owner_id,p.id,r.playlists+row_number() over(partition by p.owner_id order by p.id) as revision
  from public.playlists p join public.user_sync_revisions r on r.user_id=p.owner_id
  left join public.user_playlist_changes c on c.user_id=p.owner_id and c.playlist_id=p.id where c.user_id is null
)
insert into public.user_playlist_changes(user_id,playlist_id,revision) select owner_id,id,revision from missing;
update public.user_sync_revisions r set playlists=greatest(r.playlists,
  coalesce((select max(c.revision) from public.user_playlist_changes c where c.user_id=r.user_id),0));

create or replace function public.track_play_count_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare who uuid; src text; sid text; rev bigint;
begin
  if tg_op='DELETE' then who:=old.user_id;src:=old.source;sid:=old.source_id;
  else who:=new.user_id;src:=new.source;sid:=new.source_id;end if;
  -- Uma eliminação da própria conta não cria novamente as suas revisões.
  if not exists(select 1 from public.profiles where id=who) then return null;end if;
  insert into public.user_sync_revisions(user_id,plays) values(who,1)
  on conflict(user_id) do update set plays=user_sync_revisions.plays+1
  returning plays into rev;
  insert into public.user_play_count_changes(user_id,source,source_id,revision,deleted)
  values(who,src,sid,rev,tg_op='DELETE') on conflict(user_id,source,source_id)
  do update set revision=excluded.revision,deleted=excluded.deleted;
  return null;
end;$$;
drop trigger if exists track_play_count_change on public.user_play_counts;
create trigger track_play_count_change after insert or update or delete on public.user_play_counts
for each row execute function public.track_play_count_change();

create or replace function public.track_playlist_revision()
returns trigger language plpgsql security definer set search_path=public as $$
declare owners uuid[]; who uuid; pid uuid; rev bigint;
begin
  if tg_table_name='playlists' then
    owners:=case when tg_op='DELETE' then array[old.owner_id]
      when tg_op='INSERT' then array[new.owner_id] else array[old.owner_id,new.owner_id] end;
  else
    select array_agg(distinct owner_id) into owners from public.playlists
    where id in (case when tg_op<>'INSERT' then old.playlist_id end,
                 case when tg_op<>'DELETE' then new.playlist_id end);
  end if;
  for who in select distinct unnest(owners) loop
    if exists(select 1 from public.profiles where id=who) then
      insert into public.user_sync_revisions(user_id,playlists) values(who,1)
      on conflict(user_id) do update set playlists=user_sync_revisions.playlists+1 returning playlists into rev;
      if tg_table_name='playlists' then
        pid:=case when tg_op='DELETE' then old.id else new.id end;
        insert into public.user_playlist_changes(user_id,playlist_id,revision,deleted)
        values(who,pid,rev,tg_op='DELETE' or (tg_op='UPDATE' and who<>new.owner_id))
        on conflict(user_id,playlist_id) do update set revision=excluded.revision,deleted=excluded.deleted;
      else
        for pid in select id from public.playlists where owner_id=who and
          id in(case when tg_op<>'INSERT' then old.playlist_id end,case when tg_op<>'DELETE' then new.playlist_id end) loop
          insert into public.user_playlist_changes(user_id,playlist_id,revision) values(who,pid,rev)
          on conflict(user_id,playlist_id) do update set revision=excluded.revision,deleted=false;
        end loop;
      end if;
    end if;
  end loop;
  if tg_op='DELETE' then return old;else return new;end if;
end;$$;
drop trigger if exists track_playlist_revision on public.playlists;
create trigger track_playlist_revision before insert or update or delete on public.playlists
for each row execute function public.track_playlist_revision();
drop trigger if exists track_playlist_revision on public.playlist_tracks;
create trigger track_playlist_revision after insert or update or delete on public.playlist_tracks
for each row execute function public.track_playlist_revision();

create or replace function public.get_playlist_revision()
returns bigint language sql stable security definer set search_path=public as $$
  select coalesce((select playlists from public.user_sync_revisions where user_id=auth.uid()),0);
$$;

-- Uma única instrução SQL observa cursor e dados no mesmo snapshot MVCC.
-- A paginação é pela revisão, não por offsets que mudam com novas escutas.
create or replace function public.get_play_count_changes(p_after bigint default 0, p_limit integer default 500)
returns jsonb language sql stable security definer set search_path=public as $$
  with state as (
    select coalesce((select plays from public.user_sync_revisions where user_id=auth.uid()),0) as revision
  ), page as (
    select c.* from public.user_play_count_changes c,state s
    where c.user_id=auth.uid() and c.revision>greatest(coalesce(p_after,0),0) and c.revision<=s.revision
    order by c.revision limit greatest(1,least(coalesce(p_limit,500),1000))
  ), result as (
    select c.revision,jsonb_build_object('source',c.source,'source_id',c.source_id,'deleted',c.deleted,
      'title',p.title,'artist',p.artist,'artwork_url',p.artwork_url,'duration_seconds',p.duration_seconds,
      'play_count',p.play_count,'last_played',p.last_played) as item
    from page c left join public.user_play_counts p using(user_id,source,source_id)
  )
  select jsonb_build_object('revision',coalesce((select max(revision) from page),s.revision),
    'more',coalesce((select max(revision) from page),s.revision)<s.revision,
    'changes',coalesce((select jsonb_agg(item order by revision) from result),'[]'::jsonb))
  from state s;
$$;

create or replace function public.get_playlist_changes(p_after bigint default 0)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('revision',coalesce((select playlists from public.user_sync_revisions where user_id=auth.uid()),0),
    'changes',coalesce((select jsonb_agg(jsonb_build_object('playlist_id',playlist_id,'deleted',deleted))
      from public.user_playlist_changes where user_id=auth.uid() and revision>greatest(coalesce(p_after,0),0)),'[]'::jsonb));
$$;
revoke all on function public.track_play_count_change(),public.track_playlist_revision(),
  public.get_playlist_revision(),public.get_playlist_changes(bigint),public.get_play_count_changes(bigint,integer) from public;
grant execute on function public.get_playlist_revision(),public.get_playlist_changes(bigint),public.get_play_count_changes(bigint,integer) to authenticated;
commit;
