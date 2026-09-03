-- ===========================================================================
-- Equalizador e velocidade por faixa, partilhados entre aparelhos
-- ===========================================================================
--
-- Correr UMA vez no SQL Editor do Supabase. É seguro correr outra vez.
--
-- O que muda, e porquê:
--
-- O que cada música tem de diferente do normal — a velocidade a que a ouves e
-- os ganhos do equalizador — vivia só no armazenamento local do aparelho. O
-- PC e o telemóvel tinham memórias separadas para as MESMAS faixas: mexer no
-- equalizador num deles não chegava ao outro.
--
-- A forma da tabela é a mesma da `user_play_counts`: uma linha por utilizador
-- e faixa, com a faixa identificada pela fonte e pelo id dela. Não se aponta
-- para a tabela `tracks` de propósito — ajusta-se uma música que se está a
-- ouvir a partir da pesquisa, e essa ainda não existe lá.
--
-- ===========================================================================


create table if not exists public.user_track_adjustments (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  source    text not null check (source in ('youtube', 'spotify')),
  source_id text not null,

  -- Velocidade, ou NULL se ficou na normal.
  -- Os limites são os mesmos que a interface oferece.
  rate      real check (rate is null or rate between 0.25 and 4),

  -- Os dez ganhos das bandas, ou NULL se ficaram planos.
  -- O comprimento é fixo: uma linha com nove ou onze não sabe tocar.
  gains     real[] check (gains is null or array_length(gains, 1) = 10),

  -- Quando é que isto foi mexido pela última vez. É ESTE campo que decide
  -- quem ganha quando dois aparelhos mexeram na mesma faixa -- ver
  -- `fundirAjustes` em src/lib/equalizer.ts.
  seen_at   timestamptz not null default now(),

  primary key (user_id, source, source_id),

  -- Uma linha sem nada fora do normal não diz nada, e a app apaga-a em vez de
  -- a guardar. Isto impede que apareça na mesma por outro caminho.
  constraint user_track_adjustments_tem_alguma_coisa
    check (rate is not null or gains is not null)
);

-- A leitura é sempre "todos os meus ajustes", ordenados pelos mais recentes
-- (a app só guarda os 300 mais recentes).
create index if not exists user_track_adjustments_recentes_idx
  on public.user_track_adjustments (user_id, seen_at desc);

alter table public.user_track_adjustments enable row level security;

drop policy if exists "user_track_adjustments: gerir os próprios"
  on public.user_track_adjustments;

-- Os teus ajustes são teus: ninguém os lê nem os escreve. Ao contrário das
-- estatísticas, isto não aparece em perfil nenhum.
create policy "user_track_adjustments: gerir os próprios"
  on public.user_track_adjustments for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Confirmar que ficou
-- ---------------------------------------------------------------------------
-- Deve devolver 1 e 1.

select 'tabela user_track_adjustments' as o_que, count(*)::text as resultado
  from information_schema.tables
  where table_schema = 'public' and table_name = 'user_track_adjustments'
union all
select 'politica de acesso', count(*)::text
  from pg_policies
  where tablename = 'user_track_adjustments';
