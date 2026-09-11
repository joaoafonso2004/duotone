import { seguirSessao } from '../lib/seguirSessao';
import { useEffect, useRef } from 'react';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { correccaoNecessaria } from '../lib/sincronizacao';
import { assinaturaDaSessao } from '../lib/jam';
import { cachedAudioFile } from '../lib/youtubeCache';
import { appEstaVisivel } from '../lib/appVisibility';
import type { SessaoDeEscuta } from '../api/ouvirJuntos';
import { registar } from '../lib/eventos';

const AFINACAO_MS = 2000;
const DESCANSO_APOS_SALTO_MS = 5000;
const LEITURAS_PARA_SALTAR = 2;
const SALTOS_POR_FAIXA = 2;

/**
 * Quão bom tem de ser o relógio para valer a pena afinar por ele.
 *
 * Metade da tolerância: corrigir um desvio de 600 ms com uma estimativa que
 * pode estar 350 ms errada é mexer no som para perseguir ruído -- e às vezes
 * saltar para MAIS longe do que se estava. Um comando explícito (arrastar a
 * barra, retomar) não passa por aqui, e ainda bem: aí o salto é de segundos e
 * até uma estimativa fraca chega bem.
 */
const INCERTEZA_PARA_AFINAR_MS = 300;

/** Todos seguem o servidor, incluindo quem enviou o comando. Nunca se publica
 * uma confirmação do motor como se fosse uma escolha do utilizador. */
export function useSincroniaDaSessao(): void {
  const sessao = useOuvirJuntos(s => s.sessao);
  const faixaLocal = usePlayer(s => s.current?.sourceId);
  const fonteLocal = usePlayer(s => s.current?.source);
  const anterior = useRef<SessaoDeEscuta | null>(null);

  // Pela ASSINATURA e não pelo objecto: encher a fila não pode cancelar uma
  // faixa a meio de carregar. Ver `assinaturaDaSessao`.
  const assinatura = assinaturaDaSessao(sessao);

  useEffect(() => {
    const agora = useOuvirJuntos.getState().sessao;
    const ultima = anterior.current;
    anterior.current = agora;
    if (!agora) return;
    let cancelado = false;
    const aplicar = () => seguirSessao(agora, ultima, {
      player: usePlayer.getState,
      vigente: () => !cancelado &&
        assinaturaDaSessao(useOuvirJuntos.getState().sessao) === assinatura,
      posicaoAgora: () => useOuvirJuntos.getState().posicaoAgora(),
      guardarRetoma: ms => usePlayer.setState({ resumePositionMs: ms }),
    });
    void aplicar().catch(() => {
      if (!cancelado) useOuvirJuntos.setState({ aviso: 'Could not play this Jam track. Please try again.' });
    });
    return () => { cancelado = true; };
  }, [assinatura, faixaLocal, fonteLocal]);

  const id = sessao?.id;
  const faixa = sessao?.track?.sourceId;
  const fonte = sessao?.track?.source;
  const entradaComecouEm = useOuvirJuntos((s) => s.entradaComecouEm);
  const origemDaEntrada = useOuvirJuntos((s) => s.origemDaEntrada);
  useEffect(() => {
    if (!id || !faixa) return;
    let saltouEm = 0, forasSeguidos = 0, saltosNestaFaixa = 0;
    const relogio = setInterval(() => {
      const p = usePlayer.getState(), s = useOuvirJuntos.getState();
      if (s.sessao?.id !== id || s.sessao.track?.sourceId !== faixa) return;
      if (Date.now() - saltouEm < DESCANSO_APOS_SALTO_MS) return;
      // Afinar com um relógio mal medido é saltar às cegas -- ver a constante.
      if (!s.relogio || s.relogio.incertezaMs > INCERTEZA_PARA_AFINAR_MS) return;
      const pronta = p.current?.sourceId === faixa && p.current.source === fonte &&
        p.activeBackend !== 'resolving' && !p.buffering;
      const decorrido = p.isPlaying ? Date.now() - p.positionAt : 0;
      const correcao = correccaoNecessaria({
        // Dentro da sessão o motor anda a 1x, aconteça o que acontecer à
        // preferência guardada. Usar `p.playbackRate` aqui media o tempo com
        // uma velocidade que o motor não está a praticar.
        posicaoLocalMs: p.positionMs + decorrido,
        posicaoDaSessaoMs: s.posicaoAgora(),
        aTocar: p.isPlaying && s.sessao.aTocar, pronta,
      });
      if (correcao.tipo !== 'saltar') { forasSeguidos = 0; return; }
      if (++forasSeguidos < LEITURAS_PARA_SALTAR || saltosNestaFaixa >= SALTOS_POR_FAIXA) return;
      forasSeguidos = 0;
      saltosNestaFaixa++;
      saltouEm = Date.now();
      void p.seekTo(correcao.paraMs, true);
    }, AFINACAO_MS);
    return () => clearInterval(relogio);
  }, [id, faixa, fonte]);


  useEffect(() => {
    if (!id || !faixa) return;
    let ultima: string | null = null;
    const contar = () => {
      if (!appEstaVisivel()) return;
      const p = usePlayer.getState(), s = useOuvirJuntos.getState();
      if (s.sessao?.id !== id || s.sessao.track?.sourceId !== faixa) return;
      const mesma = p.current?.sourceId === faixa && p.current.source === fonte;
      // No Windows não há ficheiro Expo local: `cachedAudioFile` devolve null.
      // A prontidão vem do player HTML, e consultar `.exists` diretamente
      // deitava abaixo justamente o seguidor que acabámos de montar no PC.
      const ficheiro = cachedAudioFile(faixa);
      const pronta = mesma && (!!ficheiro?.exists || p.activeBackend !== 'resolving' && !p.buffering);
      const percentagem = pronta ? 100 : Math.round((mesma ? p.downloadProgress ?? 0 : 0) * 100);
      const marca = String(pronta) + ':' + percentagem;
      if (marca === ultima) return;
      ultima = marca;
      void s.anunciarProntidao(pronta, percentagem);
      if (pronta && entradaComecouEm) {
        registar('tempo_ate_ready_ms', {
          origem: origemDaEntrada ?? 'app',
          duracao_ms: Math.max(0, Math.min(120_000, Date.now() - entradaComecouEm)),
        });
        useOuvirJuntos.setState({ entradaComecouEm: null, origemDaEntrada: null });
      }
    };
    contar();
    const timer = setInterval(contar, 3000);
    return () => clearInterval(timer);
  }, [id, faixa, fonte, entradaComecouEm, origemDaEntrada]);
}
