import { useEffect, useRef } from 'react';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { correccaoNecessaria, velocidadeAAplicar } from '../lib/sincronizacao';
import { cachedAudioFile } from '../lib/youtubeCache';
import { appEstaVisivel } from '../lib/appVisibility';

/**
 * O que faz uma sessão de escuta acontecer no leitor.
 *
 * Três trabalhos, e por esta ordem de importância:
 *
 *  1. **A faixa.** A sessão diz qual é; se não for a que está a tocar aqui,
 *     toca-se essa. É a única parte que tem de estar certa sempre -- estar
 *     desencontrado meio segundo é um detalhe, estar noutra música não é ouvir
 *     junto de todo.
 *
 *  2. **Pausa e retoma.** Quem manda carrega em pausa e a música pára em toda a
 *     gente.
 *
 *  3. **O alinhamento.** A parte que se vê nos vídeos e a menos importante das
 *     três. Corrige-se pela velocidade dentro de meio segundo, e só se salta
 *     acima disso. Ver `lib/sincronizacao.ts`.
 *
 * ## Quem obedece a quem
 *
 * Só se obedece à sessão quando NÃO somos nós a mandar nela. Um anfitrião que
 * obedecesse ao seu próprio anúncio entrava em ciclo: mudava a faixa, o servidor
 * respondia com a mudança, e ele voltava a aplicá-la a si próprio.
 *
 * ## Porque é que a espera é visível
 *
 * No Duotone tocar uma faixa é descarregá-la primeiro. Um convidado pode estar
 * trinta segundos sem som nenhum enquanto o anfitrião já vai a meio -- e isso
 * não é avaria, é a rede dele. O `anunciarProntidao` é o que permite à barra da
 * sessão dizer "miguel a descarregar" em vez de deixar toda a gente a olhar
 * para um silêncio sem explicação.
 */

/** De quanto em quanto tempo se compara a nossa posição com a da sessão. */
const AFINACAO_MS = 2000;

export function useSincroniaDaSessao(): void {
  const sessao = useOuvirJuntos((s) => s.sessao);
  const posicaoAgora = useOuvirJuntos((s) => s.posicaoAgora);
  const souAnfitriao = useOuvirJuntos((s) => s.souAnfitriao);
  const anunciarProntidao = useOuvirJuntos((s) => s.anunciarProntidao);

  /** A última faixa que ESTA sessão nos mandou tocar, para não repetir. */
  const ultimaMandada = useRef<string | null>(null);
  const ultimaProntidao = useRef<boolean | null>(null);

  // ---- 1) a faixa -----------------------------------------------------------
  useEffect(() => {
    if (!sessao || souAnfitriao()) return;
    const alvo = sessao.track;
    if (!alvo?.sourceId) return;
    if (ultimaMandada.current === alvo.sourceId) return;

    const actual = usePlayer.getState().current;
    if (actual?.sourceId === alvo.sourceId) {
      ultimaMandada.current = alvo.sourceId;
      return;
    }
    ultimaMandada.current = alvo.sourceId;
    // Sem fila: a sessão manda uma faixa de cada vez. A fila partilhada é a
    // onda 4.
    void usePlayer.getState().playTrack(alvo, [alvo]);
  }, [sessao?.track?.sourceId, sessao?.id, souAnfitriao]);

  // ---- 2) pausa e retoma ----------------------------------------------------
  useEffect(() => {
    if (!sessao || souAnfitriao()) return;
    const p = usePlayer.getState();
    // Só se a faixa for mesmo a da sessão: mandar tocar enquanto ainda
    // descarregamos outra coisa é pedir para tocar o que não está cá.
    if (p.current?.sourceId !== sessao.track?.sourceId) return;
    if (sessao.aTocar === p.isPlaying) return;
    void p.togglePlay();
  }, [sessao?.aTocar, sessao?.track?.sourceId, sessao?.id, souAnfitriao]);

  // ---- 3) o alinhamento -----------------------------------------------------
  useEffect(() => {
    if (!sessao) return;
    const relogio = setInterval(() => {
      const p = usePlayer.getState();
      const s = useOuvirJuntos.getState();
      if (!s.sessao) return;

      // O anfitrião não se corrige a si próprio: ele É a referência.
      if (s.souAnfitriao()) {
        p._setCorrecaoDeSincronia(1);
        return;
      }

      const mesmaFaixa = p.current?.sourceId === s.sessao.track?.sourceId;
      const temFicheiro = !!p.current && cachedAudioFile(p.current.sourceId).exists;

      // A posição da store é de uma amostra anterior; entre amostras ela anda
      // sozinha. Sem isto comparávamos um valor velho com um fresco e
      // corrigíamos um desvio que era só o atraso da nossa própria leitura.
      const decorrido = p.isPlaying ? Date.now() - p.positionAt : 0;

      const correcao = correccaoNecessaria({
        posicaoLocalMs: p.positionMs + decorrido,
        posicaoDaSessaoMs: s.posicaoAgora(),
        aTocar: p.isPlaying && s.sessao.aTocar,
        pronta: mesmaFaixa && temFicheiro,
      });

      if (correcao.tipo === 'saltar') {
        p._setCorrecaoDeSincronia(1);
        void p.seekTo(correcao.paraMs);
        return;
      }
      p._setCorrecaoDeSincronia(velocidadeAAplicar(1, correcao));
    }, AFINACAO_MS);

    return () => {
      clearInterval(relogio);
      usePlayer.getState()._setCorrecaoDeSincronia(1);
    };
  }, [sessao?.id]);

  // ---- o outro lado: quem manda anuncia -------------------------------------
  //
  // Sem isto a sessão era um espelho vazio: o anfitrião trocava de música e mais
  // ninguém sabia. Anuncia-se a MUDANÇA e não o estado a toda a hora -- uma
  // escrita por faixa, não uma por segundo.
  const faixaLocal = usePlayer((s) => s.current?.sourceId);
  const aTocarLocal = usePlayer((s) => s.isPlaying);

  useEffect(() => {
    const s = useOuvirJuntos.getState();
    if (!s.sessao || !s.possoControlar()) return;
    const actual = usePlayer.getState().current;
    if (!actual?.sourceId || actual.sourceId === s.sessao.track?.sourceId) return;
    void s.anunciarFaixa(actual);
  }, [faixaLocal, sessao?.id]);

  useEffect(() => {
    const s = useOuvirJuntos.getState();
    if (!s.sessao || !s.possoControlar()) return;
    const p = usePlayer.getState();
    // Só se já estivermos na faixa da sessão: anunciar uma pausa enquanto ainda
    // se descarrega outra coisa parava a música a toda a gente sem razão.
    if (p.current?.sourceId !== s.sessao.track?.sourceId) return;
    if (p.isPlaying === s.sessao.aTocar) return;
    if (p.isPlaying) void s.anunciarRetoma();
    else void s.anunciarPausa(p.positionMs);
  }, [aTocarLocal, sessao?.id]);

  // ---- e dizer aos outros se já temos a faixa -------------------------------
  useEffect(() => {
    if (!sessao?.track?.sourceId) return;
    const contar = () => {
      if (!appEstaVisivel()) return;
      const alvo = sessao.track?.sourceId;
      if (!alvo) return;
      const pronta = cachedAudioFile(alvo).exists;
      const pct = usePlayer.getState().downloadProgress;
      // Só se anuncia quando MUDA de facto, ou a percentagem enche o realtime
      // de toda a gente com uma escrita por segundo.
      const percentagem = Math.round((pct ?? (pronta ? 1 : 0)) * 100);
      if (ultimaProntidao.current === pronta && !(!pronta && pct != null)) return;
      ultimaProntidao.current = pronta;
      void anunciarProntidao(pronta, percentagem);
    };
    contar();
    const t = setInterval(contar, 3000);
    return () => clearInterval(t);
  }, [sessao?.track?.sourceId, sessao?.id, anunciarProntidao]);
}
