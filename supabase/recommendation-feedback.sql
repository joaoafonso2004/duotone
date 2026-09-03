-- Preferências privadas de recomendações, partilhadas entre dispositivos.
create table if not exists public.recommendation_feedback (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('track','artist')),
  key text not null check(length(key) between 1 and 300),
  label text not null check(length(label) between 1 and 500),
  primary key(user_id,kind,key)
);
alter table public.recommendation_feedback enable row level security;
drop policy if exists "Preferências próprias" on public.recommendation_feedback;
create policy "Preferências próprias" on public.recommendation_feedback
  for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.recommendation_feedback from anon;
grant select,insert,update,delete on public.recommendation_feedback to authenticated;
