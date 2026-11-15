import { supabase } from '../lib/supabase';
import { daLinha, paraALinha, type AlbumGuardado } from '../lib/albunsGuardados';

/**
 * A tabela `saved_albums` (supabase/albuns-guardados.sql). Três pedidos: ler a
 * lista (ao entrar nas Playlists, no máximo de 10 em 10 min: ver
 * state/albunsGuardados.ts), guardar um, tirar um. As músicas não passam por
 * aqui: vêm do YouTube Music quando se abre o álbum.
 */

const COLUNAS = 'album_id,title,artist,year,kind,artwork_url,saved_at';

export async function lerAlbunsGuardados(userId: string): Promise<AlbumGuardado[]> {
  const { data, error } = await supabase
    .from('saved_albums')
    .select(COLUNAS)
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((r) => daLinha(r as Record<string, unknown>)).filter((a): a is AlbumGuardado => !!a);
}

export async function guardarAlbumNoServidor(a: AlbumGuardado): Promise<void> {
  const { error } = await supabase
    .from('saved_albums')
    .upsert(paraALinha(a), { onConflict: 'user_id,album_id' });
  if (error) throw error;
}

export async function tirarAlbumDoServidor(userId: string, albumId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_albums')
    .delete()
    .eq('user_id', userId)
    .eq('album_id', albumId);
  if (error) throw error;
}
