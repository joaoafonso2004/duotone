import { useEffect } from 'react';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { precisaDeEmpurrao } from '../lib/arranqueTravado';

/** De quanto em quanto tempo se olha para o relógio da faixa. */
const OLHAR_MS = 1000;

/**
 * A rede do arranque travado, para quem ouve sozinho e para quem ouve
 * acompanhado.
 *
 * ## Porque saiu de dentro do `useSincroniaDaSessao`
 *
 * Nasceu lá porque foi num jam que o vimos. Mas a decisão que ela toma nunca
 * dependeu de haver sessão nenhuma -- só o sítio onde estava pendurada é que
 * dependia. Quem ouvia sozinho tinha o mesmo encravamento e ninguém a
 * apanhá-lo: a faixa ficava nos 0:00 e a única saída era reiniciar a app.
 *
 * Apareceu exactamente assim, e é o que motivou esta mudança: reordenar a fila
 * fazia o pré-carregamento seguir a faixa errada, chegava-se a uma sem
 * ficheiro, e encravava -- fora de qualquer sessão.
 *
 * ## O que ela sabe e o que não sabe
 *
 * Continua a não haver explicação para o encravamento. Isto é um remédio, e é
 * o mesmo que funciona à mão: um seek, e só depois a ordem de tocar. Ver o
 * cabeçalho do `lib/arranqueTravado.ts` para as duas explicações que dei e que
 * estavam ambas erradas.
 *
 * Dentro de uma sessão salta-se para onde a sessão está; sozinho, para o
 * princípio -- que é onde a faixa devia ter começado e nunca começou.
 */
export function useArranqueTravado(): void {
  const faixa = usePlayer((s) => s.current?.sourceId);
  const fonte = usePlayer((s) => s.current?.source);

  useEffect(() => {
    if (!faixa) return;
    // Os contadores vivem na volta do efeito e recomeçam a cada faixa: três
    // tentativas SÃO por faixa, e não três para toda a sessão de audição.
    let empurroes = 0, ultimaPosicao = -1, paradoDesde = Date.now();

    const vigia = setInterval(() => {
      const p = usePlayer.getState();
      // A faixa mudou por baixo: o efeito seguinte trata dela, com contadores
      // limpos.
      if (p.current?.sourceId !== faixa || p.current.source !== fonte) return;

      if (p.positionMs !== ultimaPosicao) {
        ultimaPosicao = p.positionMs;
        paradoDesde = Date.now();
        return;
      }

      // Numa sessão quem manda é a sessão; sozinho, não há ninguém a dizer que
      // se devia estar em pausa, e a intenção do utilizador é a única
      // autoridade que há.
      const sessao = useOuvirJuntos.getState().sessao;
      const mesmaNaSessao = !sessao || sessao.track?.sourceId === faixa;
      if (!mesmaNaSessao) return;

      if (!precisaDeEmpurrao({
        autorizadoATocar: sessao ? sessao.aTocar : true,
        querTocar: p.isPlaying,
        pronta: p.activeBackend !== 'resolving' && !p.buffering,
        posicaoMs: p.positionMs,
        paradoMs: Date.now() - paradoDesde,
        empurroesDados: empurroes,
      })) return;

      empurroes++;
      paradoDesde = Date.now();
      const alvo = sessao ? Math.max(0, useOuvirJuntos.getState().posicaoAgora() ?? 0) : 0;
      void p.seekTo(alvo, true).then(() => {
        const depois = usePlayer.getState();
        if (depois.current?.sourceId !== faixa) return;
        const s = useOuvirJuntos.getState().sessao;
        if (!s || s.aTocar) depois._forcarReproducao(true);
      }).catch(() => {});
    }, OLHAR_MS);

    return () => clearInterval(vigia);
  }, [faixa, fonte]);
}
