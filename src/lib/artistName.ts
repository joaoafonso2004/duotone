/**
 * Extração do artista REAL de faixas do YouTube, e o agrupamento deles.
 *
 * O problema original: o YouTube devolve o nome do CANAL como "artista", por
 * isso a mesma música posta por canais diferentes criava "artistas"
 * diferentes. Isso já estava resolvido pelo `extractArtist`.
 *
 * O problema que SOBRAVA, e que este ficheiro passa a resolver: o extractor
 * devolve o que estiver escrito no título, tal e qual. Medido em 17 títulos
 * reais da biblioteca, dava **quatro grupos onde devia haver um** — `Juice
 * WRLD`, `juice wrld`, `JUICE WRLD` e `Juice Wrld & Trippie Redd`. A lista de
 * artistas conhecidos aqui em baixo até tem "Juice WRLD" escrito, mas o passo
 * do traço no título dispara antes dela e devolve o que lá estiver.
 *
 * A correção tem quatro peças, e a ordem entre elas importa:
 *
 *  1. `chaveDeArtista` — uma chave insensível a maiúsculas, acentos e
 *     pontuação. É por ela que se AGRUPA. Só isto funde os três Juice WRLD, e
 *     não precisa de saber quem ele é.
 *  2. `artistaPrincipal` — corta colaborações (`&`, ` x `) para o primeiro
 *     nome, como já se fazia ao `feat.`.
 *  3. `aprenderVocabulario` — recolhe os artistas que saem de fontes fiáveis
 *     da PRÓPRIA biblioteca (canais `- Topic`, VEVO) e usa-os para corrigir a
 *     grafia dos outros. A lista escrita à mão deixa de ser a defesa
 *     principal e passa a ser só uma semente.
 *  4. Títulos ao contrário (`Meus planos - BrazzaOg`) — só se resolvem com o
 *     vocabulário: troca-se quando o lado direito é um artista conhecido e o
 *     esquerdo não é. Sem vocabulário seria um palpite; com ele é uma
 *     verificação.
 *
 * **O que NÃO se faz, de propósito: fundir por semelhança.** Juntar dois
 * artistas diferentes é pior do que os deixar separados, porque um deles
 * desaparece da biblioteca. A fusão só acontece por chave canónica — a mesma
 * palavra escrita de outra maneira — nunca por parecença.
 *
 * Funções puras (testáveis em Node puro — ver scripts/test-artist-name.ts).
 */

const FEAT_RE = /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i;

/** Separadores de colaboração. Repara que a VÍRGULA não está aqui: há nomes
 * que a levam no meio ("Tyler, The Creator"), e cortar por ela partia-os. */
const COLABORACAO_RE = /\s+(?:&|\+|x|X|vs\.?|with|feat\.?|ft\.?|featuring)\s+.*$/;

/** Prefixos que os canais de uploads põem à frente do título. */
const PREFIXO_DE_UPLOAD_RE =
  /^\s*(?:[[(][^\])]{0,24}[\])]|\*[^*]{0,24}\*|(?:NEW|LEAK|LEAKED|FREE|EXCLUSIVE|UNRELEASED|SNIPPET)\b[\s!:-]*)\s*/i;

/**
 * Sufixos entre parenteses ou parentesis rectos, no fim: `(Perfectly Slowed)`,
 * `[Official Video]`, `(Lyrics)`, `(Slowed + Reverb)`.
 *
 * Existe por um caso real. Em `poster boy - Zhollis (Perfectly Slowed)` o lado
 * direito ficava `Zhollis (Perfectly Slowed)`, que nao casa com `Zhollis` no
 * vocabulario -- e por isso o titulo ao contrario nunca era detectado e a app
 * ficava com a MUSICA no lugar do artista.
 *
 * So se tira do fim, e um de cada vez: um nome pode ter parenteses no meio,
 * e cortar por qualquer parentese partia-o.
 */
const SUFIXO_ENTRE_PARENTESIS_RE = /\s*[[(][^()\[\]]{0,40}[\])]\s*$/;

/**
 * Números de faixa de um rip de álbum: "01. ", "9 - ", "14 -".
 *
 * Sem isto, `01. N.W.A - Straight Outta Compton` dava o artista `01. N.W.A`,
 * que fica como cartão à parte do `N.W.A` que a pessoa já tem. Tirar o número
 * não esconde ninguém: FUNDE com o artista certo.
 */
const NUMERO_DE_FAIXA_RE = /^\s*\d{1,3}\s*[.)\-–—]\s+/;

/**
 * Marcas que só aparecem em TÍTULOS, nunca no nome de um artista.
 *
 * Não é uma lista de palavras proibidas a torto e a direito: é a diferença
 * entre `CARNÍVORO (Clipe Oficial)` e o nome de uma pessoa. Ninguém se chama
 * `(Official Music Video)` nem `Type Beat 2026`.
 */
const MARCA_DE_TITULO_RE = /\b(?:official\s+(?:music\s+)?video|official\s+audio|clipe\s+oficial|v[íi]deo\s+oficial|lyrics?\s*video|visuali[sz]er|4k\s+upgrade|prod\.?\s+by|type\s+beat|soundtrack|wshh)\b/i;

/**
 * O nome parece um título de música em vez de um artista?
 *
 * Dois sinais, ambos verificáveis, e nenhum deles um palpite sobre gosto: uma
 * marca que só existe em títulos, ou parênteses por fechar -- que é o que
 * sobra quando um título comprido foi cortado a meio (`That Go! (feat. T`).
 */
function pareceTitulo(nome: string): boolean {
  if (!nome) return true;
  if (MARCA_DE_TITULO_RE.test(nome)) return true;
  const abre = (nome.match(/[([]/g) ?? []).length;
  const fecha = (nome.match(/[)\]]/g) ?? []).length;
  return abre !== fecha;
}

/** Tira os sufixos de versao do fim, quantos houver. */
function semSufixoDeVersao(s: string): string {
  let saida = s.trim();
  for (let i = 0; i < 4; i++) {
    const antes = saida;
    saida = saida.replace(SUFIXO_ENTRE_PARENTESIS_RE, '').trim();
    if (saida === antes) break;
  }
  // Se nao sobrar nada, o nome ERA o parentesis: fica como estava.
  return saida || s.trim();
}

function clean(s: string): string {
  return s
    .replace(/[«»“”„]/g, '')
    .replace(FEAT_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * A chave por que se AGRUPA: sem maiúsculas, sem acentos, sem pontuação.
 *
 * O `$` vira `s` porque é uma estilização e não pontuação — sem isso `A$AP
 * Rocky` e `ASAP Rocky` ficavam em grupos diferentes, que é exatamente o
 * problema que esta função existe para resolver.
 */
export function chaveDeArtista(nome: string | null | undefined): string {
  if (!nome) return '';
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\$/g, 's')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A mesma chave sem espaços. Serve SÓ para reconhecer um nome já conhecido
 * escrito colado ("BrazzaOg" ↔ "Brazza Og") — nunca para agrupar, senão
 * juntava nomes que só por acaso ficam iguais sem espaços. */
function chaveCompacta(nome: string | null | undefined): string {
  return chaveDeArtista(nome).replace(/ /g, '');
}

/** Corta a colaboração e fica o artista principal. */
export function artistaPrincipal(nome: string): string {
  return nome.replace(COLABORACAO_RE, '').trim();
}

/** Tira `(LEAK)`, `[FREE]`, `NEW` e companhia da frente do título. */
export function limparPrefixoDeUpload(titulo: string): string {
  let saida = titulo;
  // Em ciclo: há títulos com dois ("(LEAK) [HQ] Artista - Musica").
  for (let i = 0; i < 3; i++) {
    const antes = saida;
    saida = saida.replace(PREFIXO_DE_UPLOAD_RE, '');
    if (saida === antes) break;
  }
  return saida.trim() || titulo;
}

/** A semente. Deixou de ser a defesa principal — agora é só o arranque do
 * vocabulário, que depois cresce com a biblioteca de cada um. */
const KNOWN_ARTISTS = [
  'Juice WRLD', 'The Weeknd', 'Drake', 'Eminem', 'Billie Eilish',
  'Travis Scott', 'Taylor Swift', 'Kanye West', 'Post Malone',
  'Kendrick Lamar', 'J. Cole', 'Lil Baby', 'Lil Peep', 'Mac Miller',
  'XXXTentacion', 'Justin Bieber', 'Ariana Grande', 'Ed Sheeran',
  'Rihanna', 'Dua Lipa', 'Coldplay', 'Imagine Dragons', 'Bruno Mars',
  'Lil Uzi Vert', 'Gunna', 'Playboi Carti', 'Young Thug', 'Future',
  '21 Savage', 'A$AP Rocky', 'Tyler, The Creator', 'Frank Ocean',
  'Lana Del Rey', 'Olivia Rodrigo', 'Harry Styles', 'Shawn Mendes',
  'Selena Gomez', 'Camila Cabello', 'Halsey', 'Khalid', 'SZA',
  'Doja Cat', 'Cardi B', 'Megan Thee Stallion', 'Nicki Minaj',
  'Lil Nas X', 'DaBaby', 'Roddy Ricch', 'Jack Harlow', 'Kid Cudi',
];

// -------------------------------------------------------- o vocabulário ----

export type Vocabulario = {
  /** chave canónica → a grafia a mostrar. TUDO o que se viu, para decidir
   * como um nome se escreve. */
  readonly porChave: ReadonlyMap<string, string>;
  /** chave sem espaços → a grafia a mostrar. Só para reconhecer nomes
   * colados; ver `chaveCompacta`. */
  readonly porChaveCompacta: ReadonlyMap<string, string>;
  /**
   * Só os que vieram de FONTE FIÁVEL — canal `- Topic`, VEVO, Spotify, ou a
   * semente escrita à mão.
   *
   * Existe separado porque o `porChave` aprende também os enganos: o extractor
   * corre sobre a biblioteca toda, e de `Meus planos - BrazzaOg` sai "Meus
   * planos". Se a pergunta "isto é um artista?" olhasse para o `porChave`, o
   * engano respondia que sim e bloqueava a própria correção — foi exatamente
   * o que um teste apanhou. Para decidir, só contam as fontes fiáveis.
   */
  readonly fiaveis: ReadonlyMap<string, string>;
  readonly fiaveisCompactas: ReadonlyMap<string, string>;
};

export const VOCABULARIO_VAZIO: Vocabulario = {
  porChave: new Map(),
  porChaveCompacta: new Map(),
  fiaveis: new Map(),
  fiaveisCompactas: new Map(),
};

export type FaixaParaAprender = { source?: string; title: string; artist: string | null };

/** Respostas do catálogo, preenchidas ao ler a biblioteca, nunca no desenho. */
const nomesDoCatalogo = new Map<string, string | null>();

export function registarNomeDoCatalogo(procurado: string, confirmado: string | null): void {
  nomesDoCatalogo.set(chaveDeArtista(procurado), confirmado);
  if (confirmado) nomesDoCatalogo.set(chaveDeArtista(confirmado), confirmado);
}

/** Só consulta títulos ambíguos; um canal oficial ou um lado conhecido já resolve. */
export function ladosPorConfirmar(faixa: FaixaParaAprender, vocabulario: Vocabulario): string[] {
  if ((faixa.source && faixa.source !== 'youtube') || nomeDeFonteFiavel(faixa.artist)) return [];
  const m = limparPrefixoDeUpload(faixa.title).match(/^(.{2,60}?)\s+[-–—]\s+(.+)$/);
  if (!m) return [];
  const lados = [m[1], m[2]].map((s) => artistaPrincipal(clean(semSufixoDeVersao(s))));
  if (lados.some((s) => conhecidoComSeguranca(s, vocabulario))) return [];
  return lados.filter((s) => s.length >= 2 && s.length <= 60);
}

/** Um canal `- Topic` é gerado pelo YouTube a partir dos metadados da
 * editora, e um VEVO é oficial. São as duas fontes em que o nome do artista
 * vem escrito como deve ser. */
function nomeDeFonteFiavel(canal: string | null): string | null {
  if (!canal) return null;
  if (/ - Topic$/.test(canal)) return clean(canal.replace(/ - Topic$/, '')) || null;
  const vevo = canal.match(/^(.+?)\s*VEVO$/i);
  if (vevo) return clean(vevo[1].replace(/([a-z])([A-Z])/g, '$1 $2')) || null;
  return null;
}

/** Uma grafia com maiúsculas e minúsculas é como um nome se escreve. Entre
 * `juice wrld`, `JUICE WRLD` e `Juice WRLD`, é esta que se quer. */
function eGrafiaDeNome(nome: string): boolean {
  return nome !== nome.toLowerCase() && nome !== nome.toUpperCase();
}

/**
 * Aprende com a biblioteca: que artistas existem, e como é que cada um se
 * escreve.
 *
 * Duas passagens, como diz o plano. Na primeira recolhem-se os nomes que saem
 * de fontes fiáveis; na segunda, esse vocabulário resgata os títulos que
 * falharam e corrige a grafia dos que não falharam.
 */
export function aprenderVocabulario(faixas: readonly FaixaParaAprender[]): Vocabulario {
  // chave → grafia → quantas vezes; e, à parte, a grafia fiável se houver.
  const contagens = new Map<string, Map<string, number>>();
  const fiaveis = new Map<string, string>();

  const registar = (nome: string | null, fiavel: boolean) => {
    if (!nome) return;
    const chave = chaveDeArtista(nome);
    if (!chave) return;
    if (fiavel && !fiaveis.has(chave)) fiaveis.set(chave, nome);
    const porGrafia = contagens.get(chave) ?? new Map<string, number>();
    porGrafia.set(nome, (porGrafia.get(nome) ?? 0) + 1);
    contagens.set(chave, porGrafia);
  };

  // A semente entra como fiável: são nomes escritos à mão, e bem.
  for (const nome of KNOWN_ARTISTS) registar(nome, true);

  for (const faixa of faixas) {
    if (faixa.source && faixa.source !== 'youtube') {
      // No Spotify o artista já vem fiável da API.
      registar(artistaPrincipal(clean(faixa.artist ?? '')) || null, true);
      continue;
    }
    registar(nomeDeFonteFiavel(faixa.artist), true);
    registar(extrairBruto(faixa.title, faixa.artist, VOCABULARIO_VAZIO), false);
  }

  const porChave = new Map<string, string>();
  for (const [chave, porGrafia] of contagens) {
    const fiavel = fiaveis.get(chave);
    if (fiavel) { porChave.set(chave, fiavel); continue; }
    // Sem fonte fiável: a mais frequente, e no empate a que está escrita como
    // um nome (maiúsculas e minúsculas) em vez de tudo num dos extremos.
    let melhor = '';
    let melhorN = -1;
    for (const [grafia, n] of porGrafia) {
      const ganha = n > melhorN
        || (n === melhorN && eGrafiaDeNome(grafia) && !eGrafiaDeNome(melhor));
      if (ganha) { melhor = grafia; melhorN = n; }
    }
    if (melhor) porChave.set(chave, melhor);
  }

  // Os índices compactos. Uma compacta que sirva DUAS chaves diferentes é
  // ambígua e fica de fora: mais vale não reconhecer do que reconhecer mal.
  const compactar = (origem: ReadonlyMap<string, string>) => {
    const saida = new Map<string, string>();
    const ambiguas = new Set<string>();
    for (const [chave, nome] of origem) {
      const compacta = chave.replace(/ /g, '');
      const jaLa = saida.get(compacta);
      if (jaLa !== undefined && jaLa !== nome) ambiguas.add(compacta);
      else saida.set(compacta, nome);
    }
    for (const c of ambiguas) saida.delete(c);
    return saida;
  };

  for (const [chave, nome] of nomesDoCatalogo) {
    if (!nome) continue;
    for (const k of [chave, chaveDeArtista(nome)]) {
      porChave.set(k, nome);
      fiaveis.set(k, nome);
    }
  }
  return {
    porChave,
    porChaveCompacta: compactar(porChave),
    fiaveis,
    fiaveisCompactas: compactar(fiaveis),
  };
}

/** O nome canónico deste artista, se o vocabulário o conhecer. */
export function canonizar(nome: string | null, vocabulario: Vocabulario): string | null {
  if (!nome) return null;
  const chave = chaveDeArtista(nome);
  if (!chave) return null;
  return vocabulario.porChave.get(chave)
    ?? vocabulario.porChaveCompacta.get(chaveCompacta(nome))
    ?? null;
}

/**
 * Isto é um artista de que temos a certeza?
 *
 * Só olha para as fontes fiáveis, e é isso que a distingue do `canonizar`:
 * esta pergunta serve para DECIDIR (trocar um título ao contrário), e uma
 * decisão não se pode apoiar num nome que o próprio extractor inventou.
 */
function conhecidoComSeguranca(nome: string | null, vocabulario: Vocabulario): boolean {
  if (!nome) return false;
  const chave = chaveDeArtista(nome);
  if (!chave) return false;
  return vocabulario.fiaveis.has(chave)
    || vocabulario.fiaveisCompactas.has(chaveCompacta(nome));
}

/**
 * Alguns uploads omitem os espaços do separador: `Artista-Música`.
 *
 * Não se pode cortar cegamente no primeiro hífen, porque `Song-Remix` e
 * nomes como `Jay-Z` também existem. Aceitamos apenas quando há um sinal
 * adicional de que o lado esquerdo é mesmo um nome: já é fiável, coincide
 * com o canal, ou tem o formato habitual de um artista com várias palavras.
 */
function artistaAntesDeTracoColado(
  texto: string,
  channel: string | null,
  vocabulario: Vocabulario,
): string | null {
  const canal = chaveDeArtista(channel);
  for (const match of texto.matchAll(/[-–—]/g)) {
    const indice = match.index ?? -1;
    if (indice < 2) continue;
    const esquerda = artistaPrincipal(clean(texto.slice(0, indice)));
    const direita = clean(texto.slice(indice + 1));
    const chave = chaveDeArtista(esquerda);
    const palavras = chave.split(' ').filter(Boolean);
    if (!chave || !direita || esquerda.length > 60 || /^\d+$/.test(chave)) continue;

    // `When It Rains-Remix` é provavelmente um título com uma variante, não
    // um artista chamado "When It Rains".
    if (/^(?:remix|mix|live|edit|version|sped up|slowed(?: and reverb)?|instrumental)$/i.test(direita)) {
      continue;
    }

    const confirmadoPeloCanal = canal === chave
      || canal.startsWith(`${chave} `)
      || canal.endsWith(` ${chave}`);
    const pareceNomeComposto = palavras.length >= 2 && palavras.length <= 6
      && esquerda !== esquerda.toLowerCase();
    if (conhecidoComSeguranca(esquerda, vocabulario)
      || confirmadoPeloCanal
      || pareceNomeComposto) {
      return esquerda;
    }
  }
  return null;
}

// --------------------------------------------------------- a extração -----

export function extractArtist(
  title: string | null,
  channel: string | null,
  vocabulario: Vocabulario = VOCABULARIO_VAZIO,
): string | null {
  const bruto = extrairBruto(title, channel, vocabulario);
  if (!bruto) return null;
  // A última palavra é do vocabulário: é ele que decide a grafia.
  return canonizar(bruto, vocabulario) ?? bruto;
}

function extrairBruto(
  title: string | null,
  channel: string | null,
  vocabulario: Vocabulario,
): string | null {
  // 1) Canal auto-gerado "Artista - Topic" — a fonte mais fiável.
  const fiavel = nomeDeFonteFiavel(channel);
  if (fiavel) return artistaPrincipal(fiavel);

  // 2) Título "Artista - Título", já sem os prefixos de quem faz upload.
  // O número de faixa sai antes de tudo: é numeração de um rip, não nome.
  const limpo = title ? limparPrefixoDeUpload(title).replace(NUMERO_DE_FAIXA_RE, '') : null;
  if (limpo) {
    const m = limpo.match(/^(.{2,60}?)\s+[-–—]\s+(.+)$/);
    if (m) {
      const esquerda = artistaPrincipal(clean(m[1]));
      const direita = artistaPrincipal(clean(m[2]));
      const esquerdaServe = esquerda.length >= 2 && !/^\d+$/.test(esquerda);

      // 4) O título ao contrário ("Meus planos - BrazzaOg"). Só se troca
      // quando o vocabulário CONHECE o lado direito e não conhece o esquerdo
      // — sem essa dupla condição isto seria um palpite.
      //
      // Os sufixos de versão saem antes de perguntar ao vocabulário. Era o
      // que faltava num caso real: em `poster boy - Zhollis (Perfectly
      // Slowed)` o lado direito ficava `Zhollis (Perfectly Slowed)`, não
      // casava com `Zhollis`, e a app ficava com a MÚSICA no lugar do artista.
      const direitaNua = artistaPrincipal(clean(semSufixoDeVersao(m[2])));
      const esquerdaNua = artistaPrincipal(clean(semSufixoDeVersao(m[1])));
      if (conhecidoComSeguranca(direitaNua, vocabulario)
        && !conhecidoComSeguranca(esquerdaNua, vocabulario)) {
        return direitaNua;
      }
      // Um lado que parece TÍTULO não pode ser o artista. Quando é o
      // esquerdo e o direito não tem esse ar, o título está ao contrário --
      // e isto apanha os casos que o vocabulário ainda não conhece.
      if (pareceTitulo(esquerda) && !pareceTitulo(direitaNua) && direitaNua.length >= 2) {
        return direitaNua;
      }
      // Se ambos os lados parecem título, não se inventa um artista aqui:
      // deixa-se seguir para as regras do canal, que ao menos é uma fonte.
      if (esquerdaServe && !pareceTitulo(esquerda)) return esquerda;
    }
  }

  // 3) O título contém um artista CONFIRMADO, mesmo que o separador não
  // tenha espaços ("Juice Wrld-Backspinn Prod.by Xan-Wrld999"). Não se
  // consultam aqui os canais aprendidos como fallback: foi isso que deixava
  // `Xan-Wrld999` ganhar por ser um nome mais comprido.
  if (limpo) {
    const encontrado = procurarNoTexto(limpo.replace(FEAT_RE, ''), vocabulario);
    if (encontrado) return encontrado;
  }

  // 4) Variante comum sem espaços em volta do traço: `Artista-Música`.
  if (limpo) {
    const antesDoTraco = artistaAntesDeTracoColado(limpo, channel, vocabulario);
    if (antesDoTraco) return antesDoTraco;
  }

  // 5) O canal contém um artista confirmado ("Juice WRLD Fanpage").
  if (channel) {
    const encontrado = procurarNoTexto(channel, vocabulario);
    if (encontrado) return encontrado;
  }

  // 6) Último recurso: o canal, limpo de sufixos de marketing.
  if (channel) {
    const nome = clean(channel.replace(/\s*[-–—|]?\s*(?:official|oficial)\s*$/i, ''));
    if (nome) return artistaPrincipal(nome);
  }

  return null;
}

/** Procura, no texto, um artista CONFIRMADO por uma fonte fiável. Compara por
 * chave, para apanhar `juice wrld` tanto como `JUICE WRLD`. Fica com o nome
 * MAIS LONGO que casar, senão "Juice" ganhava a "Juice WRLD".
 *
 * `porChave` não pode ser usado aqui: inclui canais de upload aprendidos como
 * fallback e fazia esses canais transformarem-se em artistas definitivos. */
function procurarNoTexto(texto: string, vocabulario: Vocabulario): string | null {
  const chaveDoTexto = ` ${chaveDeArtista(texto)} `;
  let melhor: string | null = null;
  let melhorTamanho = 0;
  for (const [chave, nome] of vocabulario.fiaveis) {
    // Nomes curtíssimos dariam falsos positivos dentro de palavras comuns.
    if (chave.length < 3) continue;
    if (chave.length > melhorTamanho && chaveDoTexto.includes(` ${chave} `)) {
      melhor = nome;
      melhorTamanho = chave.length;
    }
  }
  return melhor;
}

/** Nome de artista a mostrar/agrupar para uma faixa (qualquer fonte).
 * Para faixas do Spotify o artist já é fiável; a extração só se aplica ao
 * YouTube (onde artist = canal). */
/**
 * O vocabulario aprendido da biblioteca de quem esta a usar a app.
 *
 * **Porque e que isto tem de existir.** O `displayArtist` recebe o vocabulario
 * por parametro, e a app chamava-o SEM ele em 17 dos 19 sitios -- ou seja, a
 * correccao de grafia e a deteccao de titulos ao contrario nunca corriam. Toda
 * a maquinaria estava escrita e morta.
 *
 * Fica aqui um so, alimentado quando a biblioteca e lida (ver `api/library.ts`)
 * e usado por omissao. As funcoes continuam puras para quem lhe passar um
 * vocabulario explicito, que e o que os testes fazem.
 */
let vocabularioDaBiblioteca: Vocabulario = VOCABULARIO_VAZIO;

/** Aprende com estas faixas. Chamar quando a biblioteca e lida. */
export function aprenderComABiblioteca(faixas: readonly FaixaParaAprender[]): void {
  if (faixas.length === 0) return;
  vocabularioDaBiblioteca = aprenderVocabulario(faixas);
}

/** O que se aprendeu ate agora. Vazio ate a biblioteca ser lida. */
export function vocabularioAprendido(): Vocabulario {
  return vocabularioDaBiblioteca;
}

export function displayArtist(
  t: { source?: string; title: string; artist: string | null },
  vocabulario: Vocabulario = vocabularioAprendido(),
): string {
  if (t.source && t.source !== 'youtube') {
    const nome = artistaPrincipal(clean(t.artist ?? ''));
    return canonizar(nome, vocabulario) ?? nome ?? t.artist ?? 'Unknown artist';
  }
  return extractArtist(t.title, t.artist, vocabulario) ?? t.artist ?? 'Unknown artist';
}

// ------------------------------------------------------- o agrupamento -----

export type GrupoDeArtista<T> = {
  /** A grafia a mostrar. */
  nome: string;
  /** A chave canónica por que se agrupou. */
  chave: string;
  faixas: T[];
};

/**
 * Agrupa as faixas por artista, aprendendo primeiro com elas.
 *
 * É esta função que a página de Artistas deve usar, e não um `Map` por
 * `displayArtist`: agrupar pelo nome MOSTRADO era o que punha `Juice WRLD` e
 * `juice wrld` em prateleiras separadas.
 */
export function agruparPorArtista<T extends FaixaParaAprender>(
  faixas: readonly T[],
): GrupoDeArtista<T>[] {
  const vocabulario = aprenderVocabulario(faixas);
  const grupos = new Map<string, GrupoDeArtista<T>>();

  for (const faixa of faixas) {
    const nome = displayArtist(faixa, vocabulario);
    const chave = chaveDeArtista(nome) || nome.toLowerCase();
    const grupo = grupos.get(chave);
    if (grupo) grupo.faixas.push(faixa);
    else grupos.set(chave, { nome, chave, faixas: [faixa] });
  }

  return [...grupos.values()].sort(
    (a, b) => b.faixas.length - a.faixas.length || a.nome.localeCompare(b.nome),
  );
}

// ------------------------------ em que nomes se pode confiar para PROCURAR --

/**
 * Em que nomes da biblioteca se pode confiar ao ponto de ir procurar por eles.
 *
 * **O caso que obrigou a isto.** As recomendações vieram cheias de música
 * bhojpuri de um canal chamado "999 Music". A primeira correção foi exigir que
 * o nome tivesse *vizinhança* num catálogo de música — que um agregador não
 * tem. Resolveu o "999 Music", e não resolveu o problema: o **`999` sozinho é
 * uma banda punk inglesa de 1977**, com 3097 fãs e vinte artistas semelhantes.
 * Passa o crivo todo e traz os Buzzcocks e os Sham 69 a quem só ouve rap.
 *
 * A lição é que a pergunta estava a ser feita ao sítio errado. Nenhum catálogo
 * pode responder a isto, porque a resposta certa não é sobre o `999` — é sobre
 * de onde aquele nome veio. E veio de uma leitura errada de um título, não de
 * uma banda que alguém ouviu.
 *
 * **Quem sabe isso é a biblioteca dele.** Duas maneiras de um nome merecer
 * confiança, e basta uma:
 *
 *  1. **Um canal oficial confirma-o.** Os canais `- Topic` são gerados pelo
 *     YouTube a partir dos metadados da editora e os VEVO são oficiais: o nome
 *     que lá está é o nome do artista. É o `aprenderVocabulario` que os recolhe
 *     (`fiaveis`), e o `999` nunca virá de um canal desses.
 *  2. **Aparece em faixas diferentes que cheguem.** Um engano de leitura sai de
 *     um título ou dois; um artista que se ouve mesmo espalha-se pela
 *     biblioteca. Conta faixas DISTINTAS e não linhas: a mesma música em três
 *     playlists é uma música, não três.
 *
 * O que isto NÃO faz: julgar como o nome se escreve. Já se tentou uma lista de
 * palavras suspeitas e não presta — rejeita o "Rap Nation" e deixa passar o
 * canal seguinte. Aqui a pergunta é de onde o nome veio, que é verificável.
 *
 * Testável em Node puro — ver `scripts/test-alvos.ts`.
 */

/**
 * Faixas distintas que obrigam a levar um nome a sério quando nenhum canal
 * oficial o confirma.
 *
 * Duas seria pouco: o `999` está no título de mais do que uma faixa do Juice
 * WRLD, e um par de leituras erradas do mesmo padrão é fácil. Três já não
 * acontece por acidente, e um artista que se ouve a sério chega lá depressa.
 */
export const FAIXAS_PARA_CONFIAR = 3;

/**
 * As chaves dos artistas em que se pode confiar para ir procurar.
 *
 * Devolve chaves canónicas (`chaveDeArtista`), que é a moeda com que o resto
 * da afinidade trabalha.
 */
export function nomesDeConfianca(
  faixas: readonly FaixaParaAprender[],
): Set<string> {
  // O vocabulário serve aqui só para dar nomes melhores ao contar — corrige a
  // grafia e os títulos ao contrário, e assim três faixas do mesmo artista
  // contam para o mesmo nome.
  //
  // O `fiaveis` dele NÃO decide a confiança, e isto foi um erro que um teste
  // apanhou: ele traz também a semente escrita à mão (`KNOWN_ARTISTS`,
  // cinquenta nomes), e com ela o `nomesDeConfianca([])` respondia Drake,
  // Eminem e Taylor Swift a uma biblioteca vazia. A semente está certa para
  // escrever um nome como deve ser; não diz nada sobre quem ESTA pessoa ouve,
  // e era exactamente uma lista global a decidir — o que isto veio evitar.
  const vocabulario = aprenderVocabulario(faixas);

  const confianca = new Set<string>();
  // Faixas DISTINTAS por artista. O título serve de identidade: a mesma música
  // em três playlists chega aqui três vezes e não pode contar três.
  const titulosPorArtista = new Map<string, Set<string>>();

  for (const f of faixas) {
    // 1. Confirmado por uma fonte oficial DESTA biblioteca.
    if (f.source && f.source !== 'youtube') {
      // Fora do YouTube o artista vem da API da fonte, já fiável.
      const nome = artistaPrincipal(clean(f.artist ?? ''));
      if (nome) confianca.add(chaveDeArtista(nome));
    } else {
      const oficial = nomeDeFonteFiavel(f.artist);
      if (oficial) confianca.add(chaveDeArtista(oficial));
    }

    // 2. Peso na biblioteca, para quem nenhum canal oficial confirma.
    const nome = displayArtist(f, vocabulario);
    if (!nome || nome === 'Unknown artist') continue;
    const k = chaveDeArtista(nome);
    if (!k) continue;
    // A resposta do catálogo prevalece sobre versões repetidas do mesmo título.
    if (nomesDoCatalogo.get(k) === null) continue;
    if (nomesDoCatalogo.get(k)) confianca.add(k);
    const titulos = titulosPorArtista.get(k) ?? new Set<string>();
    titulos.add((f.title ?? '').trim().toLowerCase());
    titulosPorArtista.set(k, titulos);
  }

  for (const [k, titulos] of titulosPorArtista) {
    if (titulos.size >= FAIXAS_PARA_CONFIAR) confianca.add(k);
  }
  return confianca;
}

/**
 * Fica só com os candidatos de confiança.
 *
 * **A única rede de segurança é não haver informação nenhuma.** Sem biblioteca
 * lida — sem rede, ou a consulta a falhar — o conjunto vem vazio, e filtrar por
 * um conjunto vazio deixava a descoberta muda sem razão. Aí não se filtra.
 *
 * Mas quando a biblioteca FOI lida e nenhum candidato passa, isso é a resposta
 * e não uma falha: os nomes propostos não são de artistas que ele oiça. Aqui
 * não se cede — devolver tudo à mesma era repor exatamente o defeito, que uma
 * sugestão errada não é meia sugestão, é lixo com o nome dele em cima.
 */
export function apenasDeConfianca<T>(
  candidatos: readonly T[],
  chaveDe: (c: T) => string,
  confianca: ReadonlySet<string>,
): T[] {
  if (confianca.size === 0) return [...candidatos];
  return candidatos.filter((c) => confianca.has(chaveDe(c)));
}
