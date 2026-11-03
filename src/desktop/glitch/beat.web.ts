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
 *
 * E DOIS RELOGIOS, pela mesma razao. A cadeia visual vem no laco de desenho,
 * que e limitado para a app nao aquecer; a de detecao tem o seu, mais fino,
 * onde nenhum ataque lhe escapa por entre dois quadros (PASSO_DETECAO_MS).
 *
 * O andamento (S3, `lib/compasso.ts`) sai dos mesmos ataques: nao ha outra analise,
 * so a lembranca de quando foram os ultimos.
 */
import { andamentoDosAtaques } from '../../lib/compasso';

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
  /** Energia grave 0..1 para o shader; chamar por fotograma. */
  nivel(): number;
  /** Envelope 0..1 do ultimo ataque. Vive no relogio do detetor, por isso
   * pode ler-se a qualquer momento e em qualquer ordem. */
  batida(agoraMs?: number): number;
  /** Presenca 0..1 de pratos, hats e transientes altos. Nao dispara sozinho. */
  agudos(): number;
  /** O andamento dos ultimos ataques, se ja se puder acreditar nele. */
  andamento(): { bpm: number; confianca: number } | null;
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
/**
 * O relogio do detetor, independente do laco de desenho.
 *
 * A janela do analisador sao 1024 amostras: 21 ms a 48 kHz. Enquanto a
 * detecao corria dentro do laco de desenho -- limitado a 30 fps desde o
 * fd99a32, para a app aquecer menos -- cada leitura ficava a 33 ms da
 * anterior, e 12 ms de som NUNCA chegavam a ser olhados: 36% da musica. Um
 * ataque que caisse nesse buraco nao vinha tarde, nao vinha de todo, e quanto
 * mais seco e mais rapido o bombo mais vezes calhava. Era o "skip" dos
 * andamentos rapidos, e piorava quando a rAF estolava a desenhar o shader.
 *
 * 5 ms e menos de um quarto da janela: nao fica som por olhar.
 */
const PASSO_DETECAO_MS = 5;
/** Uma janela de ~1 s de fluxo para o limiar adaptativo, medida em TEMPO e
 * nao em quadros. Os 30 quadros de antes so valiam 1 s porque o laco estava
 * preso a 30 fps; num ecra de 144 Hz valiam 0,2 s, e o limiar passava a
 * adaptar-se dentro da propria batida -- cada bombo escondia o seguinte. */
const JANELA_MS = 1000;
const JANELA = Math.round(JANELA_MS / PASSO_DETECAO_MS);
/** Sem esta historia nao ha media nem desvio com significado: os mesmos ~0,4 s
 * que os 12 quadros de antes valiam. */
const AQUECIMENTO = Math.round(400 / PASSO_DETECAO_MS);
/** Os ultimos ataques, uns 30 s de musica, para o andamento. */
const ATAQUES_GUARDADOS = 64;
/** Um silencio maior do que isto (uma pausa, uma ponte) desencontra a grelha: recomeca-se. */
const SILENCIO_QUE_RECOMECA_MS = 3000;

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
  const ataques: number[] = [];
  let escritos = 0;
  let cursor = 0;
  let rmsAnterior = 0;
  // O envelope guarda-se como amplitude + instante, e calcula-se na leitura.
  // Antes decaia a cada passagem pelo laco de desenho, o que o prendia ao
  // ritmo dos quadros; assim vale o mesmo para quem o leia e quando o leia.
  let picoAmplitude = 0;
  let picoMs = 0;
  let energia = 0;
  let energiaAguda = 0;
  let ultimaBatidaMs = 0;
  let relogio: ReturnType<typeof setInterval> | null = null;
  let desejadaAtiva = true;
  let desarmarGesto: (() => void) | null = null;

  const envelope = (agoraMs: number) => {
    if (!picoAmplitude) return 0;
    const v = picoAmplitude * Math.exp(-Math.max(0, agoraMs - picoMs) / 1000 / DECAIMENTO_S);
    // A exponencial nunca chega matematicamente a zero. Sem este corte o
    // shader continuava a receber um valor minusculo e parecia tremer entre
    // batidas, precisamente quando devia estar completamente quieto.
    return v < 0.055 ? 0 : v;
  };

  /**
   * Um passo do detetor. Corre no relogio proprio, nunca no laco de desenho.
   * A afinacao e a mesma de sempre -- limiar, janelas, amplitudes; o que muda
   * e so a frequencia com que o som e olhado.
   */
  const passoDeDetecao = (agoraMs: number) => {
    if (!desejadaAtiva || estado !== 'ativa' || !detecao || !tempo) return;

    // --- cadeia de detecao: RMS no dominio do tempo ------------------------
    detecao.getFloatTimeDomainData(tempo as any);
    let soma = 0;
    for (let i = 0; i < tempo.length; i++) soma += tempo[i] * tempo[i];
    const rms = Math.sqrt(soma / tempo.length);

    // So as diferencas POSITIVAS: o que interessa e o ataque, nao a queda.
    const fluxo = Math.max(0, rms - rmsAnterior);
    rmsAnterior = rms;

    // Limiar adaptativo: media + 1.6 desvios da janela ANTERIOR. Incluir o
    // ataque atual no proprio limiar abafava precisamente sequencias rapidas
    // e regulares: cada kick tornava o seguinte mais dificil de detetar. Um
    // limiar fixo continuaria a funcionar numa musica e a falhar noutra, por
    // isso preserva-se a adaptacao ao volume da faixa.
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

    const pico = envelope(agoraMs);
    const desdeUltima = agoraMs - ultimaBatidaMs;
    const passouJanelaNormal = desdeUltima > INTERVALO_NORMAL_MS;
    // Dentro da janela curta exige-se um ataque 24% mais forte e que o
    // envelope anterior ja tenha descido. Isto acompanha double-kicks e
    // drops acelerados sem confundir a ressonancia do mesmo kick com outro.
    const ataqueRapidoSeparado = desdeUltima > INTERVALO_RAPIDO_MS
      && fluxo > limiar * 1.24
      && pico < 0.55;

    if (escritos >= AQUECIMENTO && rms > 0.008 && fluxo > limiar && (passouJanelaNormal || ataqueRapidoSeparado)) {
      if (desdeUltima > SILENCIO_QUE_RECOMECA_MS) ataques.length = 0;
      ataques.push(agoraMs);
      if (ataques.length > ATAQUES_GUARDADOS) ataques.shift();
      ultimaBatidaMs = agoraMs;
      const excesso = Math.min(1, (fluxo - limiar) / (limiar + 1e-6));
      // O detetor ja foi medido contra batidas reais; aqui nao se muda o
      // limiar, apenas a amplitude VISUAL. Mesmo um ataque pouco acima do
      // limiar tem de se ler inequivocamente na capa.
      picoAmplitude = Math.max(pico, 0.82 + 0.18 * excesso);
      picoMs = agoraMs;
    }

    // So depois da decisao e que o passo atual entra no historico.
    fluxos[cursor] = fluxo;
    cursor = (cursor + 1) % JANELA;
    if (escritos < JANELA) escritos++;
  };

  const ligarRelogio = () => {
    if (relogio !== null) return;
    relogio = setInterval(() => passoDeDetecao(performance.now()), PASSO_DETECAO_MS);
  };
  const desligarRelogio = () => {
    if (relogio === null) return;
    clearInterval(relogio);
    relogio = null;
  };

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
    else ligarRelogio();
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
    nivel() {
      // A DETECAO ja nao vive aqui: corre no relogio proprio. Isto e so a
      // cadeia visual, e essa pode continuar a vir no ritmo do desenho.
      if (!desejadaAtiva || estado !== 'ativa' || !visual) return 0;

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
    batida: (agoraMs = performance.now()) => envelope(agoraMs),
    agudos: () => energiaAguda,
    andamento: () => andamentoDosAtaques(ataques),
    espetro: () => espetro,
    definirAtiva(ativa) {
      desejadaAtiva=ativa;
      // Sair do ecra para o detetor tambem: um relogio de 5 ms a olhar para um
      // contexto suspenso era trabalho continuo para ninguem ver.
      if(ativa&&estado==='ativa')ligarRelogio();else desligarRelogio();
      if(!ctx)return;
      void (ativa?ctx.resume():ctx.suspend()).catch(()=>{});
    },
    parar() {
      parado = true;
      desligarRelogio();
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
