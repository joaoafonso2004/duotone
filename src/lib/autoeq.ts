/**
 * O "Recommended" do equalizador (25/10, pedido do João): a correção medida
 * para os auscultadores que estão ligados.
 *
 * As medições são as do projeto AutoEQ, já ajustadas às dez bandas do Duotone
 * (`scripts/gerar-autoeq.mjs` -> `autoeqModelos.ts`). Vêm dentro da app: saber
 * que auscultadores se tem não custa pedido nenhum.
 *
 * O que está ligado sai do nome que a plataforma dá à saída:
 * - **iPhone**: o tipo de porta e o nome do iOS ("AirPods Pro de João"), os
 *   mesmos do preset por aparelho (`state/carro.ts`).
 * - **PC**: o rótulo da saída predefinida do Windows, como o Chromium o dá
 *   ("Default - Headphones (WH-1000XM5)").
 *
 * Quando o nome não diz o modelo (com fio, o iOS só diz "Headphones"; no PC
 * os auscultadores na ficha aparecem como "Speakers (Realtek(R) Audio)"), a
 * pessoa escolhe-o uma vez e fica lembrado para essa saída. Colunas e o
 * altifalante não têm medições: o Recommended fica plano e diz porquê, em vez
 * de inventar uma curva.
 *
 * Sem imports de runtime além dos dados: corre em Node puro
 * (`scripts/test-autoeq.ts`).
 */
import { ALFABETO, MODELOS } from './autoeqModelos';
import { PLANO, type Ganhos } from './equalizer';

export type ModeloMedido = { nome: string; ganhos: Ganhos };

let modelos: ModeloMedido[] | null = null;

/** Os modelos medidos, lidos só da primeira vez que são precisos. */
export function modelosMedidos(): ModeloMedido[] {
  if (modelos) return modelos;
  modelos = [];
  // O checkout do Windows (o CI e esta máquina) põe CRLF dentro da string:
  // partir só no \n deixava um \r no fim das letras, e nenhum modelo passava.
  for (const linha of MODELOS.split(/\r?\n/)) {
    const tab = linha.indexOf('\t');
    if (tab < 1) continue;
    const letras = linha.slice(tab + 1);
    if (letras.length !== PLANO.length) continue;
    modelos.push({ nome: linha.slice(0, tab), ganhos: [...letras].map((c) => (ALFABETO.indexOf(c) - 20) / 2) });
  }
  return modelos;
}

export function modeloPorNome(nome: string | null | undefined): ModeloMedido | null {
  if (!nome) return null;
  return modelosMedidos().find((m) => m.nome === nome) ?? null;
}

// ------------------------------------------------------------ a saída ----

/** A saída como a plataforma a dá: o iOS com o tipo de porta, o PC com 'windows'. */
export type SaidaDeSom = { tipo: string; nome: string };

/**
 * O que a saída é, para o Recommended:
 * - `auscultadores`: o modelo pode estar no nome (Bluetooth) ou não (com fio);
 * - `colunas`: sem medições, mas no PC pode ser a ficha com auscultadores;
 * - `altifalante`: o do iPhone, o AirPlay, o carro -- sem nada a escolher.
 */
export type SaidaClassificada = {
  classe: 'auscultadores' | 'colunas' | 'altifalante';
  /** O nome para mostrar, e a chave da escolha manual. */
  nome: string;
  /** O que se procura nas medições; vazio quando o nome não diz o modelo. */
  procura: string;
  /** Pode escolher-se o modelo à mão? */
  escolhe: boolean;
};

const PORTAS_DO_IPHONE = new Set(['Speaker', 'Receiver']);
const PORTAS_SEM_MEDICAO = new Set(['AirPlay', 'CarAudio', 'HDMI', 'LineOut']);
const PALAVRAS_DE_COLUNAS = /speaker|altifalante|alto-falante|coluna|lautsprecher|haut-parleur|altavoces|altoparlant/i;
const PALAVRAS_DE_AUSCULTADORES = /headphone|headset|auscultador|auricular|fones?\b|kopfh|casque|cuffie|earphone|earbud/i;

/** "Default - Headphones (2- WH-1000XM5 Stereo)" -> ["Headphones", "WH-1000XM5"]. */
export function partesDoRotuloDoWindows(rotulo: string): { tipo: string; nome: string } {
  const sem = rotulo.replace(/^\s*(default|predefini[çc][ãa]o|padr[ãa]o|communications|comunica[çc][õo]es)\s+-\s+/i, '').trim();
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(sem);
  const tipo = (m ? m[1] : '').trim();
  const nome = (m ? m[2] : sem)
    .replace(/^\d+\s*-\s*/, '')
    .replace(/\s+(stereo|hands-free( ag audio)?|handsfree)$/i, '')
    .trim();
  return { tipo, nome };
}

/** Os nomes que não dizem modelo nenhum: o da placa de som, ou o genérico. */
const NOME_GENERICO = /^(realtek.*|high definition audio.*|usb audio.*|usb.*device|headphones|headset|speakers?|auscultadores|altifalantes|colunas|.*\bhd audio\b.*|intel.*|nvidia.*|amd .*|.*display audio.*)$/i;

export function classificarSaida(saida: SaidaDeSom | null): SaidaClassificada {
  if (!saida) return { classe: 'altifalante', nome: '', procura: '', escolhe: false };
  const nome = saida.nome.trim();
  if (saida.tipo === 'windows') {
    const partes = partesDoRotuloDoWindows(nome);
    const generico = !partes.nome || NOME_GENERICO.test(partes.nome);
    const mostrar = partes.nome || nome || 'This computer';
    if (PALAVRAS_DE_COLUNAS.test(partes.tipo)) {
      // Colunas Bluetooth com nome (uma JBL) ficam planas; a ficha da placa
      // de som pode ter auscultadores ligados, e aí escolhe-se o modelo.
      return { classe: 'colunas', nome: mostrar, procura: generico ? '' : partes.nome, escolhe: true };
    }
    const auscultadores = PALAVRAS_DE_AUSCULTADORES.test(partes.tipo);
    return { classe: auscultadores ? 'auscultadores' : 'colunas', nome: mostrar, procura: generico ? '' : partes.nome, escolhe: true };
  }
  if (PORTAS_DO_IPHONE.has(saida.tipo)) return { classe: 'altifalante', nome: 'iPhone speaker', procura: '', escolhe: false };
  if (PORTAS_SEM_MEDICAO.has(saida.tipo)) return { classe: 'altifalante', nome: nome || 'This speaker', procura: '', escolhe: false };
  const generico = !nome || NOME_GENERICO.test(nome);
  return { classe: 'auscultadores', nome: nome || 'Headphones', procura: generico ? '' : nome, escolhe: true };
}

// ------------------------------------------------------ o modelo certo ----

const compacto = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * O nome sem o dono: o iOS chama aos AirPods "AirPods Pro de João" ou
 * "João's AirPods Pro", e o que interessa é o modelo.
 */
export function semDono(nome: string): string {
  return nome
    .replace(/^\s*\S+['’]s\s+/i, '')
    .replace(/\s+(de|do|da|di|von|van|del)\s+\S+(\s+\S+)?\s*$/i, '')
    .trim();
}

/**
 * Os nomes por omissão da Apple não dizem a geração: uns AirPods Pro 2 e uns
 * de primeira geração chamam-se os dois "AirPods Pro". Vai a mais recente
 * medida, que é a mais provável; o "Change" está lá para o resto.
 */
const NOMES_DA_APPLE: Record<string, string> = {
  airpods: 'Apple AirPods 4',
  airpodspro: 'Apple AirPods Pro 2',
  airpodsmax: 'Apple AirPods Max',
};

const semParenteses = (s: string) => s.replace(/\s*\(.*\)\s*/g, ' ').trim();

/**
 * O modelo medido para um nome de aparelho, ou `null` se não for claro.
 *
 * Primeiro o nome inteiro (com ou sem a marca à frente), sem as variantes
 * entre parênteses ("ANC on", "worn earpads"). Depois, só quando o que falta é
 * um número de geração ("Pro" -> "Pro 2"), a geração mais alta. Mais do que
 * isso é adivinhar, e um EQ errado é pior do que pedir para escolher.
 */
export function encontrarModelo(nomeDoAparelho: string): ModeloMedido | null {
  const procura = compacto(semDono(nomeDoAparelho));
  if (procura.length < 3) return null;
  const daApple = NOMES_DA_APPLE[procura];
  if (daApple) return modeloPorNome(daApple);
  const todos = modelosMedidos();
  let exato: ModeloMedido | null = null;
  let geracao: { m: ModeloMedido; n: number } | null = null;
  for (const m of todos) {
    const base = semParenteses(m.nome);
    const inteiro = compacto(base);
    const semMarca = compacto(base.split(' ').slice(1).join(' '));
    const variante = base !== m.nome;
    if (inteiro === procura || semMarca === procura) {
      if (!exato || (semParenteses(exato.nome) !== exato.nome && !variante)) exato = m;
      continue;
    }
    for (const alvo of [inteiro, semMarca]) {
      if (!alvo.startsWith(procura)) continue;
      const resto = alvo.slice(procura.length);
      if (!/^\d{1,2}$/.test(resto) || variante) continue;
      const n = Number(resto);
      if (!geracao || n > geracao.n) geracao = { m, n };
    }
  }
  return exato ?? geracao?.m ?? null;
}

/**
 * A pesquisa da lista "Your headphones": todas as palavras, e primeiro os
 * nomes em que elas começam palavras ("hd 6" põe o "Sennheiser HD 600" antes
 * do "Denon AH-D600", onde o "hd" está a meio). Depois, por ordem alfabética.
 */
export function procurarModelos(texto: string, limite = 40): ModeloMedido[] {
  const palavras = texto.toLowerCase().split(/\s+/).map(compacto).filter(Boolean);
  if (!palavras.length) return SUGESTOES.map(modeloPorNome).filter((m): m is ModeloMedido => !!m);
  const achados = modelosMedidos().filter((m) => {
    const alvo = compacto(m.nome);
    return palavras.every((p) => alvo.includes(p));
  });
  const pontos = (m: ModeloMedido) => {
    const doNome = m.nome.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return palavras.filter((p) => doNome.some((w) => w.startsWith(p))).length;
  };
  const comPontos = achados.map((m) => ({ m, p: pontos(m) }));
  return comPontos
    .sort((a, b) => b.p - a.p || a.m.nome.localeCompare(b.m.nome, 'en'))
    .slice(0, limite)
    .map((x) => x.m);
}

/** O que a lista mostra antes de se escrever: os mais comuns. */
const SUGESTOES = [
  'Apple AirPods Pro 2', 'Apple AirPods 4', 'Apple AirPods Max', 'Sony WH-1000XM5', 'Sony WH-1000XM4',
  'Sony WF-1000XM5', 'Bose QuietComfort Ultra Headphones', 'Bose QuietComfort 45', 'Beats Studio Pro',
  'Samsung Galaxy Buds2 Pro', 'Sennheiser Momentum 4 Wireless', 'Sennheiser HD 600', 'Sennheiser HD 650',
];

// ------------------------------------------------------ a recomendação ----

export type Recomendacao = {
  estado: 'medido' | 'escolher' | 'sem-medicao' | 'altifalante';
  /** A curva a aplicar: plana quando não há medição. */
  ganhos: Ganhos;
  /** O modelo medido, quando há. */
  modelo: string | null;
  /** Foi escolhido à mão (e não reconhecido pelo nome)? */
  escolhido: boolean;
  saida: SaidaClassificada;
};

/** As escolhas à mão: o nome da saída -> o nome do modelo. */
export type EscolhasDeModelo = Record<string, string>;

export function recomendar(saida: SaidaDeSom | null, escolhas: EscolhasDeModelo): Recomendacao {
  const s = classificarSaida(saida);
  const base = { modelo: null, escolhido: false, saida: s, ganhos: PLANO.slice() };
  if (!s.escolhe) return { ...base, estado: 'altifalante' };
  const aMao = modeloPorNome(escolhas[s.nome]);
  if (aMao) return { ...base, estado: 'medido', modelo: aMao.nome, escolhido: true, ganhos: aMao.ganhos.slice() };
  const doNome = s.procura ? encontrarModelo(s.procura) : null;
  if (doNome) return { ...base, estado: 'medido', modelo: doNome.nome, ganhos: doNome.ganhos.slice() };
  // Com nome mas sem medição (uma coluna JBL, uns auscultadores raros): plano,
  // e pode escolher-se à mão. Sem nome nenhum (com fio, a ficha do PC):
  // pergunta-se logo.
  return { ...base, estado: s.procura ? 'sem-medicao' : 'escolher' };
}

/**
 * A linha por baixo dos presets quando o Recommended está escolhido. `acao` é
 * o que o toque faz: abrir a lista ("Change"/"Choose"), ou nada.
 */
export function linhaDoRecomendado(r: Recomendacao, plataforma: 'ios' | 'pc'): {
  texto: string; destaque: string | null; acao: string | null;
} {
  if (r.estado === 'medido') return { texto: 'Tuned for ', destaque: r.modelo, acao: 'Change' };
  if (r.estado === 'escolher') {
    return r.saida.classe === 'colunas'
      ? { texto: 'Speakers · no correction, stays flat', destaque: null, acao: 'Choose headphones' }
      : { texto: 'Which headphones are these?', destaque: null, acao: 'Choose' };
  }
  if (r.estado === 'sem-medicao') {
    return { texto: `No measurements for ${r.saida.nome} · stays flat`, destaque: null, acao: 'Choose' };
  }
  if (plataforma === 'ios' && r.saida.nome === 'iPhone speaker') {
    return { texto: 'iPhone speaker · no correction, stays flat', destaque: null, acao: null };
  }
  return { texto: `${r.saida.nome || 'This speaker'} · no correction, stays flat`, destaque: null, acao: null };
}
