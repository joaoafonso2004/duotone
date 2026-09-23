/**
 * Os downloads pedidos de propósito: nunca são apagados pela limpeza automática.
 *
 * O cache tem um teto de 500 MB e, quando é ultrapassado, os ficheiros mais
 * antigos saem. Isso está bem para o que foi guardado sozinho ao tocar, mas
 * não para o que alguém mandou guardar de propósito — descarregar um álbum
 * para uma viagem e encontrá-lo apagado à chegada é a pior coisa que um leitor
 * de música offline pode fazer.
 *
 * Antes guardava só ids fixados à mão (o cadeado do ecrã de Downloads), e um
 * "Download" não fixava nada. Agora cada download pedido É o pedido -- ver
 * `lib/downloadsExplicitos.ts`, onde vivem as decisões; aqui só se guarda.
 *
 * Os pedidos ficam no AsyncStorage e não no servidor: isto é sobre ficheiros
 * DESTE telemóvel, e um download não viaja entre aparelhos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Track } from '../types';
import {
  comPedido, escreverRegisto, lerFixadosAntigos, lerRegisto, migrarDosFixados, projecaoAntiga,
  protegidosDaLimpeza, registoVazio, semPedido, type Registo,
} from './downloadsExplicitos';

const CHAVE = 'downloads_explicitos:v1';
/** A chave antiga. Continua a ser escrita para uma versão anterior a ler. */
const CHAVE_ANTIGA = 'downloads_fixados';

interface Estado {
  registo: Registo;
  /** Faixas com um download pedido a andar AGORA, nesta sessão. */
  aDescarregar: ReadonlySet<string>;
  /**
   * `falhou`: não se conseguiu ler o que estava guardado. Nesse caso não se
   * grava nada (apagava os pedidos que lá estão) e a limpeza do arranque não
   * corre (não sabe o que proteger).
   */
  carregado: 'nao' | 'ok' | 'falhou';
}

export const useDownloadsFixados = create<Estado>(() => ({
  registo: registoVazio(),
  aDescarregar: new Set<string>(),
  carregado: 'nao',
}));

let acabarCarregamento!: () => void;
let carregamento = new Promise<void>((r) => { acabarCarregamento = r; });

/**
 * Lê os pedidos do disco. Chamar uma vez no arranque, ANTES da limpeza.
 * `ficheirosEmDisco` só é chamado na primeira abertura desta versão, para a
 * migração (ver `migrarDosFixados`).
 */
export async function carregarFixados(ficheirosEmDisco: () => string[], agora: number = Date.now()): Promise<void> {
  try {
    const [novo, antigo] = await Promise.all([AsyncStorage.getItem(CHAVE), AsyncStorage.getItem(CHAVE_ANTIGA)]);
    let registo = lerRegisto(novo);
    const migrou = registo === null;
    if (registo === null) registo = migrarDosFixados(lerFixadosAntigos(antigo), ficheirosEmDisco(), agora);
    // Um pedido feito antes de isto acabar (um toque no primeiro segundo) não se perde.
    const cedo = useDownloadsFixados.getState().registo.pedidos;
    registo = { ...registo, pedidos: { ...registo.pedidos, ...cedo } };
    useDownloadsFixados.setState({ registo, carregado: 'ok' });
    acabarCarregamento();
    if (migrou || Object.keys(cedo).length > 0) await gravar();
  } catch (e) {
    console.warn('[Downloads] Não foi possível ler os downloads guardados:', e);
    useDownloadsFixados.setState({ carregado: 'falhou' });
    acabarCarregamento();
  }
}

/**
 * As gravações vão por ordem, e cada uma escreve o estado ATUAL: uma gravação
 * lenta nunca pode acabar depois de uma mais nova e repor um pedido já tirado.
 */
let fila: Promise<boolean> = Promise.resolve(true);

function gravar(): Promise<boolean> {
  fila = fila.then(async () => {
    await carregamento;
    const { registo, carregado } = useDownloadsFixados.getState();
    if (carregado !== 'ok') return false;
    try {
      await AsyncStorage.setItem(CHAVE, escreverRegisto(registo));
      await AsyncStorage.setItem(CHAVE_ANTIGA, JSON.stringify(projecaoAntiga(registo)));
      return true;
    } catch (e) {
      console.warn('[Downloads] Não foi possível gravar os downloads:', e);
      return false;
    }
  });
  return fila;
}

function mudar(f: (r: Registo) => Registo): void {
  useDownloadsFixados.setState((s) => ({ registo: f(s.registo) }));
}

/**
 * Guarda o pedido. Se não ficar gravado, desfaz-se em memória e devolve
 * `false`: dizer que uma faixa está descarregada para sempre quando a próxima
 * abertura a esquece era prometer o que não se cumpre.
 */
export async function registarPedido(t: Track, agora: number = Date.now()): Promise<boolean> {
  const antes = useDownloadsFixados.getState().registo.pedidos[t.sourceId];
  mudar((r) => comPedido(r, t, agora));
  const ok = await gravar();
  if (!ok) {
    mudar((r) => {
      const pedidos = { ...r.pedidos };
      if (antes) pedidos[t.sourceId] = antes;
      else delete pedidos[t.sourceId];
      return { ...r, pedidos };
    });
  }
  return ok;
}

export async function esquecerPedido(id: string): Promise<void> {
  mudar((r) => semPedido(r, id));
  await gravar();
}

/** Para o "Clear YouTube cache" e o "Remover tudo": apaga também a proteção da migração. */
export async function esquecerTodos(): Promise<void> {
  useDownloadsFixados.setState({ registo: registoVazio() });
  await gravar();
}

export function marcarADescarregar(id: string, sim: boolean): void {
  useDownloadsFixados.setState((s) => {
    if (s.aDescarregar.has(id) === sim) return s;
    const aDescarregar = new Set(s.aDescarregar);
    if (sim) aDescarregar.add(id);
    else aDescarregar.delete(id);
    return { aDescarregar };
  });
}

export function temPedido(id: string): boolean {
  return id in useDownloadsFixados.getState().registo.pedidos;
}

export function estaADescarregar(id: string): boolean {
  return useDownloadsFixados.getState().aDescarregar.has(id);
}

export function idsPedidos(): string[] {
  return Object.keys(useDownloadsFixados.getState().registo.pedidos);
}

/** O que a limpeza do arranque não pode apagar. */
export function idsProtegidos(agora: number = Date.now()): string[] {
  return protegidosDaLimpeza(useDownloadsFixados.getState().registo, agora);
}

export function podeLimpar(): boolean {
  return useDownloadsFixados.getState().carregado === 'ok';
}

/** Só para testes: volta ao estado de antes de carregar. */
export function reporParaTestes(): void {
  useDownloadsFixados.setState({ registo: registoVazio(), aDescarregar: new Set(), carregado: 'nao' });
  carregamento = new Promise<void>((r) => { acabarCarregamento = r; });
  fila = Promise.resolve(true);
}
