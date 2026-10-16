/** Duplo de src/state/lancamentosNoRadio.ts -- programável pelo `controlo`. */
import type { Track } from '../../src/types.ts';
import { controlo } from './controlo.ts';

export const chaveDoArtistaPrincipal = (t: Track) => String(t.artist ?? '').toLowerCase();

export function lancamentoParaOLote(entrada: {
  sementes: readonly Track[];
  ouvidasNaSessao: readonly Track[];
  podeEntrar: (t: Track) => boolean;
}): Promise<{ faixa: Track; lancamento: any; marcar: () => void } | null> {
  controlo.chamadas.lancamentos++;
  const faixa = controlo.lancamentoNoRadio;
  if (!faixa || !entrada.podeEntrar(faixa)) return Promise.resolve(null);
  return Promise.resolve({
    faixa,
    lancamento: { id: 'OLAK5uy_teste', titulo: 'Novo', tipo: 'Single', ano: '2026', capa: null, artista: faixa.artist, chave: 'x' },
    marcar: () => { controlo.lancamentosMarcados++; },
  });
}
