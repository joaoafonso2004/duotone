/**
 * Rejeições implícitas aprendidas durante a escuta.
 *
 * Um toque em "seguinte" é ambíguo: pode ser apenas falta de tempo, humor ou
 * um upload avariado. Por isso uma faixa nunca chega, nem repetir o mesmo
 * upload. Só três músicas distintas do mesmo artista, saltadas cedo dentro de
 * 30 dias, formam um sinal moderado. Uma escuta substancial perdoa a rejeição
 * mais antiga desse artista.
 *
 * **Guarda-se o que ACONTECEU, não o resultado.** A aprendizagem viaja pela
 * conta, e juntar dois aparelhos por união de rejeições ressuscitava a que uma
 * escuta tinha apagado no outro. Com eventos (saltos e escutas), a junção é uma
 * união e o peso sai de os repassar por ordem: dá o mesmo em qualquer aparelho.
 *
 * Esta lista contém música e artista e, por isso, não entra nos eventos
 * anónimos. É preferência privada da conta (AsyncStorage e `yt_cache`, que tem
 * RLS por pessoa).
 */

export type EventoAprendido =
  | { tipo: 'salto'; artista: string; faixa: string; em: number }
  | { tipo: 'escuta'; artista: string; em: number };

export const JANELA_DA_APRENDIZAGEM_MS = 30 * 24 * 60 * 60 * 1000;
/** Os eventos vivem o dobro da janela: uma escuta recente tem de encontrar o
 * salto que perdoa, mesmo que esse já esteja perto de expirar. */
export const GUARDAR_EVENTOS_MS = 2 * JANELA_DA_APRENDIZAGEM_MS;
export const SALTOS_PARA_APRENDER = 3;
export const PESO_DE_REJEICAO_REPETIDA = 0.5;
export const MAX_EVENTOS = 400;

const chaveDoEvento = (e: EventoAprendido) =>
  JSON.stringify(e.tipo === 'salto' ? ['s', e.artista, e.faixa, e.em] : ['e', e.artista, e.em]);

/** Aceita o que vier do disco ou da conta e devolve só eventos válidos e
 * dentro do prazo, por ordem, sem repetidos. */
export function lerEventos(valor: unknown, agora = Date.now()): EventoAprendido[] {
  if (!Array.isArray(valor)) return [];
  const desde = agora - GUARDAR_EVENTOS_MS;
  const porChave = new Map<string, EventoAprendido>();
  for (const item of valor) {
    if (!item || typeof item.artista !== 'string' || !item.artista) continue;
    if (typeof item.em !== 'number' || !Number.isFinite(item.em)) continue;
    if (item.em < desde || item.em > agora + 60_000) continue;
    let evento: EventoAprendido;
    if (item.tipo === 'salto' && typeof item.faixa === 'string' && item.faixa) {
      evento = { tipo: 'salto', artista: item.artista, faixa: item.faixa, em: item.em };
    } else if (item.tipo === 'escuta') {
      evento = { tipo: 'escuta', artista: item.artista, em: item.em };
    } else continue;
    porChave.set(chaveDoEvento(evento), evento);
  }
  return [...porChave.values()]
    .sort((a, b) => a.em - b.em || (a.tipo === b.tipo ? 0 : a.tipo === 'salto' ? -1 : 1))
    .slice(-MAX_EVENTOS);
}

/** Aparelho + conta: uma união. A ordem dos eventos decide o resto. */
export function juntarAprendizagens(
  local: unknown,
  conta: unknown,
  agora = Date.now(),
): EventoAprendido[] {
  return lerEventos([...lerEventos(local, agora), ...lerEventos(conta, agora)], agora);
}

export function registarSaltoAprendido(
  eventos: readonly EventoAprendido[],
  artista: string,
  faixa: string,
  agora = Date.now(),
): EventoAprendido[] {
  if (!artista || !faixa) return lerEventos(eventos, agora);
  return lerEventos([...eventos, { tipo: 'salto', artista, faixa, em: agora }], agora);
}

/**
 * Uma recomendação realmente ouvida vale mais do que a rejeição mais antiga.
 * Só fica registada quando há alguma para perdoar: sem isto, cada escuta de
 * uma sugestão enchia a lista e empurrava os saltos para fora do teto.
 */
export function registarEscutaAprendida(
  eventos: readonly EventoAprendido[],
  artista: string,
  agora = Date.now(),
): EventoAprendido[] {
  const limpos = lerEventos(eventos, agora);
  if (!rejeicoesAtivas(limpos, agora).get(artista)?.size) return limpos;
  return lerEventos([...limpos, { tipo: 'escuta', artista, em: agora }], agora);
}

/**
 * Repassa os eventos por ordem: cada salto marca a música (o mais recente
 * ganha), cada escuta tira a marca mais antiga desse artista. Com `naJanela`,
 * só ficam as marcas dos últimos 30 dias.
 */
export function rejeicoesAtivas(
  eventos: readonly EventoAprendido[],
  agora = Date.now(),
  naJanela = true,
): Map<string, Map<string, number>> {
  const ativas = new Map<string, Map<string, number>>();
  for (const e of lerEventos(eventos, agora)) {
    const doArtista = ativas.get(e.artista) ?? new Map<string, number>();
    ativas.set(e.artista, doArtista);
    if (e.tipo === 'salto') {
      doArtista.delete(e.faixa);
      doArtista.set(e.faixa, e.em);
      continue;
    }
    let maisAntiga: string | null = null;
    for (const [faixa, em] of doArtista) {
      const antes = maisAntiga === null ? Infinity : doArtista.get(maisAntiga)!;
      if (em < antes || (em === antes && faixa < maisAntiga!)) maisAntiga = faixa;
    }
    if (maisAntiga !== null) doArtista.delete(maisAntiga);
  }
  if (naJanela) {
    const desde = agora - JANELA_DA_APRENDIZAGEM_MS;
    for (const doArtista of ativas.values()) {
      for (const [faixa, em] of doArtista) if (em < desde) doArtista.delete(faixa);
    }
  }
  return ativas;
}

export function pesoDaAprendizagem(
  eventos: readonly EventoAprendido[],
  artista: string,
  agora = Date.now(),
): number {
  const musicas = rejeicoesAtivas(eventos, agora).get(artista)?.size ?? 0;
  return musicas >= SALTOS_PARA_APRENDER ? PESO_DE_REJEICAO_REPETIDA : 1;
}
