/**
 * A Live Activity do Duotone (26/11, item 8 do plano de melhorias, a opção B de
 * `docs/live-activity-maquete.html`): o que o cartão diz, montado aqui e já na
 * língua da app, porque a extensão não lê nada da app (sem App Group).
 *
 * Só aparece quando há algo que o sistema não mostra: a Jam (quem ouve, quem juntou
 * a música), o temporizador (a contagem é o iOS que a desenha) e a passagem do
 * AutoMix. Sem nada disso, `null`: a atividade acaba e o ecrã bloqueado fica como era.
 *
 * Puro, sem imports de runtime (`scripts/test-atividade-ao-vivo.ts`). Quem o chama é
 * o `hooks/useAtividadeAoVivo.ts`; quem desenha, o `targets/controlos/AtividadeDoDuotone.swift`.
 */

/** O estado da atividade: os mesmos campos do `EstadoDaAtividade` do Swift. */
export type EstadoDaAtividade = {
  jamTitulo: string | null;
  jamLinha: string | null;
  jamOuvintes: string | null;
  /** "A#c08a5a": a inicial e a cor de cada pessoa. */
  jamCaras: string[];
  temporizadorTitulo: string | null;
  temporizadorLinha: string | null;
  /** Segundos desde 1970. Sem fim: para no fim da música. */
  temporizadorInicio: number | null;
  temporizadorFim: number | null;
  misturaTitulo: string | null;
  misturaLinha: string | null;
  misturaCurta: string | null;
  misturaCores: string[];
  /** Quando o que se mostra deixa de ser verdade (o iOS marca-a como velha). */
  velhaEmS: number | null;
};

export type PessoaDaJam = { id: string; nome: string };

export type JamParaAtividade = {
  /** Quem lá está além de mim, pela ordem em que entrou. */
  outros: PessoaDaJam[];
  /** Quantos ouvem, comigo. */
  ouvintes: number;
  /** Quem juntou a música que toca, se se sabe. */
  quemJuntou: { nome: string; souEu: boolean } | null;
  anfitriao: { nome: string; souEu: boolean } | null;
};

export type TemporizadorParaAtividade = { inicioMs: number; fimMs: number | null };

export type MisturaParaAtividade = {
  /** O título da música que entra. */
  para: string;
  /** "124 → 128 BPM · 8A → 9A" (`legendaDaPassagem`), ou nada. */
  legenda: string | null;
  /** A cor da que sai e a da que entra. */
  cores: [string, string];
  acabaEmMs: number;
};

/** As cores das caras: tons da maquete, escolhidos pela pessoa (sempre a mesma). */
export const CORES_DAS_CARAS = ['#c08a5a', '#5a8ac0', '#7aa05a', '#a05a8a', '#5aa09a', '#a08f5a'] as const;

export function corDaPessoa(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CORES_DAS_CARAS[h % CORES_DAS_CARAS.length];
}

export function inicial(nome: string): string {
  const letra = [...nome.trim()][0];
  return letra ? letra.toLocaleUpperCase() : '?';
}

const ate = Math.round;

/** "124→128" da legenda, para o pouco espaço da Dynamic Island. */
export function curtaDaLegenda(legenda: string | null): string | null {
  const m = legenda?.match(/(\d+)\s*→\s*(\d+)\s*BPM/);
  return m ? `${m[1]}→${m[2]}` : null;
}

function tituloDaJam(outros: PessoaDaJam[], t: (s: string) => string): string {
  const nomes = outros.map((p) => p.nome);
  if (nomes.length === 0) return t('Your Jam');
  if (nomes.length === 1) return t(`Jam with ${nomes[0]}`);
  if (nomes.length === 2) return t(`Jam with ${nomes[0]} and ${nomes[1]}`);
  return t(`Jam with ${nomes[0]}, ${nomes[1]} and ${nomes.length - 2} more`);
}

function linhaDaJam(j: JamParaAtividade, t: (s: string) => string): string | null {
  if (j.quemJuntou) return j.quemJuntou.souEu ? t('You added this song') : t(`${j.quemJuntou.nome} added this song`);
  if (j.anfitriao) return j.anfitriao.souEu ? t("You're hosting") : t(`${j.anfitriao.nome} is hosting`);
  return null;
}

/**
 * O que a atividade mostra, ou `null` quando não há nada para dizer. `agoraMs`
 * deita fora uma passagem ou um temporizador que já acabaram.
 */
export function estadoDaAtividade(
  e: { jam: JamParaAtividade | null; temporizador: TemporizadorParaAtividade | null; mistura: MisturaParaAtividade | null },
  agoraMs: number,
  t: (s: string) => string = (s) => s,
): EstadoDaAtividade | null {
  const temporizador = e.temporizador && (e.temporizador.fimMs === null || e.temporizador.fimMs > agoraMs) ? e.temporizador : null;
  const mistura = e.mistura && e.mistura.acabaEmMs > agoraMs ? e.mistura : null;
  const jam = e.jam;
  if (!jam && !temporizador && !mistura) return null;

  const velhas = [temporizador?.fimMs, mistura?.acabaEmMs].filter((v): v is number => typeof v === 'number');
  return {
    jamTitulo: jam ? tituloDaJam(jam.outros, t) : null,
    jamLinha: jam ? linhaDaJam(jam, t) : null,
    jamOuvintes: jam && jam.ouvintes > 1 ? t(`${jam.ouvintes} listening`) : null,
    jamCaras: jam ? jam.outros.slice(0, 3).map((p) => `${inicial(p.nome)}${corDaPessoa(p.id)}`) : [],
    temporizadorTitulo: temporizador ? (temporizador.fimMs === null ? t('Music stops after this song') : t('Music stops in')) : null,
    temporizadorLinha: temporizador ? t('Sleep timer') : null,
    temporizadorInicio: temporizador ? ate(Math.min(temporizador.inicioMs, temporizador.fimMs ?? temporizador.inicioMs) / 1000) : null,
    temporizadorFim: temporizador && temporizador.fimMs !== null ? ate(temporizador.fimMs / 1000) : null,
    misturaTitulo: mistura ? t(`Mixing into ${mistura.para}`) : null,
    misturaLinha: mistura ? mistura.legenda : null,
    misturaCurta: mistura ? curtaDaLegenda(mistura.legenda) ?? t('AutoMix') : null,
    misturaCores: mistura ? [...mistura.cores] : [],
    // Uns segundos depois do fim: o iOS escurece-a se a app não chegar a tempo de a mudar.
    velhaEmS: velhas.length ? ate(Math.min(...velhas) / 1000 + 5) : null,
  };
}

/** Duas atividades iguais não se mandam duas vezes (cada atualização acorda a extensão). */
export function chaveDaAtividade(e: EstadoDaAtividade | null): string {
  return e ? JSON.stringify(e) : '';
}
