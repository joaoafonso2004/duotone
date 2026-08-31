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

type FaixaParaAprender = { source?: string; title: string; artist: string | null };

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
  const limpo = title ? limparPrefixoDeUpload(title) : null;
  if (limpo) {
    const m = limpo.match(/^(.{2,60}?)\s+[-–—]\s+(.+)$/);
    if (m) {
      const esquerda = artistaPrincipal(clean(m[1]));
      const direita = artistaPrincipal(clean(m[2]));
      const esquerdaServe = esquerda.length >= 2 && !/^\d+$/.test(esquerda);

      // 4) O título ao contrário ("Meus planos - BrazzaOg"). Só se troca
      // quando o vocabulário CONHECE o lado direito e não conhece o esquerdo
      // — sem essa dupla condição isto seria um palpite.
      if (conhecidoComSeguranca(direita, vocabulario)
        && !conhecidoComSeguranca(esquerda, vocabulario)) {
        return direita;
      }
      if (esquerdaServe) return esquerda;
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
export function displayArtist(
  t: { source?: string; title: string; artist: string | null },
  vocabulario: Vocabulario = VOCABULARIO_VAZIO,
): string {
  if (t.source && t.source !== 'youtube') {
    const nome = artistaPrincipal(clean(t.artist ?? ''));
    return canonizar(nome, vocabulario) ?? nome ?? t.artist ?? 'Unknown artist';
  }
  return extractArtist(t.title, t.artist, vocabulario) ?? t.artist ?? 'Unknown artist';
}

// ------------------------------------------------- o titulo que se mostra --

/**
 * Ruído que os canais põem no título e que não é o nome da música.
 *
 * A lista é fechada de propósito. Um `(Remix)`, um `(feat. …)` ou um
 * `(Sped Up)` FAZEM parte do nome da música e têm de ficar — tirar tudo o que
 * está entre parênteses daria "Orlando" para duas faixas diferentes.
 */
const RUIDO_NO_TITULO =
  /\s*[[(](?:\s*(?:official|oficial)?\s*(?:music\s*)?(?:video|audio|visualizer|visualiser|lyric[s]?(?:\s*video)?|mv)|hd|hq|4k|full\s*hd|explicit|clipe\s*oficial|videoclipe)\s*[\])]/gi;

/**
 * O nome da música para mostrar no ecrã bloqueado.
 *
 * O que se via antes: **"Juice WRLD - Orlando"** no título e **"Juice WRLD"**
 * logo por baixo no artista — o nome duas vezes, porque se mandava
 * `track.title` tal e qual. Aqui tira-se o artista da frente (que já vai no
 * campo dele) e o ruído de quem faz o upload.
 *
 * Nunca devolve vazio: se depois de limpar não sobrar nada, fica o original.
 */
export function tituloLimpo(
  t: { source?: string; title: string; artist: string | null },
  vocabulario: Vocabulario = VOCABULARIO_VAZIO,
): string {
  let s = limparPrefixoDeUpload(t.title).replace(RUIDO_NO_TITULO, '');

  // Tirar "Artista - " da frente — mas SÓ com a certeza de quem é o artista.
  //
  // Sem essa condição isto estragava mais do que arranjava, e um teste
  // apanhou-o: em `Meus planos - BrazzaOg` o extractor lê "Meus planos" como
  // artista (é o que está à esquerda), e cortá-lo deixava a MÚSICA a chamar-se
  // "BrazzaOg". No ecrã bloqueado apareciam os dois trocados.
  //
  // Certeza quer dizer: o canal é `- Topic` ou VEVO — onde o nome vem da
  // editora — ou o vocabulário conhece-o de uma fonte dessas. Sem isso o
  // título fica como está, que é o que já acontecia.
  const doCanal = nomeDeFonteFiavel(t.artist);
  const m = s.match(/^(.{2,60}?)\s*[-–—]\s*(.+)$/);
  if (m) {
    const esquerda = artistaPrincipal(clean(m[1]));
    const chaveEsquerda = chaveDeArtista(esquerda);
    const certo = (doCanal && chaveDeArtista(artistaPrincipal(doCanal)) === chaveEsquerda)
      || conhecidoComSeguranca(esquerda, vocabulario);
    if (certo) s = m[2];
  }

  return s.replace(/\s{2,}/g, ' ').trim() || t.title;
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
