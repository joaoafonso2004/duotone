import type { SessaoDeEscuta } from '../api/ouvirJuntos';
import type { usePlayer } from '../state/player';

type Player = ReturnType<typeof usePlayer.getState>;

/** Aplica uma confirmação do servidor sem a transformar noutro comando.
 * O anfitrião e o convidado usam exactamente esta operação. */
export async function seguirSessao(
  sessao: SessaoDeEscuta,
  anterior: SessaoDeEscuta | null,
  porta: {
    player: () => Player;
    vigente: () => boolean;
    posicaoAgora: () => number | null;
    guardarRetoma: (ms: number) => void;
  },
): Promise<void> {
  if (!porta.vigente()) return;
  const alvo = sessao.track;
  if (!alvo) { porta.player().pausePlayback(); return; }
  let p = porta.player();
  if (p.current?.sourceId !== alvo.sourceId || p.current.source !== alvo.source) {
    const carregamento = p.playTrack(alvo, [alvo], false, true);
    // A selecção Jam é síncrona. Aplicar a pausa antes de devolver a vez ao
    // React impede um ficheiro já em cache de arrancar no primeiro render.
    if (porta.vigente() && porta.player().current?.sourceId === alvo.sourceId) {
      porta.player()._sincronizarPausa(sessao.aTocar);
    }
    await carregamento;
  }
  // Sair ou receber outra faixa durante o carregamento invalida a confirmação.
  if (!porta.vigente()) return;
  p = porta.player();
  if (p.current?.sourceId !== alvo.sourceId || p.current.source !== alvo.source) return;
  // Forçar, e não sincronizar: a confirmação é uma ordem, e quem a aplica não
  // sabe em que estado o motor ficou. Ver `_forcarReproducao`.
  p._forcarReproducao(sessao.aTocar);
  // Retomar TAMBÉM é um comando de posição.
  //
  // O `retomar_sessao` mexe no `started_at` e deixa o `paused_position_ms`
  // quieto, por isso a primeira metade desta conta não dispara. E como o
  // `anterior.aTocar` é falso -- estava em pausa, é esse o ponto de partida --
  // a segunda metade também não disparava, e ninguém fazia seek: cada
  // telemóvel despausava quando o SEU evento chegava, e a diferença entre as
  // chegadas ficava lá para o resto da faixa. Ora um à frente, ora o outro,
  // conforme a rede do dia.
  const comandoDePosicao = anterior?.id === sessao.id && anterior.track?.sourceId === alvo.sourceId && (
    anterior.pausadaEmMs !== sessao.pausadaEmMs ||
    (sessao.aTocar && anterior.comecouEmServidor !== sessao.comecouEmServidor)
  );
  const posicao = porta.posicaoAgora();
  if (posicao != null && (!sessao.aTocar || comandoDePosicao)) {
    porta.guardarRetoma(posicao);
    await p.seekTo(posicao, true);
  }
}
