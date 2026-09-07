import type { Track } from '../types';

/** Numa sessão, fila vazia significa esperar; nunca recorrer à fila pessoal. */
export function proximaFaixa(
  sessao: { fila: readonly { track: Track }[] } | null,
  proximaLocal: () => Track | null,
): Track | null {
  return sessao ? sessao.fila[0]?.track ?? null : proximaLocal();
}

export function decisaoDeControlo(
  sessao: { anfitriao: boolean; convidadosControlam: boolean } | null,
): 'local' | 'anunciar' | 'sugerir' {
  if (!sessao) return 'local';
  return sessao.anfitriao || sessao.convidadosControlam ? 'anunciar' : 'sugerir';
}

/** A ponte é registada pela store da sessão, antes dos efeitos React. */
export type PonteJam = {
  sessao: { id: string };
  fila: readonly { track: Track }[];
  anfitriao: boolean;
  convidadosControlam: boolean;
  sugerir: (track: Track) => Promise<void>;
  anunciarFaixa: (track: Track) => Promise<void>;
  alternarPausa: () => Promise<void>;
  procurar: (ms: number) => Promise<void>;
  avancar: (automatico: boolean) => Promise<void>;
  sairAoFechar: () => Promise<boolean>;
  avisarErro: () => void;
};
