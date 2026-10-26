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
export type AnaliseDoRitmo = { ritmo: RitmoDaFaixa | null; motivo: string | null };

const CHAVE = 'automix:ritmos';
/** Mudar a análise (ritmo.ts) sobe isto, e o que estava guardado deixa de valer. */
// A 5.4.0 podia guardar janelas vazias ao tentar ler Opus com AVAudioFile.
// A 3 (26/10) traz onde a batida começa e acaba (`batidaS`), para as
// passagens entre andamentos diferentes. A 4 (26/10, depois do relatório da
// 5.4.2) o andamento pela soma dos múltiplos: no trap a 3 saía errado. A 5
// (26/10) a fase pelos agudos e a tonalidade, com o binário que os lê. A 6
// (26/10, relatório da 5.4.3) a estabilidade do andamento.
const VERSAO = 6;
const MAXIMO = 400;
const JANELA_DO_INICIO_S = 40;
const JANELA_DO_FIM_S = 45;

type Guardado = { v: number; faixas: Record<string, { i: RitmoCompacto; f: RitmoCompacto; visto: number }> };

let memoria: Guardado | null = null;
let aLer: Promise<Guardado> | null = null;
const emCurso = new Map<string, Promise<AnaliseDoRitmo>>();
// Uma falha de leitura nao fica para sempre, nem se repete a cada evento do motor.
const falhas = new Map<string, { ate: number; resultado: AnaliseDoRitmo }>();
let vezDeAnalisar: Promise<unknown> = Promise.resolve();

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
  return (await analisarRitmoComDiagnostico(id, uri)).ritmo;
}

/** O mesmo trabalho, com a razao local para o relatorio (nunca enviada ao servidor). */
export async function analisarRitmoComDiagnostico(id: string, uri: string): Promise<AnaliseDoRitmo> {
  const g = await ler();
  const ja = g.faixas[id];
  if (ja) return { ritmo: { inicio: descompactar(ja.i), fim: descompactar(ja.f) }, motivo: null };
  if (!temAutomixNativo) return { ritmo: null, motivo: 'native analysis unavailable' };
  if (!uri) return { ritmo: null, motivo: 'local audio missing' };
  const chave = `${id}:${uri}`;
  const falha = falhas.get(chave);
  if (falha && falha.ate > Date.now()) return falha.resultado;
  const corrente = emCurso.get(chave);
  if (corrente) return corrente;
  // Uma faixa de cada vez, mesmo com a atual e a seguinte a pedirem juntas.
  const trabalho = vezDeAnalisar.then(async (): Promise<AnaliseDoRitmo> => {
    const energia = estadoDeEnergia();
    if (quantoPoupar(energia) === 'tudo') {
      return { ritmo: null, motivo: `analysis paused (thermal ${energia?.termico ?? 'unknown'}, low power ${energia?.poupanca ? 'on' : 'off'})` };
    }
    try {
      // Uma janela de cada vez: duas leituras de disco em paralelo só subiam
      // o pico de CPU, e há tempo de sobra até a passagem.
      const inicio = energiasDoNativo(await analisarRitmoNativo(uri, 0, JANELA_DO_INICIO_S));
      const fim = energiasDoNativo(await analisarRitmoNativo(uri, -1, JANELA_DO_FIM_S));
      const r: RitmoDaFaixa = {
        inicio: inicio ? ritmoDaJanela(inicio, 'inicio') : null,
        fim: fim ? ritmoDaJanela(fim, 'fim') : null,
      };
      if (!inicio || !fim) {
        const resultado = { ritmo: r, motivo: `native audio unreadable (${!inicio && !fim ? 'start and end' : !inicio ? 'start' : 'end'})` };
        falhas.set(chave, { ate: Date.now() + 60_000, resultado });
        if (falhas.size > MAXIMO) falhas.delete(falhas.keys().next().value!);
        return resultado;
      }
      g.faixas[id] = { i: compactar(r.inicio), f: compactar(r.fim), visto: Date.now() };
      gravar(g);
      falhas.delete(chave);
      return { ritmo: r, motivo: null };
    } catch {
      const resultado = { ritmo: null, motivo: 'rhythm analysis failed' };
      falhas.set(chave, { ate: Date.now() + 60_000, resultado });
      if (falhas.size > MAXIMO) falhas.delete(falhas.keys().next().value!);
      return resultado;
    }
  }).finally(() => { emCurso.delete(chave); });
  vezDeAnalisar = trabalho;
  emCurso.set(chave, trabalho);
  return trabalho;
}
