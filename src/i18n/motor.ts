/**
 * O motor da tradução (15/11): um texto em inglês, tal como está escrito no
 * código, e a versão noutra língua -- ou o mesmo texto, quando não se conhece.
 *
 * A interface não tem chaves: os milhares de textos estão escritos em inglês
 * nos componentes, e os testes leem-nos assim. A tradução faz-se no texto que
 * se vai mostrar (`src/i18n/index.ts`), e o dicionário tem como chave o inglês
 * do código (`src/i18n/fr.ts`).
 *
 *  - Exato: "Liked Songs" -> "Titres likés". Também em maiúsculas ("LIBRARY").
 *  - Moldes: uma chave com `{0}` vale para qualquer valor ("Added {0} to {1}.").
 *    `{0:n}` só aceita números. Um molde sem palavras próprias (só variáveis e
 *    sinais) nunca entra: apanhava tudo, títulos de músicas incluídos.
 *  - Linhas compostas: "73 songs · 4 h" não está escrita inteira no código;
 *    traduz-se cada pedaço entre " · ".
 *  - Conteúdo: o que vem dos dados (títulos, artistas) nunca se traduz, mesmo
 *    que uma música se chame "Home" (`eConteudo`).
 *
 * Puro, sem imports: `scripts/test-idiomas.ts` corre-o em Node.
 */

export type Dicionario = Readonly<Record<string, string>>;

type Molde = {
  re: RegExp;
  /** O maior pedaço literal da chave: um texto sem ele nem se tenta. */
  ancora: string;
  destino: string;
  /** O número de cada grupo da expressão, pela ordem em que aparecem. */
  ordem: number[];
  /** Escrito para uma linha composta ("Album · {0} songs"): ganha à separação. */
  comPonto: boolean;
  /** Quanto texto fixo tem: no empate da âncora, ganha o que diz mais. */
  fixo: number;
};

const SEPARADOR = ' · ';
const MARCA = /\{(\d+)(:n)?\}/g;
const TEM_LETRAS = /[A-Za-z]/;

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function criarTradutor(dicionario: Dicionario, eConteudo: (texto: string) => boolean = () => false) {
  const exatos = new Map<string, string>();
  const emMaiusculas = new Map<string, string>();
  const moldes: Molde[] = [];

  for (const [origem, destino] of Object.entries(dicionario)) {
    if (!destino) continue;
    if (!/\{\d+(?::n)?\}/.test(origem)) {
      exatos.set(origem, destino);
      const alto = origem.toUpperCase();
      if (alto !== origem && !emMaiusculas.has(alto)) emMaiusculas.set(alto, destino.toLocaleUpperCase('fr-FR'));
      continue;
    }
    let fonte = '^';
    let desde = 0;
    let ancora = '';
    const ordem: number[] = [];
    for (const m of origem.matchAll(MARCA)) {
      const literal = origem.slice(desde, m.index);
      if (literal.length > ancora.length) ancora = literal;
      fonte += escapar(literal);
      // `song{1}`: colado a uma palavra é um plural, e pode vir vazio.
      fonte += m[2] ? '(\\d[\\d\\s.,\\u00a0\\u202f]*)' : /[A-Za-z]$/.test(literal) ? '(.*?)' : '(.+?)';
      ordem.push(Number(m[1]));
      desde = (m.index ?? 0) + m[0].length;
    }
    const fim = origem.slice(desde);
    if (fim.length > ancora.length) ancora = fim;
    if (!/[A-Za-z]{2}/.test(origem.replace(MARCA, ''))) continue; // só variáveis: apanhava tudo
    fonte += escapar(fim) + '$';
    moldes.push({
      re: new RegExp(fonte, 's'), ancora, destino, ordem,
      comPonto: origem.includes('·'), fixo: origem.replace(MARCA, '').length,
    });
  }
  // Os mais específicos primeiro: "Added {0} to Liked Songs." antes de "Added {0} to {1}.".
  moldes.sort((a, b) => b.ancora.length - a.ancora.length || b.fixo - a.fixo);

  /** Uma variável que é ela própria um rótulo ("songs") traduz-se; um título não. */
  function variavel(valor: string, fundo: number): string {
    const nu = valor.trim();
    if (!nu || eConteudo(nu)) return valor;
    const exato = exatos.get(nu);
    if (exato !== undefined) return valor.replace(nu, exato);
    // "12 songs" montado noutro sítio: só o que começa por um número, para um
    // título desconhecido nunca passar pelos moldes.
    if (fundo < 3 && /^\d/.test(nu)) {
      const t = nucleo(nu, fundo + 1);
      if (t !== null) return valor.replace(nu, t);
    }
    return valor;
  }

  function porMolde(texto: string, fundo: number): { texto: string; comPonto: boolean } | null {
    for (const m of moldes) {
      if (m.ancora && !texto.includes(m.ancora)) continue;
      const r = m.re.exec(texto);
      if (!r) continue;
      const valores: string[] = [];
      m.ordem.forEach((n, i) => { valores[n] = r[i + 1] ?? ''; });
      return {
        texto: m.destino.replace(/\{(\d+)(?::n)?\}/g, (_, n: string) => variavel(valores[Number(n)] ?? '', fundo)),
        comPonto: m.comPonto,
      };
    }
    return null;
  }

  function nucleo(texto: string, fundo = 0): string | null {
    const exato = exatos.get(texto);
    if (exato !== undefined) return exato;
    const compacto = texto.replace(/\s+/g, ' ');
    if (compacto !== texto) {
      const c = exatos.get(compacto);
      if (c !== undefined) return c;
    }
    if (/[A-Z]/.test(compacto) && compacto === compacto.toUpperCase()) {
      const alto = emMaiusculas.get(compacto);
      if (alto !== undefined) return alto;
    }
    const molde = porMolde(compacto, fundo);
    // Uma linha composta parte-se pelos " · " antes de um molde que não foi
    // escrito para ela: "Liked Songs · 12 songs" não é um "{0} songs".
    if (molde && (molde.comPonto || !compacto.includes(SEPARADOR))) return molde.texto;
    if (compacto.includes(SEPARADOR)) {
      let mudou = false;
      const pedacos = compacto.split(SEPARADOR).map((p) => {
        const nu = p.trim();
        if (!nu || !TEM_LETRAS.test(nu) || eConteudo(nu)) return p;
        const t = nucleo(nu, fundo);
        if (t === null || t === nu) return p;
        mudou = true;
        return p.replace(nu, t);
      });
      if (mudou) return pedacos.join(SEPARADOR);
    }
    return molde?.texto ?? null;
  }

  const memoria = new Map<string, string>();

  return function traduzir(texto: string): string {
    if (!texto || !TEM_LETRAS.test(texto)) return texto;
    const ja = memoria.get(texto);
    if (ja !== undefined) return ja;
    const partes = /^(\s*)([\s\S]*?)(\s*)$/.exec(texto)!;
    const meio = partes[2];
    const t = eConteudo(meio) ? null : nucleo(meio);
    const saida = t === null ? texto : partes[1] + t + partes[3];
    if (memoria.size > 20_000) memoria.clear();
    memoria.set(texto, saida);
    return saida;
  };
}
