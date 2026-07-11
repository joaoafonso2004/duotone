-- ============================================================
-- Duotone — leitura de playlists partilhadas
-- Correr no SQL Editor do Supabase (uma vez). Idempotente.
--
-- Problema: partilhar uma playlist INTERNA do Duotone guarda o UUID dela em
-- shared_items.playlist_id, mas as políticas de playlists/playlist_tracks só
-- deixavam o DONO ler — o destinatário via a partilha no chat mas não
-- conseguia abrir/importar (leitura devolvia 0 linhas).
--
-- Fix: quem participa numa partilha (remetente ou destinatário) pode LER
-- (só SELECT — editar/apagar continua exclusivo do dono) a playlist
-- partilhada e as suas faixas.
-- ============================================================

drop policy if exists "playlists: ler partilhadas comigo" on public.playlists;
create policy "playlists: ler partilhadas comigo"
  on public.playlists for select
  to authenticated
  using (
    exists (
      select 1 from public.shared_items si
      where si.playlist_id = playlists.id
        and (si.recipient_id = auth.uid() or si.sender_id = auth.uid())
    )
  );

drop policy if exists "playlist_tracks: ler de playlists partilhadas comigo" on public.playlist_tracks;
create policy "playlist_tracks: ler de playlists partilhadas comigo"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.shared_items si
      where si.playlist_id = playlist_tracks.playlist_id
        and (si.recipient_id = auth.uid() or si.sender_id = auth.uid())
    )
  );

-- Verificação:
-- select policyname from pg_policies where tablename in ('playlists','playlist_tracks');
