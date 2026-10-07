import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ouvirAtalhosDoIcone } from '../../modules/duotone-atalhos';
import { acaoDoAtalho, type AcaoDoAtalho } from '../lib/atalhosDoIcone';
import { usePlayer } from '../state/player';
import { useMisturaDoDia } from '../state/misturaDoDia';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { getLikedSongs } from '../api/library';
import { contextoDaPrateleira } from '../lib/contextoDaDescoberta';
import { avisarInfo } from '../lib/avisoDeRemocao';

/**
 * Executa os atalhos do ícone (lib/atalhosDoIcone.ts). Só com conta: os três
 * precisam dela. Uma app aberta por um atalho chega aqui antes de a sessão do
 * leitor estar lida do disco, por isso o "Resume" espera por ela.
 */
export function useAtalhosDoIcone(userId: string | null): void {
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    return ouvirAtalhosDoIcone((tipo) => {
      const acao = acaoDoAtalho(tipo);
      if (acao) void executar(acao).catch(() => {});
    });
  }, [userId]);
}

/** A sessão guardada do leitor (a música, a fila, a posição) já foi lida? */
async function sessaoLida(): Promise<void> {
  const persist = (usePlayer as unknown as { persist?: { hasHydrated?: () => boolean } }).persist;
  for (let i = 0; i < 50 && persist?.hasHydrated && !persist.hasHydrated(); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function executar(acao: AcaoDoAtalho): Promise<void> {
  switch (acao) {
    case 'continuar': {
      await sessaoLida();
      const p = usePlayer.getState();
      if (!p.current) { avisarInfo('Nothing to resume', 'Play something and it will be here next time.'); return; }
      if (!p.isPlaying) await p.togglePlay();
      return;
    }
    case 'mistura-do-dia': {
      const m = useMisturaDoDia.getState();
      if (m.estado !== 'pronto' || !m.faixas.length) await m.carregar();
      const faixas = useMisturaDoDia.getState().faixas;
      if (!faixas.length) { avisarInfo('Your Daily mix is not ready yet', 'Try again in a moment.'); return; }
      await usePlayer.getState().playTrack(faixas[0], faixas, true, false, contextoDaPrateleira('flow'),
        { tipo: 'prateleira', nome: 'Daily mix', id: 'doDia' });
      return;
    }
    case 'baralhar-gostadas': {
      const faixas = await lerFaixas(getLikedSongs);
      if (!faixas.length) { avisarInfo('No Liked Songs yet'); return; }
      await usePlayer.getState().playShuffled(faixas, false, { tipo: 'guardadas', nome: 'Liked Songs' });
      return;
    }
  }
}
