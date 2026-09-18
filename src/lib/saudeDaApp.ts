/**
 * A app a ver-se a si própria: erros, crashes, bloqueios e o tempo de arranque.
 *
 * Até aqui uma exceção num ecrã deixava-o em branco, e um crash no iPhone não
 * deixava rasto nenhum. Os incidentes guardam-se no aparelho no instante em que
 * acontecem (o processo pode estar a morrer) e vão para o `app_events` na
 * abertura seguinte.
 *
 * **A regra do `eventos.ts` mantém-se: nada de conteúdo.** Uma mensagem de erro
 * pode trazer um título, um URL com o id do vídeo ou um caminho com o nome do
 * utilizador. Por isso passa por `limparMensagem` antes de sair daqui, e o que
 * junta os erros iguais é uma `assinatura` (um hash), não o texto.
 *
 * Sem imports: `scripts/test-saude-da-app.ts` corre isto em Node puro.
 */

export type TipoDeIncidente =
  /** Uma exceção de JS (num ecrã, global, ou uma promessa sem `catch`). */
  | 'erro-js'
  /** A app estava à frente e não fechou: crash nativo, falta de memória ou o iOS a matá-la. */
  | 'sessao-interrompida'
  /** Um crash nativo contado pelo sistema (MetricKit no iPhone, Crashpad no PC). */
  | 'crash-nativo'
  /** A app ficou presa (MetricKit no iPhone, `unresponsive` no PC). */
  | 'bloqueio'
  /** O processo da página do PC morreu e foi reaberto. */
  | 'renderer'
  /** Uma exceção no processo principal do Electron. */
  | 'principal'
  /** O processo da GPU do Electron morreu. */
  | 'gpu';

export type Incidente = {
  tipo: TipoDeIncidente;
  quando: number;
  fatal?: boolean;
  /** `global`, `promessa`, `ecra:<Nome>`, `principal`... */
  onde?: string;
  nome?: string;
  /** Já limpa (`limparMensagem`). */
  mensagem?: string;
  assinatura?: string;
  /** O que o sistema disse: `crashed`, `oom`, `SIGSEGV`, ... */
  motivo?: string;
  codigo?: number;
  /** A versão que estava a correr quando aconteceu. */
  versao?: string;
  /** Quantas vezes seguidas se repetiu (um erro num ciclo conta uma linha). */
  vezes?: number;
};

const MAX_MENSAGEM = 120;
export const MAX_INCIDENTES = 20;
/** O mesmo erro dentro disto é o mesmo episódio. */
export const REPETIDO_MS = 60_000;

/** O texto de um erro, sem nada que diga o que a pessoa estava a fazer. */
export function limparMensagem(texto: unknown): string {
  let s = typeof texto === 'string' ? texto : texto == null ? '' : String(texto);
  s = s.slice(0, 400)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    // A pasta de utilizador primeiro: no Windows o nome pode ter espaços, e a
    // regra geral (sem espaços, para não comer texto) deixava o apelido.
    .replace(/[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\\]*/gi, '<caminho>')
    .replace(/\/(?:Users|home)\/[^/\s]+/g, '<caminho>')
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@-]+){2,}/g, '<caminho>')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”|«[^»]*»/g, '<txt>')
    .replace(/\b[0-9a-f]{8,}(?:-[0-9a-f]{4,})*\b/gi, '<id>')
    // Um id do YouTube: 11 caracteres com letras E algarismos (ou - e _).
    .replace(/(?<![\w-])(?=[\w-]{11}(?![\w-]))(?=[\w-]*[0-9_-])(?=[\w-]*[A-Za-z])[\w-]{11}(?![\w-])/g, '<id>')
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > MAX_MENSAGEM ? `${s.slice(0, MAX_MENSAGEM - 1)}…` : s;
}

export function nomeDoErro(e: unknown): string {
  const bruto = e && typeof e === 'object'
    ? (e as { name?: unknown }).name ?? (e as object).constructor?.name
    : typeof e;
  const nome = typeof bruto === 'string' ? bruto.replace(/[^\w]/g, '').slice(0, 40) : '';
  return nome || 'Error';
}

/**
 * As primeiras linhas da pilha, sem caminhos: `função (ficheiro:linha:coluna)`.
 * Numa build final os nomes vêm minificados, mas a linha e a coluna apontam o
 * mesmo sítio em todos os aparelhos com a mesma build -- chega para agrupar.
 */
export function topoDaPilha(pilha: unknown, quantos = 3): string[] {
  if (typeof pilha !== 'string') return [];
  const saida: string[] = [];
  for (const linha of pilha.split('\n')) {
    const l = linha.trim();
    // V8/Hermes: "at fn (file:1:2)" ou "at file:1:2"; JSC: "fn@file:1:2".
    const m = /^at (?:(.+?) \()?(?:address at )?(.*?):(\d+):(\d+)\)?$/.exec(l)
      ?? /^(.*?)@(.*?):(\d+):(\d+)$/.exec(l);
    if (!m) continue;
    const funcao = (m[1] || '?').replace(/[^\w.$<>]/g, '').slice(0, 40) || '?';
    const ficheiro = (m[2].split(/[\\/]/).pop() ?? '').split(/[?#]/)[0].slice(0, 40);
    saida.push(`${funcao} (${ficheiro}:${m[3]}:${m[4]})`);
    if (saida.length >= quantos) break;
  }
  return saida;
}

/** FNV-1a de 32 bits, em hexadecimal. Não é segurança: é só agrupar. */
export function assinatura(partes: readonly string[]): string {
  let h = 0x811c9dc5;
  const texto = partes.join('|');
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function incidenteDeErro(
  e: unknown,
  o: { fatal: boolean; onde: string; quando: number; versao?: string },
): Incidente {
  const nome = nomeDoErro(e);
  const mensagem = limparMensagem(e && typeof e === 'object' ? (e as { message?: unknown }).message : e);
  const topo = topoDaPilha(e && typeof e === 'object' ? (e as { stack?: unknown }).stack : undefined);
  return {
    tipo: 'erro-js',
    quando: o.quando,
    fatal: o.fatal,
    onde: o.onde.slice(0, 60),
    nome,
    mensagem,
    assinatura: assinatura([nome, mensagem, ...topo]),
    versao: o.versao,
  };
}

/** Junta um incidente à lista guardada. Um erro num ciclo não enche a lista. */
export function juntarIncidente(lista: readonly Incidente[], novo: Incidente): Incidente[] {
  const ultimo = lista[lista.length - 1];
  if (
    ultimo && novo.assinatura && ultimo.assinatura === novo.assinatura
    && ultimo.tipo === novo.tipo && novo.quando - ultimo.quando < REPETIDO_MS
  ) {
    return [
      ...lista.slice(0, -1),
      { ...ultimo, quando: novo.quando, fatal: ultimo.fatal || novo.fatal, vezes: (ultimo.vezes ?? 1) + 1 },
    ];
  }
  return [...lista, novo].slice(-MAX_INCIDENTES);
}

const TIPOS: readonly TipoDeIncidente[] = [
  'erro-js', 'sessao-interrompida', 'crash-nativo', 'bloqueio', 'renderer', 'principal', 'gpu',
];

/** O que está guardado pode ser lixo, ou de outra versão. */
export function lerIncidentes(texto: string | null | undefined): Incidente[] {
  if (!texto) return [];
  try {
    const lista = JSON.parse(texto);
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((i) => i && typeof i === 'object' && TIPOS.includes(i.tipo) && Number.isFinite(i.quando))
      .slice(-MAX_INCIDENTES);
  } catch {
    return [];
  }
}

export type NomeDoIncidente = 'erro_js' | 'crash' | 'bloqueio';

export function nomeDoEvento(i: Incidente): NomeDoIncidente {
  if (i.tipo === 'erro-js') return 'erro_js';
  if (i.tipo === 'bloqueio') return 'bloqueio';
  return 'crash';
}

/**
 * O que vai para o `app_events`. As strings passam outra vez pela limpeza: um
 * incidente pode vir do processo principal ou do Swift, e a regra é aqui.
 */
export function dadosDoEvento(i: Incidente, agora: number): Record<string, string | number | boolean> {
  const d: Record<string, string | number | boolean> = { tipo: i.tipo };
  if (i.fatal !== undefined) d.fatal = i.fatal;
  if (i.onde) d.onde = limparMensagem(i.onde).slice(0, 60);
  if (i.nome) d.nome = i.nome.replace(/[^\w]/g, '').slice(0, 40);
  if (i.mensagem) d.mensagem = limparMensagem(i.mensagem);
  if (i.assinatura) d.assinatura = i.assinatura.replace(/[^0-9a-f]/gi, '').slice(0, 16);
  if (i.motivo) d.motivo = limparMensagem(i.motivo).slice(0, 60);
  if (typeof i.codigo === 'number' && Number.isFinite(i.codigo)) d.codigo = Math.trunc(i.codigo);
  if (i.versao) d.versao_do_incidente = String(i.versao).slice(0, 40);
  if (i.vezes && i.vezes > 1) d.vezes = Math.min(i.vezes, 9999);
  // Há quanto tempo foi: os crashes chegam na abertura SEGUINTE.
  d.ha_min = Math.max(0, Math.round((agora - i.quando) / 60_000));
  return d;
}

/**
 * A sessão anterior. `aberta` fica verdadeira enquanto a app está à frente; ir
 * para segundo plano fecha-a. Se a abertura seguinte a encontra aberta, a app
 * morreu com o ecrã à frente -- a única pista que o JS pode ter de um crash
 * nativo, de uma falta de memória ou do iOS a matá-la por estar presa.
 *
 * O que morre em segundo plano não conta: o iOS mata apps paradas todos os
 * dias, e isso não é uma falha.
 */
export type EstadoDaSessao = { aberta: boolean; desde: number; versao: string };

export function lerSessao(texto: string | null | undefined): EstadoDaSessao | null {
  if (!texto) return null;
  try {
    const s = JSON.parse(texto);
    if (!s || typeof s.aberta !== 'boolean' || !Number.isFinite(s.desde)) return null;
    return { aberta: s.aberta, desde: s.desde, versao: typeof s.versao === 'string' ? s.versao : '' };
  } catch {
    return null;
  }
}

export function incidenteDaSessaoAnterior(anterior: EstadoDaSessao | null): Incidente | null {
  if (!anterior?.aberta) return null;
  return { tipo: 'sessao-interrompida', quando: anterior.desde, fatal: true, versao: anterior.versao || undefined };
}

/**
 * O arranque a frio, em ms, e desde onde se conseguiu medir. No iPhone o React
 * Native dá o início do processo quando o sabe (`rnStartupTiming`); se não,
 * o do runtime; sem nenhum, conta-se desde que o JS começou. Todos estão no
 * mesmo relógio do `performance.now()`.
 */
export function medidaDoArranque(t: {
  agora: number;
  processo?: number | null;
  runtime?: number | null;
  js?: number | null;
}): { ms: number; desde: 'processo' | 'runtime' | 'js' } | null {
  const opcoes: [number | null | undefined, 'processo' | 'runtime' | 'js'][] = [
    [t.processo, 'processo'], [t.runtime, 'runtime'], [t.js, 'js'],
  ];
  for (const [inicio, desde] of opcoes) {
    // Pode ser negativo: o início do processo do PC vem de outro relógio, e
    // convertido para o do `performance.now()` fica antes da origem dele.
    if (typeof inicio !== 'number' || !Number.isFinite(inicio)) continue;
    const ms = Math.round(t.agora - inicio);
    if (ms < 0 || ms > 120_000) continue;
    return { ms, desde };
  }
  return null;
}

/**
 * Um diagnóstico do MetricKit, como o `modules/duotone-diagnostico` o guarda.
 * Os números do sistema (tipo de exceção, sinal) dizem que crash foi; a
 * `binario` é o módulo onde estava a primeira linha da pilha da thread que
 * morreu -- a app, o Hermes, o AVFoundation.
 */
export function incidenteDoMetricKit(bruto: unknown): Incidente | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const b = bruto as Record<string, unknown>;
  const tipo = b.tipo === 'crash' ? 'crash-nativo' : b.tipo === 'bloqueio' ? 'bloqueio' : null;
  const quando = Number(b.quando);
  if (!tipo || !Number.isFinite(quando)) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const binario = texto(b.binario)?.replace(/[^\w.+-]/g, '').slice(0, 40);
  const sinal = num(b.sinal);
  const excecao = num(b.excecao);
  const motivo = [
    sinal !== undefined ? `sinal ${sinal}` : '',
    excecao !== undefined ? `excecao ${excecao}` : '',
    binario ? `em ${binario}` : '',
    tipo === 'bloqueio' && num(b.duracaoMs) !== undefined ? `${Math.round(num(b.duracaoMs)!)} ms` : '',
  ].filter(Boolean).join(', ');
  return {
    tipo,
    quando,
    fatal: tipo === 'crash-nativo',
    onde: 'nativo',
    motivo: motivo || undefined,
    codigo: num(b.codigo),
    mensagem: texto(b.razao) ? limparMensagem(b.razao) : undefined,
    assinatura: assinatura([tipo, String(sinal ?? ''), String(excecao ?? ''), binario ?? '', ...(Array.isArray(b.pilha) ? b.pilha.map(String).slice(0, 3) : [])]),
    versao: texto(b.versao),
  };
}

/** Uma linha para o relatório de reprodução. */
export function descreverIncidente(i: Incidente): string {
  const partes = [
    i.tipo,
    i.onde,
    i.nome,
    i.mensagem,
    i.motivo,
    i.codigo !== undefined ? `code ${i.codigo}` : '',
    i.vezes && i.vezes > 1 ? `x${i.vezes}` : '',
    i.versao ? `v${i.versao}` : '',
    i.assinatura ? `#${i.assinatura}` : '',
  ];
  return partes.filter(Boolean).join(' · ');
}
