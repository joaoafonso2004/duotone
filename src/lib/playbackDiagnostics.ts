/**
 * Diagnóstico de reprodução — o que falhou, o que fazer, e o que dizer.
 *
 * O pipeline de reprodução falha de muitas maneiras diferentes e até aqui
 * todas acabavam na mesma frase. Pior: o TIPO da falha era adivinhado com uma
 * expressão regular sobre a mensagem de erro
 * (`/not playable|unavailable|private|removed|age|sign in/i`) — e essa
 * mensagem vem, em boa parte dos casos, do `playabilityStatus.reason` do
 * YouTube, que é **localizado**. Com a app em português a regex não apanhava
 * nada, a falha era classificada como problema de rede e caía no embed, que
 * também não ia conseguir tocar.
 *
 * Aqui a classificação parte de SINAIS ESTRUTURADOS — código da IFrame API,
 * `playabilityStatus.status`, código HTTP — e só usa texto como último
 * recurso. O texto que sobra é comparado em português E inglês.
 *
 * Sem imports de runtime, de propósito: é o que o mantém testável em Node
 * puro (`scripts/test-playback-diagnostics.ts`), como o `lib/radio.ts` e o
 * `lib/listeningStats.ts`. Quem chama passa o que sabe por parâmetro.
 */

export type TipoFalha =
  /** Não há ligação. Nada do que a app tente vai resolver isto. */
  | 'sem-rede'
  /** Removido, privado, apagado, ou id que não existe. */
  | 'indisponivel'
  /** Existe, mas o dono proibiu a reprodução embutida. */
  | 'embed-bloqueado'
  | 'restrito-idade'
  | 'restrito-regiao'
  /** 403/LOGIN_REQUIRED dos clientes sem PO Token — o bloqueio de bot. */
  | 'bloqueio-bot'
  /** Resolveu, mas nenhum formato serve ao AVPlayer. */
  | 'sem-formato'
  /** O URL resolveu e o CDN recusou-o à mesma. */
  | 'cdn-recusou'
  /** Nunca chegou a arrancar; foi o watchdog que o deu por morto. */
  | 'tempo-esgotado'
  | 'desconhecido';

/**
 * O que se sabe sobre a falha. Tudo opcional porque cada sítio do pipeline
 * sabe coisas diferentes — o que não se pode é inventar.
 */
export type Sinal = {
  /** Código da IFrame API: 2 id inválido, 5 erro do player, 100 removido,
   * 101/150 embed proibido. Só o desktop tem isto. */
  codigoEmbed?: number | null;
  /** `playabilityStatus.status` do InnerTube: OK, UNPLAYABLE, LOGIN_REQUIRED,
   * AGE_VERIFICATION_REQUIRED, CONTENT_CHECK_REQUIRED, ERROR, LIVE_STREAM_OFFLINE. */
  statusPlayability?: string | null;
  /** HTTP do InnerTube ou do CDN. 0 quando o pedido nem saiu. */
  http?: number | null;
  /** Só como último recurso, e só depois de tudo o resto falhar. */
  mensagem?: string | null;
  /** Quem chama já sabe que está offline (ex.: NetInfo). */
  offline?: boolean;
};

/** Reconhece "indisponível" em PT e EN. O `reason` do YouTube vem no idioma
 * do pedido, por isso uma lista só em inglês falhava metade das vezes. */
const TEXTO: [RegExp, TipoFalha][] = [
  [/offline|sem liga|network request failed|load failed|fetch failed|err_internet/i, 'sem-rede'],
  [/idade|age.?restrict|confirm your age|sign in to confirm/i, 'restrito-idade'],
  [/pa[ií]s|regi[aã]o|region|not available in your country|geo/i, 'restrito-regiao'],
  [/bot|login_required|inicia sess[aã]o|sign in|403/i, 'bloqueio-bot'],
  [/privado|private|removido|removed|apagado|deleted|indispon[ií]vel|unavailable|not playable|copyright|terminated/i, 'indisponivel'],
  [/no avplayer|sem formato|no streamingdata|no compatible/i, 'sem-formato'],
  [/cdn|rejected the url/i, 'cdn-recusou'],
];

/**
 * O sinal estruturado ganha sempre ao texto. Esta ordem é a regra toda.
 */
export function classificar(sinal: Sinal): TipoFalha {
  const { codigoEmbed, statusPlayability, http, mensagem, offline } = sinal;

  // 1. Rede. Vem primeiro porque sem rede TUDO falha, e classificar a falha
  //    de baixo nível levava a app a "recuperar" de um problema que não é o
  //    verdadeiro.
  if (offline) return 'sem-rede';
  if (http === 0) return 'sem-rede';

  // 2. Códigos da IFrame API: são números, não texto, e não são traduzidos.
  if (codigoEmbed != null) {
    if (codigoEmbed === 101 || codigoEmbed === 150) return 'embed-bloqueado';
    if (codigoEmbed === 100 || codigoEmbed === 2) return 'indisponivel';
    // O 5 é "erro do player HTML5" e não diz mais nada. Não inventar.
    if (codigoEmbed === 5) return 'desconhecido';
  }

  // 3. playabilityStatus do InnerTube.
  const st = statusPlayability?.toUpperCase();
  if (st && st !== 'OK') {
    if (st === 'AGE_VERIFICATION_REQUIRED' || st === 'CONTENT_CHECK_REQUIRED') return 'restrito-idade';
    // LOGIN_REQUIRED é ambíguo: tanto aparece em vídeos com idade como no
    // bloqueio de bot sem PO Token. O `reason` desempata quando existe.
    if (st === 'LOGIN_REQUIRED') {
      if (mensagem && /idade|age|confirm/i.test(mensagem)) return 'restrito-idade';
      return 'bloqueio-bot';
    }
    if (st === 'UNPLAYABLE' || st === 'ERROR' || st === 'LIVE_STREAM_OFFLINE') {
      // Um UNPLAYABLE por região tem o país na razão; vale a pena distinguir
      // porque a recuperação é diferente (outra cópia pode passar).
      if (mensagem && /pa[ií]s|regi[aã]o|country|region/i.test(mensagem)) return 'restrito-regiao';
      return 'indisponivel';
    }
  }

  // 4. HTTP.
  if (http != null && http > 0) {
    if (http === 403 || http === 429) return 'bloqueio-bot';
    if (http === 404 || http === 410) return 'indisponivel';
    if (http >= 500) return 'cdn-recusou';
  }

  // 5. Texto, por fim.
  if (mensagem) {
    for (const [re, tipo] of TEXTO) if (re.test(mensagem)) return tipo;
  }
  return 'desconhecido';
}

/**
 * Le os campos estruturados que o resolver pendura no Error. Sem isto cada
 * sitio que apanha um erro voltava a inventar a sua propria leitura.
 */
export function sinalDoErro(e: any, extra: Sinal = {}): Sinal {
  return {
    statusPlayability: e?.statusPlayability ?? null,
    http: typeof e?.http === 'number' ? e.http : null,
    mensagem: typeof e?.message === 'string' ? e.message : e == null ? null : String(e),
    ...extra,
  };
}

/**
 * A cascata de clientes do InnerTube tenta quatro e falha quatro vezes, cada
 * uma por sua razao. O veredito nao e o ultimo erro nem o primeiro — e o mais
 * DECISIVO.
 *
 * A regra: uma falha do VIDEO (removido, idade, regiao) e igual para todos os
 * clientes, por isso basta um a dize-lo para ser verdade e nenhum outro
 * caminho a resolver. Uma falha de TRANSPORTE (403, CDN, formato) pode ser so
 * daquele cliente, por isso vale menos — e deixa em aberto o embed.
 *
 * `sem-rede` e a excecao: so conta se TODOS falharam por isso. Um unico
 * cliente sem rede no meio de quatro e ruido.
 */
const PRIORIDADE: TipoFalha[] = [
  'restrito-idade',
  'indisponivel',
  'restrito-regiao',
  'embed-bloqueado',
  'bloqueio-bot',
  'cdn-recusou',
  'sem-formato',
  'tempo-esgotado',
  'desconhecido',
];

export function consolidar(tipos: readonly TipoFalha[]): TipoFalha {
  if (!tipos.length) return 'desconhecido';
  if (tipos.every((t) => t === 'sem-rede')) return 'sem-rede';
  // Anotado a mao: o `filter` faz o TypeScript estreitar o elemento e tirar
  // 'sem-rede' do tipo, e depois o `includes` recusava um TipoFalha completo.
  const restantes: TipoFalha[] = tipos.filter((t) => t !== 'sem-rede');
  for (const candidato of PRIORIDADE) {
    if (restantes.includes(candidato)) return candidato;
  }
  return 'desconhecido';
}

/**
 * O que vale a pena tentar a seguir. Devolve as três hipóteses em vez de uma
 * decisão única porque as plataformas não têm as mesmas: o desktop procura
 * outra cópia, o telemóvel tem ainda o embed por baixo.
 */
export type Recuperacao = {
  /** Passar à frente: a faixa não vai tocar de maneira nenhuma. */
  saltar: boolean;
  /** Vale a pena cair no embed oficial (só o telemóvel o tem). */
  embed: boolean;
  /** Vale a pena procurar outra cópia do mesmo tema no YouTube. */
  alternativa: boolean;
};

export function recuperacao(tipo: TipoFalha): Recuperacao {
  switch (tipo) {
    // Sem rede não se salta NADA. Saltar aqui percorria a fila toda em
    // segundos e deixava o utilizador sem fila e sem música.
    case 'sem-rede':
      return { saltar: false, embed: false, alternativa: false };
    // O vídeo morreu, mas o tema pode existir noutro upload.
    case 'indisponivel':
    case 'restrito-regiao':
    case 'embed-bloqueado':
      return { saltar: true, embed: false, alternativa: true };
    // O embed oficial não precisa de PO Token — é exatamente o caso em que
    // serve para alguma coisa.
    case 'bloqueio-bot':
    case 'sem-formato':
    case 'cdn-recusou':
      return { saltar: false, embed: true, alternativa: false };
    // Nem outra cópia resolve: a conta é que não tem idade confirmada.
    case 'restrito-idade':
      return { saltar: true, embed: false, alternativa: false };
    case 'tempo-esgotado':
    case 'desconhecido':
      return { saltar: false, embed: true, alternativa: false };
  }
}

/**
 * A frase que o utilizador vê. Sem build id, sem nome de cliente InnerTube,
 * sem estado de PO Token — isso vive no relatório, que é onde serve.
 *
 * Uma frase, o que aconteceu e o que a app vai fazer. Nada mais.
 */
export function mensagem(tipo: TipoFalha): string {
  switch (tipo) {
    case 'sem-rede':
      return 'No connection. This track is not downloaded.';
    case 'indisponivel':
      return 'This upload is gone. Looking for another copy…';
    case 'embed-bloqueado':
      return 'This upload cannot be played here. Looking for another copy…';
    case 'restrito-idade':
      return 'This track is age-restricted. Skipping.';
    case 'restrito-regiao':
      return 'Not available in your country. Looking for another copy…';
    case 'bloqueio-bot':
      return 'YouTube is throttling this device. Retrying another way…';
    case 'sem-formato':
      return 'No usable audio for this track. Retrying another way…';
    case 'cdn-recusou':
      return 'YouTube refused the audio link. Retrying another way…';
    case 'tempo-esgotado':
      return 'This track did not start. Retrying another way…';
    case 'desconhecido':
      return 'Could not play this track.';
  }
}

/**
 * Nome legivel de cada tipo. Os identificadores (`bloqueio-bot`,
 * `indisponivel`) sao internos e estavam a vazar para as Definicoes como se
 * fossem texto — ninguem tem de saber como e que lhes chamamos por dentro.
 */
export function rotulo(tipo: TipoFalha): string {
  switch (tipo) {
    case 'sem-rede': return 'no connection';
    case 'indisponivel': return 'upload gone';
    case 'embed-bloqueado': return 'embedding blocked';
    case 'restrito-idade': return 'age-restricted';
    case 'restrito-regiao': return 'blocked in your country';
    case 'bloqueio-bot': return 'throttled by YouTube';
    case 'sem-formato': return 'no usable audio';
    case 'cdn-recusou': return 'link refused';
    case 'tempo-esgotado': return 'never started';
    case 'desconhecido': return 'unknown';
  }
}

// ---------------------------------------------------------------- registo --
//
// Um anel de eventos em memória. É o que alimenta o relatório exportável, e
// existe porque o detalhe técnico ANTES ia todo para `console.warn` — que num
// .ipa instalado no telemóvel não é lido por ninguém.

export type Evento = {
  /** Epoch ms. Absoluto, para o relatório poder ser lido dias depois. */
  quando: number;
  videoId: string;
  titulo: string;
  /** Onde do pipeline: 'resolver', 'download', 'embed', 'watchdog'… */
  fase: string;
  tipo: TipoFalha;
  /** O que NÃO se mostra ao utilizador: cliente, PO Token, HTTP, mensagem crua. */
  detalhe: string;
};

const MAX_EVENTOS = 60;
const eventos: Evento[] = [];

export function registar(e: Evento): void {
  eventos.push(e);
  if (eventos.length > MAX_EVENTOS) eventos.splice(0, eventos.length - MAX_EVENTOS);
}

export function historico(): readonly Evento[] {
  return eventos;
}

export function limparHistorico(): void {
  eventos.length = 0;
}

/** Quantas vezes cada tipo apareceu. É o que torna um padrão visível: seis
 * `bloqueio-bot` seguidos são um problema diferente de seis `indisponivel`. */
export function resumo(lista: readonly Evento[] = eventos): Record<string, number> {
  const conta: Record<string, number> = {};
  for (const e of lista) conta[e.tipo] = (conta[e.tipo] ?? 0) + 1;
  return conta;
}

export type Contexto = {
  versao: string;
  build: string;
  plataforma: string;
  /** ISO, injetado para o relatório ser determinístico em teste. */
  gerado: string;
};

/**
 * Texto simples, não JSON: isto é para ser colado numa mensagem ou aberto no
 * Bloco de Notas, não consumido por uma máquina.
 */
export function relatorio(ctx: Contexto, lista: readonly Evento[] = eventos): string {
  const linhas: string[] = [];
  // Em ingles como o resto da UI do desktop — o botao que o gera diz "Export
  // playback report", e um ficheiro em portugues a seguir a isso e a mesma
  // incoerencia do "REPOR" no meio de um painel em ingles.
  linhas.push('Duotone — playback report');
  linhas.push(`generated: ${ctx.gerado}`);
  linhas.push(`version:   ${ctx.versao} (build ${ctx.build})`);
  linhas.push(`platform:  ${ctx.plataforma}`);
  linhas.push('');

  if (!lista.length) {
    linhas.push('No failures recorded this session.');
    return linhas.join('\n');
  }

  const contagem = resumo(lista);
  linhas.push(`failures: ${lista.length}`);
  for (const tipo of Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])) {
    linhas.push(`  ${contagem[tipo]}x ${rotulo(tipo as TipoFalha)}  (${tipo})`);
  }
  linhas.push('');
  linhas.push('--- events, oldest first ---');
  for (const e of lista) {
    const hora = new Date(e.quando).toISOString().slice(11, 19);
    linhas.push(`[${hora}] ${e.tipo} (${e.fase}) ${e.videoId} — ${e.titulo}`);
    if (e.detalhe) linhas.push(`           ${e.detalhe}`);
  }
  return linhas.join('\n');
}
