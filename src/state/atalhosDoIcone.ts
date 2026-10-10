import { acaoDoAtalho, type AcaoDoAtalho } from '../lib/atalhosDoIcone';
import { usePlayer } from './player';
import { useMisturaDoDia } from './misturaDoDia';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { getLikedSongs } from '../api/library';
import { contextoDaPrateleira } from '../lib/contextoDaDescoberta';

/**
 * O que os atalhos do ícone FAZEM (lib/atalhosDoIcone.ts): o do iPhone
 * (`hooks/useAtalhosDoIcone.ts`) e a lista de saltos do Windows
 * (`desktop/useBarraDeTarefas.web.ts`, 10/10) são a mesma coisa. `avisar` é o
 * aviso de cada lado (no iPhone o `avisarInfo`, no PC o toast da casca).
 */
export type Avisar = (titulo: string, detalhe?: string) => void;

/** Aceita a ação (Windows) ou o tipo do iOS. */
export async function executarAtalhoDoIcone(acaoOuTipo: string, avisar: Avisar): Promise<void> {
  const acao = (['continuar', 'mistura-do-dia', 'baralhar-gostadas'] as const).find((a) => a === acaoOuTipo)
    ?? acaoDoAtalho(acaoOuTipo);
  if (acao) await executar(acao, avisar);
}

/** A sessão guardada do leitor (a música, a fila, a posição) já foi lida? */
async function sessaoLida(): Promise<void> {
  const persist = (usePlayer as unknown as { persist?: { hasHydrated?: () => boolean } }).persist;
  for (let i = 0; i < 50 && persist?.hasHydrated && !persist.hasHydrated(); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function executar(acao: AcaoDoAtalho, avisar: Avisar): Promise<void> {
  switch (acao) {
    case 'continuar': {
      await sessaoLida();
      const p = usePlayer.getState();
      if (!p.current) { avisar('Nothing to resume', 'Play something and it will be here next time.'); return; }
      if (!p.isPlaying) await p.togglePlay();
      return;
    }
    case 'mistura-do-dia': {
      const m = useMisturaDoDia.getState();
      if (m.estado !== 'pronto' || !m.faixas.length) await m.carregar();
      const faixas = useMisturaDoDia.getState().faixas;
      if (!faixas.length) { avisar('Your Daily mix is not ready yet', 'Try again in a moment.'); return; }
      await usePlayer.getState().playTrack(faixas[0], faixas, true, false, contextoDaPrateleira('flow'),
        { tipo: 'prateleira', nome: 'Daily mix', id: 'doDia' });
      return;
    }
    case 'baralhar-gostadas': {
      const faixas = await lerFaixas(getLikedSongs);
      if (!faixas.length) { avisar('No Liked Songs yet'); return; }
      await usePlayer.getState().playShuffled(faixas, false, { tipo: 'guardadas', nome: 'Liked Songs' });
      return;
    }
  }
}
