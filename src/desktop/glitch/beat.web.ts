/**
 * Glitch equalizer — a DETECAO. De onde vem o "ritmo" a que a capa reage.
 *
 * O player do desktop e o IFrame oficial do YouTube: o audio toca dentro de um
 * frame de outra origem e nao ha nenhum `<audio>` nosso para ligar a um
 * AnalyserNode. A unica via e pedir o som ao proprio Electron.
 *
 * `navigator.mediaDevices.getDisplayMedia()` chega aqui ao
 * `setDisplayMediaRequestHandler` do processo principal (electron/main.cjs),
 * que devolve o WebFrameMain do YouTube no campo `audio` com
 * `enableLocalEcho: true` — captura so daquele frame, e o som CONTINUA a sair
 * pelas colunas. Nada disto precisa de PO Token nem de desligar a webSecurity.
 *
 * DUAS CADEIAS A PARTIR DA MESMA FONTE, e nao se misturam:
 *
 *   visual   -> analyser com suavizacao. Da o "corpo" do efeito.
 *   detecao  -> passa-banda 100-200 Hz -> analyser com smoothingTimeConstant=0
 *               -> RMS no dominio do tempo -> diferencas positivas -> limiar
 *               adaptativo.
 *
 * A suavizacao do analyser e uma media entre fotogramas: e exatamente ela que
 * faz o efeito chegar DEPOIS da batida. Por isso a cadeia de detecao nao pode
 * ter nenhuma, e por isso sao duas e nao uma.
 */

export type EstadoCaptura =
  /** Ainda nao se pediu nada. */
  | 'inativa'
  /** Pedido feito, a espera do Electron. */
  | 'a-pedir'
  /** A analisar som. */
  | 'ativa'
  /** Sem permissao, ou sem suporte. O efeito degrada para estatico. */
  | 'indisponivel';

export type Captura = {
  /** Nivel 0..1 para o shader. Chamar uma vez por fotograma. */
  nivel(agoraMs: number): number;
  estado(): EstadoCaptura;
  parar(): void;
};

/** Quanto tempo o pico de uma batida demora a esmorecer. Curto de proposito:
 * o efeito e uma pancada, nao uma respiracao. */
const DECAIMENTO_S = 0.13;
/** Intervalo minimo entre batidas — 110 ms sao ~545 BPM, longe de qualquer
 * musica real, mas chega para nao contar a mesma pancada duas vezes. */
const INTERVALO_MIN_MS = 110;
/** Uma janela de ~1 s de fluxo para o limiar adaptativo. */
const JANELA = 60;

async function pedirFluxo(): Promise<MediaStream> {
  const md = navigator.mediaDevices as any;
  if (!md?.getDisplayMedia) throw new Error('sem getDisplayMedia');
  // So queremos som. Ha ambientes em que o getDisplayMedia recusa um pedido
  // sem video (a especificacao exige-o), por isso ha segunda tentativa — e as
  // pistas de video, se vierem, morrem ja a seguir.
  let stream: MediaStream;
  try {
    stream = await md.getDisplayMedia({ audio: true, video: false });
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') throw e;
    stream = await md.getDisplayMedia({ audio: true, video: true });
  }
  for (const pista of stream.getVideoTracks()) {
    pista.stop();
    stream.removeTrack(pista);
  }
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('captura sem pista de audio');
  }
  return stream;
}

/**
 * Comeca a captura e devolve JA o handle — `nivel()` da 0 enquanto o pedido
 * nao resolve, e a capa fica limpa. Nada neste caminho pode bloquear a pagina.
 *
 * O `getDisplayMedia` exige ativacao do utilizador. Navegar para o Now Playing
 * e um clique, por isso o pedido imediato costuma passar; quando nao passa (a
 * app abriu ja neste ecra, ou a sessao foi restaurada), arma-se um ouvinte de
 * um so disparo no proximo clique ou tecla. E invisivel para quem usa.
 */
export function iniciarCaptura(aoMudarEstado?: (e: EstadoCaptura) => void): Captura {
  let estado: EstadoCaptura = 'inativa';
  let parado = false;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let visual: AnalyserNode | null = null;
  let detecao: AnalyserNode | null = null;
  let tempo: Float32Array | null = null;
  let espetro: Uint8Array | null = null;

  const fluxos = new Float32Array(JANELA);
  let escritos = 0;
  let cursor = 0;
  let rmsAnterior = 0;
  let pico = 0;
  let energia = 0;
  let ultimaBatidaMs = 0;
  let ultimoQuadroMs = 0;
  let desarmarGesto: (() => void) | null = null;

  const mudar = (e: EstadoCaptura) => {
    if (estado === e) return;
    estado = e;
    aoMudarEstado?.(e);
  };

  const montar = (s: MediaStream) => {
    stream = s;
    ctx = new AudioContext();
    const fonte = ctx.createMediaStreamSource(s);

    visual = ctx.createAnalyser();
    visual.fftSize = 512;
    visual.smoothingTimeConstant = 0.75;
    fonte.connect(visual);

    // 100-200 Hz: bombo e a fundamental do baixo. Acima disto a voz e as
    // guitarras disparam o detetor em sitios que ninguem ouve como batida.
    const passaBanda = ctx.createBiquadFilter();
    passaBanda.type = 'bandpass';
    passaBanda.frequency.value = 150;
    passaBanda.Q.value = 1.1;

    detecao = ctx.createAnalyser();
    detecao.fftSize = 1024;
    detecao.smoothingTimeConstant = 0;
    fonte.connect(passaBanda);
    passaBanda.connect(detecao);

    // NENHUM dos dois vai ao `ctx.destination`: o som ja sai pelas colunas
    // atraves do `enableLocalEcho`. Ligar aqui era ouvi-lo duas vezes.
    tempo = new Float32Array(detecao.fftSize);
    espetro = new Uint8Array(visual.frequencyBinCount);

    // A pista morre se a captura for revogada por fora (fim do frame, o
    // utilizador a parar a partilha). Sem isto ficava a devolver zeros para
    // sempre e ninguem sabia porque.
    s.getAudioTracks()[0]?.addEventListener('ended', () => mudar('indisponivel'));
    mudar('ativa');
  };

  const tentar = async () => {
    if (parado || estado === 'ativa') return;
    mudar('a-pedir');
    try {
      const s = await pedirFluxo();
      if (parado) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      montar(s);
    } catch (e: any) {
      if (parado) return;
      mudar('indisponivel');
      // Falta de ativacao do utilizador: volta-se a tentar no proximo gesto.
      // Qualquer outra falha (sem suporte, sem handler no main) e definitiva.
      const semGesto = e?.name === 'InvalidStateError' || e?.name === 'NotAllowedError';
      if (semGesto && !desarmarGesto) armarGesto();
      else console.warn('[glitch] sem captura de audio:', e);
    }
  };

  function armarGesto() {
    const uma = () => {
      desarmar();
      void tentar();
    };
    const desarmar = () => {
      window.removeEventListener('pointerdown', uma);
      window.removeEventListener('keydown', uma);
      desarmarGesto = null;
    };
    window.addEventListener('pointerdown', uma);
    window.addEventListener('keydown', uma);
    desarmarGesto = desarmar;
  }

  void tentar();

  return {
    estado: () => estado,
    nivel(agoraMs) {
      const dt = ultimoQuadroMs ? Math.min(0.1, (agoraMs - ultimoQuadroMs) / 1000) : 0;
      ultimoQuadroMs = agoraMs;
      pico *= Math.exp(-dt / DECAIMENTO_S);

      if (estado !== 'ativa' || !detecao || !visual || !tempo || !espetro) {
        return Math.min(1, pico);
      }

      // --- cadeia de detecao: RMS no dominio do tempo ------------------------
      detecao.getFloatTimeDomainData(tempo as any);
      let soma = 0;
      for (let i = 0; i < tempo.length; i++) soma += tempo[i] * tempo[i];
      const rms = Math.sqrt(soma / tempo.length);

      // Só as diferencas POSITIVAS: o que interessa e o ataque, nao a queda.
      const fluxo = Math.max(0, rms - rmsAnterior);
      rmsAnterior = rms;

      fluxos[cursor] = fluxo;
      cursor = (cursor + 1) % JANELA;
      if (escritos < JANELA) escritos++;

      // Limiar adaptativo: media + 1.6 desvios da propria janela. Um limiar
      // fixo funcionava numa musica e falhava na seguinte — o que conta e o
      // salto em relacao ao que esta faixa vinha a fazer.
      let media = 0;
      for (let i = 0; i < escritos; i++) media += fluxos[i];
      media /= escritos || 1;
      let variancia = 0;
      for (let i = 0; i < escritos; i++) {
        const d = fluxos[i] - media;
        variancia += d * d;
      }
      const desvio = Math.sqrt(variancia / (escritos || 1));
      const limiar = media + 1.6 * desvio + 2e-4;

      if (escritos >= 12 && fluxo > limiar && agoraMs - ultimaBatidaMs > INTERVALO_MIN_MS) {
        ultimaBatidaMs = agoraMs;
        const excesso = Math.min(1, (fluxo - limiar) / (limiar + 1e-6));
        pico = Math.max(pico, 0.62 + 0.38 * excesso);
      }

      // --- cadeia visual: energia suavizada ---------------------------------
      visual.getByteFrequencyData(espetro as any);
      let total = 0;
      const bins = Math.floor(espetro.length * 0.5);
      for (let i = 0; i < bins; i++) total += espetro[i];
      energia = total / (bins * 255);

      return Math.min(1, 0.25 * energia + 0.9 * pico);
    },
    parar() {
      parado = true;
      desarmarGesto?.();
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      // Fechar o contexto liberta o thread de audio. Deixa-lo aberto era
      // manter uma captura viva para ninguem ver — que e precisamente o que
      // "desligado" tem de evitar.
      void ctx?.close().catch(() => {});
      ctx = null;
      visual = detecao = null;
      mudar('inativa');
    },
  };
}
