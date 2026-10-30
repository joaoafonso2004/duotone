/**
 * O estado que os ícones animados da barra do leitor mostram (30/10, passo 8 de
 * `docs/PLANO-ELEVAR-PC.md`). Fica aqui, e não no componente, para o teste a
 * correr em Node puro: `desktop/IconesDeEstado.web.tsx` só desenha.
 */

/** O shuffle: desligado, ligado, ou inteligente (o que intercala sugestões). */
export type EstadoDoShuffle = 'off' | 'on' | 'smart';

export function estadoDoShuffle(ligado: boolean, inteligente: boolean): EstadoDoShuffle {
  return !ligado ? 'off' : inteligente ? 'smart' : 'on';
}

/** O nível que o ícone do volume mostra: mudo, só o arco de dentro, ou os dois. */
export type NivelDoVolume = 'mudo' | 'baixo' | 'alto';

export function nivelDoVolume(volume: number): NivelDoVolume {
  return !(volume > 0) ? 'mudo' : volume < 50 ? 'baixo' : 'alto';
}
