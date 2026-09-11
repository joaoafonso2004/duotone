import { Platform } from 'react-native';
import { create } from 'zustand';
import {
  ajudantes, corrigirCapa, desfazerJuncao, disponibilidade, estadoDoUrl, juntar,
  procurarCopia, substituir, type Juncao,
} from '../api/higieneDaBiblioteca';
import { getLibrary, getLikedSongs } from '../api/library';
import {
  capaDoVideo, emParalelo, estadoDaCapa, gruposDeDuplicados, naoToca,
  type Disponibilidade, type GrupoDeDuplicados,
} from '../lib/higieneDaBiblioteca';
import { comCatalogo, encherDoPartilhado } from './catalogoDeFaixas';
import { usePlaylists } from './playlists';
import { useSaved } from './saved';
import type { Track } from '../types';

/**
 * O Library check, de ponta a ponta: verificar, e depois cada ação com o seu
 * "Undo". Numa store, e não no ecrã, porque numa biblioteca grande a
 * verificação demora -- sair e voltar a entrar não pode recomeçar do zero.
 *
 * Os dois ecrãs (o do iPhone e o do PC) só desenham isto.
 */

export type Indisponivel = {
  faixa: Track;
  motivo: Disponibilidade;
  /** `undefined` = ainda não se procurou; `null` = procurou-se e não há cópia segura. */
  copia?: Track | null;
};

export type CapaPartida = { faixa: Track; nova: string };

type Estado = {
  fase: 'parada' | 'a-verificar' | 'feita';
  progresso: { feitas: number; total: number } | null;
  /** Parou-se a meio: o que se mostra é o que se viu até ali. */
  interrompida: boolean;
  duplicados: GrupoDeDuplicados[];
  indisponiveis: Indisponivel[];
  capas: CapaPartida[];
  /** Os vídeos que não tocam (`sourceId`), para os grupos o dizerem na linha. */
  naoTocam: string[];
  /** O que já se resolveu, pela chave do problema: "Merged", "Replaced", "Fixed". */
  resolvidos: Record<string, string>;
  /** Num grupo junto, a faixa que ficou: o ecrã mostra as outras a sair. */
  ficou: Record<string, string>;
  /** A chave do problema que está a ser tratado agora. */
  aTratar: string | null;
  /**
   * A última ação que ainda se pode desfazer, dita com o nome da música, e as
   * chaves que ela marcou. Corrigir uma capa não a apaga: não tem "Undo" seu, e
   * não pode levar o da junção de antes.
   */
  ultima: { chave: string; rotulo: string; juncoes: Juncao[]; marcadas: string[] } | null;
  erro: string | null;
  /** O problema cuja ação falhou -- o erro diz-se na linha dele, não lá em cima. */
  erroEm: string | null;
};

/** A chave do "Undo", para o `tratar` e para o ecrã. */
export const CHAVE_DO_DESFAZER = 'desfazer';

const INICIAL: Omit<Estado, 'fase'> = {
  progresso: null, interrompida: false, duplicados: [], indisponiveis: [], capas: [], naoTocam: [],
  resolvidos: {}, ficou: {}, aTratar: null, ultima: null, erro: null, erroEm: null,
};

export const useVerificacaoDaBiblioteca = create<Estado>(() => ({ fase: 'parada', ...INICIAL }));

/** As chaves dos problemas, para o ecrã e para as ações falarem do mesmo. */
export const chaveDoGrupo = (g: GrupoDeDuplicados) => `dup:${g.chave}:${g.faixas.map((t) => t.id).join(',')}`;
export const chaveDaIndisponivel = (i: Indisponivel) => `morta:${i.faixa.id ?? i.faixa.sourceId}`;
export const chaveDaCapa = (c: CapaPartida) => `capa:${c.faixa.id ?? c.faixa.sourceId}`;

let parar = false;
/** Cresce a cada verificação: respostas de uma anterior não escrevem nesta. */
let geracao = 0;

/** Quantos pedidos de cada vez. Seis não se nota na rede e acaba depressa. */
const EM_PARALELO = 6;

const set = useVerificacaoDaBiblioteca.setState;
const get = useVerificacaoDaBiblioteca.getState;

/** A biblioteca mudou: quem a mostra relê. */
function avisarQueMudou(): void {
  void useSaved.getState().refresh();
  // A cache das Liked Songs (a que se vê sem rede) acompanha.
  void getLikedSongs().catch(() => {});
  void usePlaylists.getState().carregar(true).catch(() => {});
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('duotone:refresh-library'));
  }
}

export async function verificarBiblioteca(): Promise<void> {
  if (get().fase === 'a-verificar') return;
  const minha = ++geracao;
  parar = false;
  set({ fase: 'a-verificar', ...INICIAL, progresso: { feitas: 0, total: 0 } });
  try {
    const [gostadas, todas] = await Promise.all([getLikedSongs(), getLibrary()]);
    if (minha !== geracao) return;

    // A capa que conta é a que o ecrã desenha, e essa pode vir do catálogo
    // partilhado. Ler a tabela primeiro é barato e evita "corrigir" uma capa
    // que ninguém chega a ver.
    await encherDoPartilhado(todas).catch(() => {});

    const doYouTube = [...new Map(
      todas.filter((t) => t.source === 'youtube' && t.id).map((t) => [t.sourceId, t]),
    ).values()];
    const capasPorVer = doYouTube
      .map((t) => ({ t, mostrada: comCatalogo(t).artworkUrl }))
      .map((c) => ({ ...c, estado: estadoDaCapa(c.t, c.mostrada) }))
      .filter((c) => c.estado === 'verificar' || c.estado === 'sem-capa');
    const aPedir = capasPorVer.filter((c) => c.estado === 'verificar');

    const total = doYouTube.length + aPedir.length;
    let feitas = 0;
    const avancar = () => {
      feitas++;
      if (minha === geracao) set({ progresso: { feitas, total } });
    };
    set({ progresso: { feitas: 0, total } });

    const veredictos = await emParalelo(doYouTube, EM_PARALELO, async (t) => {
      const d = await disponibilidade(t.sourceId);
      avancar();
      return d;
    }, () => parar || minha !== geracao);
    if (minha !== geracao) return;

    const mortas = new Set<string>();
    const indisponiveis: Indisponivel[] = [];
    doYouTube.forEach((t, i) => {
      const d = veredictos[i];
      if (d && naoToca(d)) {
        mortas.add(t.sourceId);
        indisponiveis.push({ faixa: t, motivo: d });
      }
    });

    const estadosDasCapas = await emParalelo(aPedir, EM_PARALELO, async (c) => {
      const e = await estadoDoUrl(c.mostrada!);
      avancar();
      return e;
    }, () => parar || minha !== geracao);
    if (minha !== geracao) return;

    // Um vídeo morto já está na lista dele: a capa dele não é o problema.
    const partidas = new Set(aPedir.filter((_, i) => estadosDasCapas[i] === 'partida').map((c) => c.t.sourceId));
    const capas: CapaPartida[] = capasPorVer
      .filter((c) => !mortas.has(c.t.sourceId) && (c.estado === 'sem-capa' || partidas.has(c.t.sourceId)))
      .map((c) => ({ faixa: c.t, nova: capaDoVideo(c.t.sourceId) }));

    // Um vídeo morto com uma cópia viva no mesmo grupo resolve-se a juntar: o
    // "Merge" já propõe ficar com a viva. Pô-lo também nos que não tocam eram
    // dois caminhos para o mesmo problema.
    const duplicados = gruposDeDuplicados(gostadas, ajudantes, mortas);
    const comGemeaViva = new Set(duplicados
      .filter((g) => g.faixas.some((t) => !mortas.has(t.sourceId)))
      .flatMap((g) => g.faixas.map((t) => t.sourceId)));

    set({
      fase: 'feita',
      progresso: null,
      interrompida: parar,
      duplicados,
      indisponiveis: indisponiveis.filter((i) => !comGemeaViva.has(i.faixa.sourceId)),
      capas,
      naoTocam: [...mortas],
    });
  } catch (e: any) {
    if (minha !== geracao) return;
    set({ fase: 'parada', progresso: null, erro: e?.message || 'Could not check your library. Check your connection and try again.' });
  }
}

export function pararVerificacao(): void {
  parar = true;
}

/** Corre uma ação com a chave dela marcada, e o erro dito em vez de lançado. */
async function tratar(chave: string, fn: () => Promise<void>): Promise<void> {
  if (get().aTratar) return;
  set({ aTratar: chave, erro: null, erroEm: null });
  try {
    await fn();
  } catch (e: any) {
    set({ erro: e?.message || 'Could not update your library.', erroEm: chave });
  } finally {
    set({ aTratar: null });
  }
}

/** "Merged “Get Lucky”": o "Undo" diz o que desfaz. */
const comNome = (rotulo: string, t: Track) => `${rotulo} “${ajudantes.titulo(t)}”`;

function resolver(chave: string, rotulo: string, juncoes: Juncao[], nome?: string): void {
  set((s) => {
    // O que saiu da biblioteca deixa de ser problema nas outras listas: a capa
    // de uma faixa que já lá não está não se corrige, e o botão dela ia falhar.
    const saiu = new Set(juncoes.map((j) => j.sai));
    const tocaEm = (t: Track) => !!t.id && saiu.has(t.id);
    const marcadas = [...new Set([
      chave,
      ...s.duplicados.filter((g) => g.faixas.some(tocaEm)).map(chaveDoGrupo),
      ...s.indisponiveis.filter((i) => tocaEm(i.faixa)).map(chaveDaIndisponivel),
      ...s.capas.filter((c) => tocaEm(c.faixa)).map(chaveDaCapa),
    ])].filter((k) => !s.resolvidos[k]);
    return {
      resolvidos: { ...s.resolvidos, ...Object.fromEntries(marcadas.map((k) => [k, rotulo])) },
      ultima: juncoes.length ? { chave, rotulo: nome ?? rotulo, juncoes, marcadas } : s.ultima,
    };
  });
  avisarQueMudou();
}

/**
 * Juntar um grupo: fica a escolhida, as outras passam para ela. Uma a uma, e
 * se uma falhar a meio desfazem-se as que já foram -- um grupo meio junto era
 * pior do que nenhum.
 */
export function juntarGrupo(grupo: GrupoDeDuplicados, fica: Track): Promise<void> {
  const chave = chaveDoGrupo(grupo);
  return tratar(chave, async () => {
    if (!fica.id) throw new Error('This song is not in your library.');
    const feitas: Juncao[] = [];
    try {
      for (const sai of grupo.faixas) {
        if (!sai.id || sai.id === fica.id) continue;
        feitas.push(await juntar(fica.id, sai.id));
      }
    } catch (e) {
      for (const j of [...feitas].reverse()) await desfazerJuncao(j).catch(() => {});
      throw e;
    }
    set((s) => ({ ficou: { ...s.ficou, [chave]: fica.id! } }));
    resolver(chave, 'Merged', feitas, comNome('Merged', fica));
  });
}

export function procurarCopiaPara(item: Indisponivel): Promise<void> {
  const chave = chaveDaIndisponivel(item);
  return tratar(chave, async () => {
    const mortas = new Set(get().indisponiveis.map((i) => i.faixa.sourceId));
    const copia = await procurarCopia(item.faixa, mortas);
    set((s) => ({
      indisponiveis: s.indisponiveis.map((i) => (chaveDaIndisponivel(i) === chave ? { ...i, copia } : i)),
    }));
  });
}

export function substituirPelaCopia(item: Indisponivel): Promise<void> {
  const chave = chaveDaIndisponivel(item);
  return tratar(chave, async () => {
    if (!item.copia) throw new Error('Find a copy first.');
    resolver(chave, 'Replaced', [await substituir(item.faixa, item.copia)], comNome('Replaced', item.faixa));
  });
}

export function corrigirCapaDe(item: CapaPartida): Promise<void> {
  const chave = chaveDaCapa(item);
  return tratar(chave, async () => {
    if (!item.faixa.id) throw new Error('This song is not in your library.');
    await corrigirCapa(item.faixa.id);
    // Sem "Undo": a capa que estava não carregava, e voltar a ela não é
    // desfazer nada. A pré-visualização é a miniatura nova, que o ecrã mostra
    // antes de se carregar no botão.
    resolver(chave, 'Fixed', []);
  });
}

/** Desfaz a última junção ou troca, pela ordem inversa. */
export function desfazerUltima(): Promise<void> {
  const ultima = get().ultima;
  if (!ultima) return Promise.resolve();
  return tratar(CHAVE_DO_DESFAZER, async () => {
    for (const j of [...ultima.juncoes].reverse()) await desfazerJuncao(j);
    set((s) => {
      const resolvidos = { ...s.resolvidos };
      for (const k of ultima.marcadas) delete resolvidos[k];
      const ficou = { ...s.ficou };
      delete ficou[ultima.chave];
      return { resolvidos, ficou, ultima: null };
    });
    avisarQueMudou();
  });
}

/** Ao sair da conta: o relatório de uma conta não aparece à seguinte. */
export function limparVerificacao(): void {
  geracao++;
  parar = true;
  set({ fase: 'parada', ...INICIAL });
}
