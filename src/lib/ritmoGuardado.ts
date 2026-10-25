import AsyncStorage from '@react-native-async-storage/async-storage';
import { analisarRitmoNativo, temAutomixNativo } from '../../modules/duotone-audio';
import { estadoDeEnergia } from '../../modules/duotone-diagnostico';
import { quantoPoupar } from './adiantarFaixas';
import { compactar, descompactar, energiasDoNativo, ritmoDaJanela, type Ritmo, type RitmoCompacto } from './ritmo';

/**
 * O ritmo de cada faixa já analisada, para o AutoMix (25/10): o do início
 * (quando ela entra) e o do fim (quando ela sai).
 *
 * Analisa-se UMA vez por faixa, do ficheiro que já está em disco, e guarda-se
 * no aparelho (AsyncStorage, não o `yt_cache`: é só deste iPhone, e não custa
 * pedido nenhum). Duas janelas e não o ficheiro todo: os primeiros 40 s e os
 * últimos 45 s, que é onde as passagens acontecem.
 *
 * Com o iPhone quente ou em poupança de bateria não se analisa nada
 * (`quantoPoupar`, o mesmo que manda adiantar menos faixas): a passagem fica o
 * crossfade de sempre, que não precisa de análise.
 */
export type RitmoDaFaixa = { inicio: Ritmo | null; fim: Ritmo | null };

const CHAVE = 'automix:ritmos';
/** Mudar a análise (ritmo.ts) sobe isto, e o que estava guardado deixa de valer. */
const VERSAO = 1;
const MAXIMO = 400;
const JANELA_DO_INICIO_S = 40;
const JANELA_DO_FIM_S = 45;

type Guardado = { v: number; faixas: Record<string, { i: RitmoCompacto; f: RitmoCompacto; visto: number }> };

let memoria: Guardado | null = null;
let aLer: Promise<Guardado> | null = null;
const emCurso = new Map<string, Promise<RitmoDaFaixa | null>>();

function ler(): Promise<Guardado> {
  if (memoria) return Promise.resolve(memoria);
  aLer ??= AsyncStorage.getItem(CHAVE)
    .then((cru) => {
      const obj = cru ? JSON.parse(cru) : null;
      memoria = obj && obj.v === VERSAO && obj.faixas && typeof obj.faixas === 'object' ? obj : { v: VERSAO, faixas: {} };
      return memoria!;
    })
    .catch(() => (memoria = { v: VERSAO, faixas: {} }));
  return aLer;
}

function gravar(g: Guardado): void {
  const ids = Object.keys(g.faixas);
  if (ids.length > MAXIMO) {
    ids.sort((a, b) => g.faixas[a].visto - g.faixas[b].visto);
    for (const id of ids.slice(0, ids.length - MAXIMO)) delete g.faixas[id];
  }
  AsyncStorage.setItem(CHAVE, JSON.stringify(g)).catch(() => {});
}

/** O que já se sabe desta faixa, sem ler o disco nem analisar. */
export function ritmoGuardado(id: string): RitmoDaFaixa | null {
  const l = memoria?.faixas[id];
  return l ? { inicio: descompactar(l.i), fim: descompactar(l.f) } : null;
}

/**
 * O ritmo de uma faixa: o guardado, ou analisado agora do ficheiro em disco.
 * `null` sem módulo nativo, com o iPhone a poupar, ou se o ficheiro não se
 * ler. Nunca lança. Duas chamadas ao mesmo tempo partilham a mesma análise.
 */
export async function analisarRitmoDaFaixa(id: string, uri: string): Promise<RitmoDaFaixa | null> {
  const g = await ler();
  const ja = g.faixas[id];
  if (ja) return { inicio: descompactar(ja.i), fim: descompactar(ja.f) };
  if (!temAutomixNativo || !uri) return null;
  if (quantoPoupar(estadoDeEnergia()) === 'tudo') return null;
  const corrente = emCurso.get(id);
  if (corrente) return corrente;
  const trabalho = (async () => {
    try {
      // Uma janela de cada vez: duas leituras de disco em paralelo só subiam
      // o pico de CPU, e há tempo de sobra até a passagem.
      const inicio = energiasDoNativo(await analisarRitmoNativo(uri, 0, JANELA_DO_INICIO_S));
      const fim = energiasDoNativo(await analisarRitmoNativo(uri, -1, JANELA_DO_FIM_S));
      if (!inicio && !fim) return null;
      const r: RitmoDaFaixa = {
        inicio: inicio ? ritmoDaJanela(inicio, 'inicio') : null,
        fim: fim ? ritmoDaJanela(fim, 'fim') : null,
      };
      g.faixas[id] = { i: compactar(r.inicio), f: compactar(r.fim), visto: Date.now() };
      gravar(g);
      return r;
    } catch {
      return null;
    } finally {
      emCurso.delete(id);
    }
  })();
  emCurso.set(id, trabalho);
  return trabalho;
}
