import { getPublicProfiles } from '../api/profiles';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getNotificationsEnabled } from '../lib/prefs';
import { useAuth } from '../state/auth';

/** Realtime avisa já; a consulta periódica recupera mensagens após uma quebra. */
export function useDesktopNotifications(abrirSocial: (conversation?:{friendId?:string;groupId?:string}) => void) {
  const userId = useAuth((s) => s.session?.user.id);
  useEffect(() => {
    const desktop = window.duotoneDesktop;
    if (!userId || !desktop?.notifyMessage) return;
    let ativo = true;
    let aConsultar = false;
    let desde = new Date().toISOString();
    const vistos = new Set<string>();
    const avisar = async (r: any) => {
      if (!ativo || r.sender_id === userId || vistos.has(r.id)) return;
      vistos.add(r.id);
      // Limite de memória para uma app que pode ficar semanas no tabuleiro.
      if (vistos.size > 2000) vistos.delete(vistos.values().next().value!);
      if (!await getNotificationsEnabled() || !ativo) return;
      const data = (await getPublicProfiles([r.sender_id]))[0];
      if (!ativo) return;
      desktop.notifyMessage!({
        id: r.id,
        friendId:r.group_id?undefined:r.sender_id,groupId:r.group_id || undefined,
        title: data?.name || 'Duotone',
        body: r.message || (r.item_type === 'playlist' ? 'Shared a playlist with you.' : r.track_data?.title || 'Shared a song with you.'),
      });
    };
    const consultar = async () => {
      if (aConsultar || !ativo) return;
      aConsultar = true;
      try {
        // A RLS inclui os grupos atuais e as mensagens diretas recebidas.
        const { data, error } = await supabase.from('shared_items').select('*')
          .neq('sender_id', userId).gte('created_at', desde)
          .order('created_at', { ascending: true }).limit(200);
        if (error || !ativo) return;
        for (const r of data ?? []) await avisar(r);
        if (data?.length) desde = data[data.length - 1].created_at;
      } catch {
        // Uma falha de rede é recuperada pelo próximo evento ou consulta.
      } finally { aConsultar = false; }
    };
    const canal = supabase.channel(`mensagens-desktop:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shared_items' }, () => {
        // Voltar a ler mantém a mesma filtragem RLS e a ordem do polling.
        void consultar();
      }).subscribe();
    const timer = setInterval(() => void consultar(), 15000);
    const desligarClique = desktop.onNotificationClick?.(abrirSocial);
    void consultar();
    return () => {
      ativo = false;
      clearInterval(timer);
      desligarClique?.();
      void supabase.removeChannel(canal);
    };
  }, [userId, abrirSocial]);
}
