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
 *   visual   -> analyser com suavizacao. Mede a forca grave de cada ataque.
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
  /** Energia grave 0..1. Atualiza tambem o detetor; chamar por fotograma. */
  nivel(agoraMs: number): number;
  /** Envelope 0..1 do ultimo ataque detetado. Le-se depois de `nivel()`. */
  batida(): number;
  /** Presenca 0..1 de pratos, hats e transientes altos. Nao dispara sozinho. */
  agudos(): number;
  /** Os 256 bins suavizados que desenham as linhas do equalizador. O array e
   * sempre o mesmo: quem chama pode envia-lo para a GPU sem alocar. */
  espetro(): Uint8Array;
  estado(): EstadoCaptura;
  /** Suspende/retoma o AudioContext sem perder a captura. */
  definirAtiva(ativa: boolean): void;
  parar(): void;
};

/** Quanto tempo o pico de uma batida demora a esmorecer. Curto de proposito:
 * o efeito e uma pancada, nao uma respiracao. */
const DECAIMENTO_S = 0.085;
/** Janela normal que impede contar duas vezes a cauda do mesmo bombo. */
const INTERVALO_NORMAL_MS = 145;
/** Ritmos densos podem ter ataques separados por menos de 145 ms. Só se abre
 * esta janela curta para um transiente claramente acima do limiar, para nao
 * voltar a introduzir o tremor constante entre batidas. */
const INTERVALO_RAPIDO_MS = 72;
/** Uma janela de ~1 s de fluxo para o limiar adaptativo. */
const JANELA = 30;

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
  // O renderer recebe sempre 256 texels. O analisador usa uma FFT maior para
  // separar os graves em mais bins; `getByteFrequencyData` preenche apenas os
  // 256 valores deste buffer, sem alocar nada no caminho por fotograma.
  const espetro = new Uint8Array(256);

  const fluxos = new Float32Array(JANELA);
  let escritos = 0;
  let cursor = 0;
  let rmsAnterior = 0;
  let pico = 0;
  let energia = 0;
  let energiaAguda = 0;
  let ultimaBatidaMs = 0;
  let ultimoQuadroMs = 0;
  let desejadaAtiva = true;
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
    visual.fftSize = 1024;
    visual.smoothingTimeConstant = 0.68;
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
    // A pista morre se a captura for revogada por fora (fim do frame, o
    // utilizador a parar a partilha). Sem isto ficava a devolver zeros para
    // sempre e ninguem sabia porque.
    s.getAudioTracks()[0]?.addEventListener('ended', () => mudar('indisponivel'));
    mudar('ativa');
    if(!desejadaAtiva)void ctx.suspend().catch(()=>{});
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
      // A exponencial nunca chega matematicamente a zero. Sem este corte o
      // shader continuava a receber um valor minusculo e parecia tremer entre
      // batidas, precisamente quando devia estar completamente quieto.
      if (pico < 0.055) pico = 0;

      if (!desejadaAtiva || estado !== 'ativa' || !detecao || !visual || !tempo) {
        return 0;
      }

      // --- cadeia de detecao: RMS no dominio do tempo ------------------------
      detecao.getFloatTimeDomainData(tempo as any);
      let soma = 0;
      for (let i = 0; i < tempo.length; i++) soma += tempo[i] * tempo[i];
      const rms = Math.sqrt(soma / tempo.length);

      // Só as diferencas POSITIVAS: o que interessa e o ataque, nao a queda.
      const fluxo = Math.max(0, rms - rmsAnterior);
      rmsAnterior = rms;

      // Limiar adaptativo: media + 1.6 desvios da janela ANTERIOR. Incluir o
      // ataque atual no proprio limiar abafava precisamente sequencias
      // rapidas e regulares: cada kick tornava o seguinte mais dificil de
      // detetar. Um limiar fixo continuaria a funcionar numa musica e a
      // falhar noutra, por isso preserva-se a adaptacao ao volume da faixa.
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

      const desdeUltima = agoraMs - ultimaBatidaMs;
      const passouJanelaNormal = desdeUltima > INTERVALO_NORMAL_MS;
      // Dentro da janela curta exige-se um ataque 24% mais forte e que o
      // envelope anterior ja tenha descido. Isto acompanha double-kicks e
      // drops acelerados sem confundir a ressonancia do mesmo kick com outro.
      const ataqueRapidoSeparado = desdeUltima > INTERVALO_RAPIDO_MS
        && fluxo > limiar * 1.24
        && pico < 0.55;

      if (escritos >= 12 && rms > 0.008 && fluxo > limiar && (passouJanelaNormal || ataqueRapidoSeparado)) {
        ultimaBatidaMs = agoraMs;
        const excesso = Math.min(1, (fluxo - limiar) / (limiar + 1e-6));
        // O detetor ja foi medido contra batidas reais; aqui nao se muda o
        // limiar, apenas a amplitude VISUAL. Mesmo um ataque pouco acima do
        // limiar tem de se ler inequivocamente na capa.
        pico = Math.max(pico, 0.82 + 0.18 * excesso);
      }

      // Só depois da decisão é que o quadro atual entra no histórico.
      fluxos[cursor] = fluxo;
      cursor = (cursor + 1) % JANELA;
      if (escritos < JANELA) escritos++;

      // --- cadeia visual: energia suavizada ---------------------------------
      visual.getByteFrequencyData(espetro as any);
      // A energia que move continuamente o shader vem sobretudo dos graves.
      // Com a FFT de 1024 conseguimos isolar 45-260 Hz (bombo + baixo) sem a
      // voz e os pratos esconderem a relação entre imagem e música.
      const hzPorBin = (ctx?.sampleRate ?? 48000) / visual.fftSize;
      const graveInicio = Math.max(1, Math.floor(45 / hzPorBin));
      const graveFim = Math.min(espetro.length, Math.ceil(260 / hzPorBin));
      let totalGrave = 0;
      for (let i = graveInicio; i < graveFim; i++) totalGrave += espetro[i];
      const grave = totalGrave / (Math.max(1, graveFim - graveInicio) * 255);

      // Uma pequena parcela do corpo geral impede que o efeito morra em
      // músicas sem subgrave, mas a leitura continua claramente bass-first.
      let totalCorpo = 0;
      const binsCorpo = Math.floor(espetro.length * 0.5);
      for (let i = 0; i < binsCorpo; i++) totalCorpo += espetro[i];
      const corpo = totalCorpo / (binsCorpo * 255);
      energia = Math.min(1, grave * 0.82 + corpo * 0.18);

      // 3,2-10 kHz: pratos, hi-hats e o ataque mais brilhante da percussao.
      // Usa RMS espectral para um transiente estreito nao desaparecer numa
      // media de muitos bins. Este valor nunca cria movimento por si proprio;
      // apenas muda a textura visual quando o detetor grave abre uma batida.
      const agudoInicio = Math.max(graveFim, Math.floor(3200 / hzPorBin));
      const agudoFim = Math.min(espetro.length, Math.ceil(10000 / hzPorBin));
      let quadradosAgudos = 0;
      for (let i = agudoInicio; i < agudoFim; i++) {
        quadradosAgudos += espetro[i] * espetro[i];
      }
      const rmsAgudo = Math.sqrt(quadradosAgudos / Math.max(1, agudoFim - agudoInicio)) / 255;
      energiaAguda = Math.max(0, Math.min(1, (rmsAgudo - 0.045) / 0.32));

      // No Pen e a media suavizada que comanda continuamente o efeito. A
      // batida segue separada para o shader poder dar-lhe um ataque claro sem
      // transformar a energia de fundo numa sucessao de picos indistintos.
      return energia;
    },
    batida: () => pico,
    agudos: () => energiaAguda,
    espetro: () => espetro,
    definirAtiva(ativa) {
      desejadaAtiva=ativa;
      if(!ctx)return;
      void (ativa?ctx.resume():ctx.suspend()).catch(()=>{});
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
