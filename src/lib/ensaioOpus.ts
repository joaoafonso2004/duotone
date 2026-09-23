/**
 * O ensaio do Opus no iPhone -- entrega 2 do docs/PLANO-AUDIO-IOS-CACHE-OPUS.md.
 *
 * Uma pergunta só: o AVPlayer toca Opus num MP4 (ou num CAF) do princípio ao
 * fim, com a duração certa no ecrã bloqueado, e com seek, pausa, velocidade e
 * equalizador? Se não tocar em nenhum contentor, o Opus morre aqui e o plano
 * fecha-se sem dívida; se tocar, a entrega 3 (o conversor) tem onde assentar.
 *
 * **É interno e é SÓ deste ramo** (`plano-audio`): o interruptor abaixo, os
 * ficheiros em assets/ensaio-opus/, o ecrã e o passo do CI saem antes de se
 * juntar ao main. Os ficheiros vêm de `scripts/gerar-ensaio-opus.mjs`.
 *
 * Sem imports de runtime: as listas e o texto do resultado testam-se em Node.
 */

/** Mostra "Opus test" nas Definições. */
export const ENSAIO_OPUS_LIGADO = true;

export type IdDoEnsaio = 'opus-fmp4' | 'opus-mp4' | 'opus-caf' | 'aac-fmp4';

export interface FicheiroDoEnsaio {
  id: IdDoEnsaio;
  nome: string;
  explicacao: string;
  /** Com que nome fica em Documents: o mesmo sítio e a mesma extensão que a cache real. */
  nomeEmDisco: string;
}

export const FICHEIROS_DO_ENSAIO: readonly FicheiroDoEnsaio[] = [
  {
    id: 'aac-fmp4', nome: 'AAC · fMP4 (control)', nomeEmDisco: 'ensaio-aac-fmp4.m4a',
    explicacao: 'Same sound in AAC, through the app\'s own fixer. Must pass; if not, the test itself is broken.',
  },
  {
    id: 'opus-fmp4', nome: 'Opus · fMP4', nomeEmDisco: 'ensaio-opus-fmp4.m4a',
    explicacao: 'The layout the app would use: fragmented, durations only in the fragments. This one decides.',
  },
  {
    id: 'opus-mp4', nome: 'Opus · plain MP4', nomeEmDisco: 'ensaio-opus-mp4.m4a',
    explicacao: 'Reference: duration in the header. If even this fails, AVPlayer does not do Opus in MP4.',
  },
  {
    id: 'opus-caf', nome: 'Opus · CAF', nomeEmDisco: 'ensaio-opus.caf',
    explicacao: 'Written by Apple\'s afconvert on the CI Mac. The fallback container if MP4 fails.',
  },
];

/** O que se verifica de ouvido e de olho, em cada ficheiro. */
export const VERIFICACOES = [
  { id: 'inicio', texto: 'Heard the short high beep at the very start' },
  { id: 'fim', texto: 'Heard all three beeps at the end' },
  { id: 'ecra', texto: 'Lock screen shows 0:30 (not 1:00)' },
  { id: 'bloqueado', texto: 'Keeps playing with the screen locked' },
  { id: 'seek', texto: 'Seek lands where it should (pitch rises every 5 s)' },
  { id: 'velocidade', texto: '0.5× and 2× change speed AND pitch' },
  { id: 'eq', texto: 'Bass boost is audible' },
] as const;

export type IdDaVerificacao = (typeof VERIFICACOES)[number]['id'];

export interface MedicaoDoEnsaio {
  estado: string;
  erro: string | null;
  /** `player.duration` quando ficou pronto. Tem de dar ~30. */
  duracao: number | null;
  msAtePronto: number | null;
  /** A posição quando o motor disse que acabou. */
  fimEm: number | null;
}

export type Resposta = 'sim' | 'nao' | null;

export interface ResultadoDoEnsaio {
  medicao: MedicaoDoEnsaio | null;
  respostas: Partial<Record<IdDaVerificacao, Resposta>>;
}

/** sem resposta → sim → não → sem resposta. */
export function proximaResposta(r: Resposta | undefined): Resposta {
  return r === 'sim' ? 'nao' : r === 'nao' ? null : 'sim';
}

/** A duração que o motor leu conta como certa? O 2x do fMP4 daria ~60. */
export function duracaoCerta(d: number | null): boolean | null {
  if (d === null || !Number.isFinite(d) || d <= 0) return null;
  return Math.abs(d - 30) <= 0.5;
}

/** O texto para mandar pela folha de partilha. */
export function textoDoResultado(e: {
  ios: string;
  build: string;
  versao: string;
  cafDoAfconvert: boolean;
  resultados: Partial<Record<IdDoEnsaio, ResultadoDoEnsaio>>;
}): string {
  const linhas = [`Duotone · Opus test · iOS ${e.ios} · build ${e.build} (${e.versao})`, ''];
  const marca = (r: Resposta | undefined) => (r === 'sim' ? 'yes' : r === 'nao' ? 'NO' : '—');
  for (const f of FICHEIROS_DO_ENSAIO) {
    const r = e.resultados[f.id];
    linhas.push(`## ${f.nome}`);
    if (f.id === 'opus-caf' && !e.cafDoAfconvert) {
      linhas.push('not in this build (afconvert did not write it)', '');
      continue;
    }
    if (!r?.medicao) {
      linhas.push('not played', '');
      continue;
    }
    const m = r.medicao;
    const dur = m.duracao === null ? '—' : `${m.duracao.toFixed(3)} s`;
    const certa = duracaoCerta(m.duracao);
    linhas.push(`status: ${m.estado}${m.erro ? ` · error: ${m.erro}` : ''}`);
    linhas.push(`duration read: ${dur}${certa === null ? '' : certa ? ' (ok)' : ' (WRONG)'}`);
    linhas.push(`ready after: ${m.msAtePronto === null ? '—' : `${m.msAtePronto} ms`}`);
    linhas.push(`ended at: ${m.fimEm === null ? '—' : `${m.fimEm.toFixed(3)} s`}`);
    for (const v of VERIFICACOES) linhas.push(`${marca(r.respostas[v.id])} · ${v.texto}`);
    linhas.push('');
  }
  return linhas.join('\n');
}
