/**
 * O menu de um lançamento novo (um álbum, EP ou single da prateleira "New
 * releases"), no clique direito do PC (20/10).
 *
 * Os cartões desta prateleira não tinham menu nenhum: o clique direito não
 * fazia nada, ao lado de prateleiras de faixas em que ele abre o menu de uma
 * faixa. Um lançamento é uma LISTA, por isso o menu fala como o de uma playlist
 * (`lib/menuDaPlaylist.ts`): tocar, baralhar e pôr na fila sem abrir, com as
 * mesmas palavras e pela mesma ordem; depois o que é só dele.
 *
 * Tudo precisa da rede (as faixas vêm do YouTube Music quando se pede) menos ir
 * ao artista: sem rede, as linhas ficam à vista e dizem porquê, como no menu de
 * uma faixa (`MOTIVOS.semRede`).
 *
 * Puro: `scripts/test-menu-do-lancamento.ts`.
 */
import { MOTIVOS } from './menuDaFaixa';

export type AcaoDoLancamento = 'abrir' | 'tocar' | 'baralhar' | 'fila' | 'guardar' | 'artista';

export type LinhaDoLancamento = {
  id: AcaoDoLancamento;
  rotulo: string;
  icone: string;
  inicioDeGrupo?: boolean;
  /** Indisponível agora, e porquê. */
  motivo?: string | null;
};

/** "Album", "EP" ou "Single" como se diz a meio de uma frase. */
function nomeDoTipo(tipo: string): string {
  const t = tipo.trim();
  if (!t) return 'release';
  return t.toUpperCase() === t ? t : t.toLowerCase();
}

export function menuDoLancamento(l: { tipo: string }, s: { semRede: boolean }): LinhaDoLancamento[] {
  const rede = s.semRede ? MOTIVOS.semRede : null;
  return [
    { id: 'abrir', rotulo: `Open ${nomeDoTipo(l.tipo)}`, icone: 'albums-outline', motivo: rede },
    { id: 'tocar', rotulo: 'Play', icone: 'play-outline', inicioDeGrupo: true, motivo: rede },
    { id: 'baralhar', rotulo: 'Shuffle', icone: 'shuffle', motivo: rede },
    { id: 'fila', rotulo: 'Add to queue', icone: 'list-outline', motivo: rede },
    { id: 'guardar', rotulo: 'Save as playlist', icone: 'add-circle-outline', inicioDeGrupo: true, motivo: rede },
    { id: 'artista', rotulo: 'View artist', icone: 'mic-outline' },
  ];
}
