/**
 * Quanto custa o iPhone com a app em segundo plano (1/10): o CPU gasto entre ir
 * para trás e voltar, por que threads, a bateria e o estado térmico.
 *
 * Nasceu de o João sentir o 17 Pro Max quente com 30 min de música e o ecrã
 * desligado. Sem números, cada correção era um palpite; com isto, o relatório
 * de reprodução diz se o que gasta é o JavaScript (temporizadores, a store),
 * o áudio (o AVPlayer, o tap do EQ) ou a rede -- e o `app_events` recebe o
 * resumo de cada período, sem ser preciso pedir o relatório a ninguém.
 *
 * O retrato vem do `cpuDoProcesso` (modules/duotone-diagnostico): o CPU total
 * do processo (inclui threads que já morreram) e o de cada thread viva, pelo
 * nome. Sem imports: `scripts/test-energia-em-segundo-plano.ts`.
 */

export type Retrato = {
  em: number;
  totalMs: number;
  /** Por nome normalizado (várias threads podem ter o mesmo). */
  threads: Record<string, number>;
  termico: string;
  poupanca: boolean;
  /** 0 a 1; `null` se não se sabe. */
  bateria: number | null;
  aCarregar: boolean | null;
  aTocar: boolean;
};

export type Grupo = 'javascript' | 'audio' | 'rede' | 'imagens' | 'sem-nome' | 'outros';
export const GRUPOS: readonly Grupo[] = ['javascript', 'audio', 'rede', 'imagens', 'sem-nome', 'outros'];

export type Periodo = {
  desde: number;
  minutos: number;
  cpuMs: number;
  /** CPU em percentagem de UM núcleo, durante o período. */
  cpuPct: number;
  porGrupo: Record<Grupo, number>;
  /** As threads que mais gastaram (nome normalizado, ms). */
  topo: { nome: string; ms: number }[];
  termicoInicio: string;
  termicoFim: string;
  bateriaInicio: number | null;
  bateriaFim: number | null;
  aCarregar: boolean;
  aTocar: boolean;
};

/** Abaixo disto não é um período: é o desbloquear e voltar. */
export const MINUTOS_MINIMOS = 1;
export const PERIODOS_GUARDADOS = 5;

/** Os números e endereços dos nomes saem: `queue.0x1c2` e `queue.0x3f4` são a mesma coisa. */
export function normalizarNome(nome: string): string {
  return nome.trim().replace(/0x[0-9a-f]+/gi, '#').replace(/\d+/g, '#');
}

export function grupoDaThread(nome: string): Grupo {
  if (!nome) return 'sem-nome';
  // `hades` é o recolhedor de lixo do Hermes: trabalho do JavaScript.
  if (/javascript|hermes|hades|com\.facebook\.react\.runtime/i.test(nome)) return 'javascript';
  // AQProcessingTapManager é o tap do EQ: no relatório da 4.4.1 caía em "outros".
  if (/audio|coremedia|AQClient|AQProcessingTap|AVAudio|avfoundation|caulk|com\.apple\.coreaudio|mediatoolbox|MTAudioProcessingTap/i.test(nome)) return 'audio';
  if (/NSURL|CFNetwork|network|nw[._]|tcp|websocket|SocketRocket|SRWebSocket|boringssl/i.test(nome)) return 'rede';
  if (/SDWebImage|ImageIO|image/i.test(nome)) return 'imagens';
  return 'outros';
}

/** Lê o que o módulo nativo devolveu. `null` se não presta. */
export function lerRetrato(cru: unknown, extra: { em: number; bateria: number | null; aCarregar: boolean | null; aTocar: boolean }): Retrato | null {
  if (!cru || typeof cru !== 'object') return null;
  const o = cru as { totalMs?: unknown; threads?: unknown; termico?: unknown; poupanca?: unknown };
  const totalMs = Number(o.totalMs);
  if (!Number.isFinite(totalMs) || totalMs < 0) return null;
  const threads: Record<string, number> = {};
  if (Array.isArray(o.threads)) {
    for (const t of o.threads) {
      const nome = normalizarNome(String((t as { nome?: unknown })?.nome ?? ''));
      const ms = Number((t as { ms?: unknown })?.ms);
      if (!Number.isFinite(ms) || ms < 0) continue;
      threads[nome] = (threads[nome] ?? 0) + ms;
    }
  }
  const bateria = extra.bateria != null && Number.isFinite(extra.bateria) && extra.bateria >= 0 && extra.bateria <= 1
    ? extra.bateria : null;
  return {
    em: extra.em,
    totalMs,
    threads,
    termico: typeof o.termico === 'string' ? o.termico : 'unknown',
    poupanca: o.poupanca === true,
    bateria,
    aCarregar: extra.aCarregar,
    aTocar: extra.aTocar,
  };
}

/**
 * O que se gastou entre dois retratos. Uma thread que nasceu no meio conta
 * inteira; uma que morreu perde-se do detalhe mas não do total -- a diferença
 * vai para `outros`.
 */
export function compararRetratos(a: Retrato, b: Retrato): Periodo | null {
  const duracao = b.em - a.em;
  if (!(duracao > 0)) return null;
  const minutos = duracao / 60_000;
  const cpuMs = Math.max(0, b.totalMs - a.totalMs);
  const porGrupo = Object.fromEntries(GRUPOS.map((g) => [g, 0])) as Record<Grupo, number>;
  const porNome: { nome: string; ms: number }[] = [];
  let somados = 0;
  for (const [nome, ms] of Object.entries(b.threads)) {
    const gasto = Math.max(0, ms - (a.threads[nome] ?? 0));
    if (gasto <= 0) continue;
    porGrupo[grupoDaThread(nome)] += gasto;
    porNome.push({ nome: nome || '(unnamed, incl. main)', ms: gasto });
    somados += gasto;
  }
  porGrupo.outros += Math.max(0, cpuMs - somados);
  porNome.sort((x, y) => y.ms - x.ms);
  return {
    desde: a.em,
    minutos,
    cpuMs,
    cpuPct: (cpuMs / duracao) * 100,
    porGrupo,
    topo: porNome.slice(0, 6),
    termicoInicio: a.termico,
    termicoFim: b.termico,
    bateriaInicio: a.bateria,
    bateriaFim: b.bateria,
    aCarregar: a.aCarregar === true || b.aCarregar === true,
    aTocar: a.aTocar,
  };
}

/** Junta um período à lista (os mais recentes no fim), se durou o suficiente. */
export function guardarPeriodo(lista: readonly Periodo[], p: Periodo | null): readonly Periodo[] {
  if (!p || p.minutos < MINUTOS_MINIMOS) return lista;
  return [...lista, p].slice(-PERIODOS_GUARDADOS);
}

const pct = (ms: number, p: Periodo) => `${((ms / (p.minutos * 60_000)) * 100).toFixed(2)}%`;
const bateria = (v: number | null) => (v == null ? '?' : `${Math.round(v * 100)}%`);

/**
 * A secção do relatório de reprodução. `aFrente` (3/10): a mesma conta com a
 * app aberta, de 5 em 5 minutos -- é por lá que se vê o que aquece o
 * telemóvel com o ecrã ligado.
 */
export function textoDaEnergia(periodos: readonly Periodo[], agora: number, aFrente = false): string {
  const linhas = [aFrente
    ? 'foreground energy (CPU of one core with the app open, every 5 min):'
    : 'background energy (CPU of one core while the app was in the background):'];
  if (!periodos.length) {
    linhas.push(aFrente
      ? '  no foreground period of 1 min or more yet'
      : '  no background period of 1 min or more since the app opened');
    return linhas.join('\n');
  }
  for (const p of [...periodos].reverse()) {
    const haMin = Math.round((agora - p.desde) / 60_000);
    linhas.push(
      `  ${haMin} min ago, ${p.minutos.toFixed(1)} min${p.aTocar ? ', playing' : ', not playing'}`
      + `${p.aCarregar ? ', charging' : ''}: CPU ${p.cpuPct.toFixed(2)}%`
      + ` | battery ${bateria(p.bateriaInicio)} -> ${bateria(p.bateriaFim)}`
      + ` | thermal ${p.termicoInicio} -> ${p.termicoFim}`,
    );
    linhas.push('    ' + GRUPOS.filter((g) => p.porGrupo[g] > 0).map((g) => `${g} ${pct(p.porGrupo[g], p)}`).join(', '));
    for (const t of p.topo) linhas.push(`    ${pct(t.ms, p)}  ${t.nome}`);
  }
  return linhas.join('\n');
}

/** Para o `app_events`: só números (e o estado térmico, que é uma palavra do iOS). */
export function dadosDoEvento(p: Periodo): Record<string, number | string | boolean> {
  const g = (x: Grupo) => Math.round((p.porGrupo[x] / (p.minutos * 60_000)) * 10_000) / 100;
  return {
    min: Math.round(p.minutos),
    cpu_pct: Math.round(p.cpuPct * 100) / 100,
    js_pct: g('javascript'),
    audio_pct: g('audio'),
    rede_pct: g('rede'),
    outros_pct: Math.round((g('outros') + g('sem-nome') + g('imagens')) * 100) / 100,
    a_tocar: p.aTocar,
    a_carregar: p.aCarregar,
    bateria_pp: p.bateriaInicio != null && p.bateriaFim != null ? Math.round((p.bateriaInicio - p.bateriaFim) * 100) : -1,
    termico: p.termicoFim,
  };
}
