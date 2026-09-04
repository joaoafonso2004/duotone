import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COR, RAIO } from '../tokens.web';
import type { EffectIntensity, GlitchMode } from '../../lib/prefs';
import { criarRenderer, detetarRecorte, type Recorte } from './renderer.web';
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

/**
 * O recorte de cada capa, medido uma vez e guardado por URL.
 *
 * Sem isto, a capa tinha DOIS enquadramentos e trocava de um para o outro
 * a meio do gesto: o canvas corta as barras que o YouTube embrulhou na
 * thumbnail (ver `detetarRecorte`), a `<Image>` simples nao. Arrastar as
 * letras de volta punha `modo` a 'off' antes de o cubo acabar de rodar, e o
 * que se via era a capa a ganhar barras pretas e a perde-las outra vez.
 *
 * Medir por URL e nao por ecra: quem volta a mesma faixa nao paga a leitura
 * de pixeis outra vez, e o recorte ja esta pronto ANTES de a capa ser
 * precisa sem canvas -- e essa antecipacao que evita o salto.
 */
const recortes = new Map<string, Recorte & { largura: number; altura: number }>();

function preferePoucoMovimento(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export function GlitchArtwork({ uri, lado, modo, intensidade }: { uri: string | null; lado: number; modo: GlitchMode; intensidade: EffectIntensity }) {
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

  const [recorte, setRecorte] = useState<(Recorte & { largura: number; altura: number }) | null>(
    () => (uri ? recortes.get(uri) ?? null : null),
  );

  // Capa nova, oportunidade nova: uma falha de CORS numa faixa nao pode
  // condenar as seguintes.
  useEffect(() => setFalhou(false), [uri]);

  // Independente do modo, de proposito: o recorte tem de estar medido antes
  // de o glitch se desligar, senao a troca volta a dar-se a vista de todos.
  useEffect(() => {
    if (!uri) { setRecorte(null); return; }
    const guardado = recortes.get(uri);
    if (guardado) { setRecorte(guardado); return; }
    setRecorte(null);
    let vivo = true;
    const imagem = new window.Image();
    imagem.crossOrigin = 'anonymous';
    imagem.onload = () => {
      if (!vivo) return;
      const largura = imagem.naturalWidth || 1;
      const altura = imagem.naturalHeight || 1;
      const medido = { ...detetarRecorte(imagem, largura, altura), largura, altura };
      recortes.set(uri, medido);
      setRecorte(medido);
    };
    // Sem CORS nao ha medicao possivel; fica o `cover` centrado de sempre.
    imagem.onerror = () => {};
    imagem.src = uri;
    return () => { vivo = false; imagem.onload = null; imagem.onerror = null; };
  }, [uri]);

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
    let ultimoDesenho=0;
    const visibilidade=()=>captura?.definirAtiva(!document.hidden);
    document.addEventListener('visibilitychange',visibilidade);

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
        // O glitch congelado le-se pela energia base, num so `drawArrays`.
        r.desenhar(NIVEL_ESTATICO, 0, 0, SEMENTE_ESTATICA, ESPETRO_ESTATICO);
        return;
      }
      captura = iniciarCaptura();
      captura.definirAtiva(!document.hidden);
      const inicio = performance.now();
      const laco = (agora: number) => {
        if (!vivo) return;
        raf = requestAnimationFrame(laco);
        if(document.hidden||agora-ultimoDesenho<1000/30)return;
        ultimoDesenho=agora;
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
      document.removeEventListener('visibilitychange',visibilidade);
      imagem.onload = null;
      imagem.onerror = null;
      r.destruir();
    };
  }, [comCanvas, efetivo, intensidade, uri, lado]);

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

  // A mesma zona util que o shader amostra, agora tambem em CSS: a escala leva
  // o lado do recorte a preencher a moldura e as margens saem por fora do
  // `overflow: hidden`. Enquanto a medicao nao chegar fica o `cover` de antes.
  const escala = recorte ? lado / recorte.lado : 0;
  const capa = recorte
    ? <Image source={{ uri }} style={{
        position: 'absolute',
        width: recorte.largura * escala,
        height: recorte.altura * escala,
        left: -recorte.x * escala,
        top: -recorte.y * escala,
      }} />
    : <Image source={{ uri }} style={{ position: 'absolute', width: lado, height: lado }} />;

  // A capa fica SEMPRE por baixo, com ou sem canvas. Vale para o modo
  // "off" das Definicoes e para a queda por falta de WebGL ou de CORS, e
  // tapa tambem os primeiros fotogramas em que o canvas ainda esta vazio.
  return (
    <View style={moldura}>
      {capa}
      {/* A `key` obriga a um elemento NOVO sempre que o renderer e refeito, e
          nao e cosmetica: um canvas so tem um contexto WebGL em toda a vida, e
          o `destruir()` do renderer anterior perde-o de proposito para libertar
          memoria da GPU. Reaproveitar o mesmo elemento dava duas coisas, as
          duas silenciosas — o `webglcontextlost` do contexto velho chegava ao
          ouvinte do novo e marcava falha, e o `getContext` seguinte no mesmo
          elemento vinha nulo. O sintoma era a capa passar a imagem simples ao
          mudar de faixa ou de modo. */}
      {comCanvas && <canvas
        key={`${efetivo}|${intensidade}|${uri}|${lado}`}
        ref={canvasRef}
        style={{ position: 'absolute', left: 0, top: 0, width: lado, height: lado, display: 'block' }}
        aria-hidden="true"
      />}
    </View>
  );
}
