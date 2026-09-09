import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import {
  presencaDaFaixa, presencaMudou, type ActividadeDoDiscord,
} from '../lib/presencaDoDiscord';
import { usePlayer } from '../state/player';

/**
 * Publica no Discord o que está a tocar.
 *
 * ## Onde corre
 *
 * Só no PC, e só quando a ponte existe. O Discord expõe-se por um socket
 * local; no iPhone não há nenhum para abrir, e por isso o efeito nem chega a
 * subscrever a store -- não é uma funcionalidade desligada, é uma que não pode
 * existir ali.
 *
 * ## Porque subscreve a store à mão
 *
 * Com `usePlayer(s => ...)` isto redesenhava a cada tique da barra de
 * progresso -- e a posição é justamente o que NÃO deve provocar um envio (ver
 * `presencaMudou`). Com uma subscrição directa, nada nesta árvore volta a
 * renderizar por causa do Discord.
 *
 * ## Falhar é o normal
 *
 * O Discord fechado não é um erro: a ponte devolve `false`, isto desiste em
 * silêncio, e a música continua. Nada aqui pode partir a reprodução.
 */
export function usePresencaDoDiscord(ligado: boolean, appId: string): void {
  const ultima = useRef<ActividadeDoDiscord | null>(null);

  useEffect(() => {
    const ponte = typeof window !== 'undefined'
      ? window.duotoneDesktop?.definirPresencaNoDiscord
      : undefined;
    if (Platform.OS !== 'web' || !ponte) return;

    // Desligar TEM de limpar o que já lá está, e não só parar de enviar: uma
    // presença fica no perfil até alguém a tirar.
    if (!ligado || !appId) {
      if (ultima.current) { ultima.current = null; void ponte(null, null).catch(() => {}); }
      return;
    }

    const publicar = () => {
      const p = usePlayer.getState();
      const actividade = presencaDaFaixa(
        p.current,
        {
          aTocar: p.isPlaying,
          posicaoMs: p.positionMs,
          duracaoMs: p.durationMs || null,
          agora: Date.now(),
        },
        tituloDaFaixa,
        displayArtist,
      );
      if (!presencaMudou(ultima.current, actividade)) return;
      ultima.current = actividade;
      void ponte(appId, actividade as unknown as Record<string, unknown> | null).catch(() => {});
    };

    publicar();
    const parar = usePlayer.subscribe(publicar);
    return () => {
      parar();
      // Ao sair, limpa. Fechar a app com a presença de pé deixava-a lá até o
      // Discord dar pela ligação morta.
      ultima.current = null;
      void ponte(null, null).catch(() => {});
    };
  }, [ligado, appId]);
}
