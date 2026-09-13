import type { Track } from '../types';

/**
 * A biblioteca lida uma vez, e não a cada visita ao separador.
 *
 * ## Porque existe
 *
 * Cada ida aos Artists eram duas consultas ao Supabase (as gostadas mais as
 * faixas de todas as playlists, com junção) e uma espera com o ecrã vazio,
 * para mostrar exatamente o que já lá estava um segundo antes. No PC isto já
 * vivia dentro do `desktop/paginas/comum.web.tsx`; subiu para aqui por duas
 * razões: o iPhone tinha o mesmo problema e não tinha cache nenhuma, e o
 * arranque precisa de encher isto ANTES de alguém tocar num separador -- e o
 * `App.tsx` é partilhado, não pode importar um ficheiro `.web`.
 *
 * ## A chave é o LEITOR
 *
 * São duas listas e não são a mesma: a biblioteca alargada (`getLibrary`) e só
 * as gostadas (`getLikedSongs`). Guardar por função em vez de por nome evita
 * inventar etiquetas que dois sítios teriam de escrever igual.
 *
 * Sem imports de runtime (só o tipo), como o `lib/radio.ts`: é isso que o
 * mantém testável em Node puro -- ver `scripts/test-cache-da-biblioteca.ts`.
 */

export type LeitorDeFaixas = () => Promise<Track[]>;

/**
 * Meia hora. A biblioteca muda quando ELE a muda, e nessas alturas quem mexe
 * força a releitura (o evento `duotone:refresh-library` no PC, o
 * `esquecerBiblioteca` ao trocar de sessão).
 */
export const VALIDADE_DA_BIBLIOTECA_MS = 30 * 60 * 1000;

const guardado = new Map<LeitorDeFaixas, { em: number; faixas: Track[] }>();
/** Uma leitura em curso por leitor: duas páginas a abrir ao mesmo tempo (ou o
 *  aquecimento e uma página) não podem dar duas consultas. */
const emCurso = new Map<LeitorDeFaixas, Promise<Track[]>>();

/** O que está guardado e ainda vale, ou `null`. Não vai à rede. */
export function faixasEmCache(leitor: LeitorDeFaixas, agora: number = Date.now()): Track[] | null {
  const entrada = guardado.get(leitor);
  if (!entrada) return null;
  return agora - entrada.em < VALIDADE_DA_BIBLIOTECA_MS ? entrada.faixas : null;
}

export function guardarFaixas(leitor: LeitorDeFaixas, faixas: Track[], agora: number = Date.now()): void {
  guardado.set(leitor, { em: agora, faixas });
}

/** Esquece tudo. Ao trocar de sessão, a biblioteca é de outra pessoa. */
export function esquecerBiblioteca(): void {
  guardado.clear();
  emCurso.clear();
}

/**
 * A lista, da cache se ela valer, do servidor se não.
 *
 * `forcar` salta a cache mas continua a partilhar a leitura em curso: quem
 * carrega duas vezes no refrescar não faz duas consultas.
 */
export async function lerFaixas(
  leitor: LeitorDeFaixas,
  opcoes: { forcar?: boolean } = {},
): Promise<Track[]> {
  if (!opcoes.forcar) {
    const guardadas = faixasEmCache(leitor);
    if (guardadas) return guardadas;
  }
  const jaVem = emCurso.get(leitor);
  if (jaVem) return jaVem;

  const pedido = leitor()
    .then((faixas) => {
      guardarFaixas(leitor, faixas);
      return faixas;
    })
    .finally(() => {
      if (emCurso.get(leitor) === pedido) emCurso.delete(leitor);
    });
  emCurso.set(leitor, pedido);
  return pedido;
}
