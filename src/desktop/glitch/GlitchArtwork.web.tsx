import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COR, RAIO } from '../tokens.web';
import type { ArtworkEffect, EffectIntensity, GlitchMode } from '../../lib/prefs';
import { criarRenderer } from './renderer.web';
import { iniciarCaptura, type Captura } from './beat.web';

/**
 * A capa do Now Playing, com o glitch equalizer por cima.
 *
 * Os tres estados sao mesmo tres coisas diferentes — nao ha aqui uma opcao
 * decorativa a fingir que faz alguma coisa:
 *
 *   reactive  canvas + captura de audio. O glitch segue a musica.
 *   static    canvas com um glitch CONGELADO num nivel fixo. Sem captura, sem
 *             animacao, sem rAF: um so `drawArrays` em toda a vida do ecra.
 *   off       so a capa. Nao se monta canvas nenhum.
 *
 * `prefers-reduced-motion` forca `static`: um efeito de glitch e exatamente o
 * tipo de coisa que essa preferencia existe para travar, e assim quem a tem
 * ligada continua a ver a identidade do ecra, apenas parada.
 *
 * Qualquer falha (sem WebGL, capa que a CORS recusa, contexto perdido) cai
 * para a capa normal. O efeito nunca pode ser a razao de nao se ver o disco.
 */

/** O glitch fixo do modo estatico. Alto que se veja, baixo que a capa continue
 * legivel; o tempo e uma semente escolhida a olho pelo aspeto da banda. */
const NIVEL_ESTATICO = 0.64;
const SEMENTE_ESTATICA = 3.9;
const ESPETRO_ESTATICO = new Uint8Array(256);
for (let i = 0; i < ESPETRO_ESTATICO.length; i++) {
  // Curva fixa a descer: as linhas continuam a parecer um equalizador mesmo
  // sem se abrir captura nenhuma neste modo.
  ESPETRO_ESTATICO[i] = Math.round(210 * Math.exp(-i / 72) + 18 * (1 - i / 255));
}

function preferePoucoMovimento(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function GlitchArtwork({ uri, lado, modo, efeito, intensidade }: { uri: string | null; lado: number; modo: GlitchMode; efeito: ArtworkEffect; intensidade: EffectIntensity }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [poucoMovimento, setPoucoMovimento] = useState(preferePoucoMovimento);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const ouvir = () => setPoucoMovimento(mq.matches);
    mq.addEventListener('change', ouvir);
    return () => mq.removeEventListener('change', ouvir);
  }, []);

  // Capa nova, oportunidade nova: uma falha de CORS numa faixa nao pode
  // condenar as seguintes.
  useEffect(() => setFalhou(false), [uri]);

  const efetivo: GlitchMode = modo === 'reactive' && poucoMovimento ? 'static' : modo;
  const comCanvas = efetivo !== 'off' && !!uri && !falhou;

  useEffect(() => {
    if (!comCanvas || !uri) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reativo = efetivo === 'reactive';
    const r = criarRenderer(canvas, {
      preservarBuffer: !reativo,
      aoPerderContexto: () => setFalhou(true),
      estilo: efeito,
      intensidade,
    });
    if (!r) {
      setFalhou(true);
      return;
    }
    r.redimensionar(lado);

    let vivo = true;
    let raf = 0;
    let captura: Captura | null = null;

    const imagem = new window.Image();
    // Testado com i.ytimg.com: as miniaturas deixam-se ler. Sem isto a tela
    // fica contaminada e o `texImage2D` atira.
    imagem.crossOrigin = 'anonymous';
    imagem.onload = () => {
      if (!vivo) return;
      r.definirTextura(imagem);
      if (!r.temTextura()) {
        setFalhou(true);
        return;
      }
      if (!reativo) {
        // O glitch congelado le-se pela energia base; a onda, por definicao,
        // precisa de um envelope aberto para ficar visivel num unico frame.
        if (efeito === 'waves') r.desenhar(0.14, 0.72, 0.24, SEMENTE_ESTATICA, ESPETRO_ESTATICO);
        else r.desenhar(NIVEL_ESTATICO, 0, 0, SEMENTE_ESTATICA, ESPETRO_ESTATICO);
        return;
      }
      captura = iniciarCaptura();
      const inicio = performance.now();
      const laco = (agora: number) => {
        if (!vivo) return;
        raf = requestAnimationFrame(laco);
        // O array do espectro e sempre o mesmo: 256 bytes para a textura, uma
        // escrita de uniforms e um drawArrays, sem alocacoes por fotograma.
        const energiaGrave = captura!.nivel(agora);
        const batida = captura!.batida();
        const agudos = captura!.agudos();
        // Entre batidas o nivel enviado e zero: a capa repousa limpa. Durante
        // o ataque, a energia grave so modula a intensidade da pancada — nao
        // cria um segundo movimento continuo por baixo dela.
        const nivelDoAtaque = batida > 0 ? energiaGrave * batida * 0.18 : 0;
        r.desenhar(nivelDoAtaque, batida, agudos, (agora - inicio) / 1000, captura!.espetro());
      };
      raf = requestAnimationFrame(laco);
    };
    imagem.onerror = () => {
      if (vivo) setFalhou(true);
    };
    imagem.src = uri;

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      // "Desligado" tem de desligar a captura, e sair do ecra conta: ficar a
      // analisar som para ninguem ver gasta CPU e mantem aberta uma permissao
      // de captura sem motivo.
      captura?.parar();
      imagem.onload = null;
      imagem.onerror = null;
      r.destruir();
    };
  }, [comCanvas, efetivo, efeito, intensidade, uri, lado]);

  const moldura = {
    width: lado,
    height: lado,
    borderRadius: RAIO.superficie,
    overflow: 'hidden' as const,
    backgroundColor: COR.elevado,
  };

  if (!uri) {
    return (
      <View style={[moldura, { alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="musical-note" size={Math.round(lado * 0.3)} color={COR.textoFraco} />
      </View>
    );
  }

  if (!comCanvas) {
    return <Image source={{ uri }} style={moldura} />;
  }

  return (
    <View style={moldura}>
      {/* A `key` obriga a um elemento NOVO sempre que o renderer e refeito, e
          nao e cosmetica: um canvas so tem um contexto WebGL em toda a vida, e
          o `destruir()` do renderer anterior perde-o de proposito para libertar
          memoria da GPU. Reaproveitar o mesmo elemento dava duas coisas, as
          duas silenciosas — o `webglcontextlost` do contexto velho chegava ao
          ouvinte do novo e marcava falha, e o `getContext` seguinte no mesmo
          elemento vinha nulo. O sintoma era a capa passar a imagem simples ao
          mudar de faixa ou de modo. */}
      <canvas
        key={`${efetivo}|${efeito}|${intensidade}|${uri}|${lado}`}
        ref={canvasRef}
        style={{ width: lado, height: lado, display: 'block' }}
        aria-hidden="true"
      />
    </View>
  );
}
