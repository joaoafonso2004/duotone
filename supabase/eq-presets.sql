-- ===========================================================================
-- Os presets do equalizador, partilhados entre aparelhos (30/9)
-- ===========================================================================
--
-- POR CORRER À MÃO, uma vez, no SQL Editor do Supabase. É seguro correr outra
-- vez. Sem isto a app funciona na mesma: os presets ficam só no aparelho onde
-- foram criados, e passam para os outros assim que esta tabela existir.
--
-- O que guarda: os presets criados pela pessoa, o que ela mudou nos da app
-- (nome, curva, escondido) e qual vale no carro -- ver
-- src/lib/presetsDoEqualizador.ts.
--
-- A forma é a da `user_track_adjustments`: uma linha por preset, e o
-- `seen_at` decide quem ganha quando dois aparelhos mexeram no mesmo. O
-- conteúdo vai num `jsonb` porque um preset e a escolha do carro têm formas
-- diferentes, e o servidor não precisa de ler nenhuma delas.
-- ===========================================================================

create table if not exists public.user_eq_presets (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  -- 'flat', 'bass', ... para os da app; 'u-...' para os da pessoa; 'carro'.
  preset_id text not null check (char_length(preset_id) between 1 and 64),
  data      jsonb not null check (pg_column_size(data) < 4096),
  seen_at   timestamptz not null default now(),
  primary key (user_id, preset_id)
);

alter table public.user_eq_presets enable row level security;

drop policy if exists "user_eq_presets: gerir os próprios" on public.user_eq_presets;

-- Os teus presets são teus: ninguém os lê nem os escreve.
create policy "user_eq_presets: gerir os próprios"
  on public.user_eq_presets for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- O outro aparelho fica a saber na hora, como nos ajustes por faixa.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_eq_presets')
  then alter publication supabase_realtime add table public.user_eq_presets; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Confirmar que ficou. Deve devolver 1, 1 e 1.
-- ---------------------------------------------------------------------------
select 'tabela user_eq_presets' as o_que, count(*)::text as resultado
  from information_schema.tables
  where table_schema = 'public' and table_name = 'user_eq_presets'
union all
select 'politica de acesso', count(*)::text
  from pg_policies
  where tablename = 'user_eq_presets'
union all
select 'realtime', count(*)::text
  from pg_publication_tables
  where pubname = 'supabase_realtime' and tablename = 'user_eq_presets';
