import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lancamentosDoArtista } from '../api/albunsDoArtista';
import { getLibrary } from '../api/library';
import { lerPerfilDeRecomendacoes } from '../api/perfilDeRecomendacoes';
import { agruparPorArtista } from '../lib/artistName';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import {
  artistasComNovidade, escolherArtistas, lerMemoria, limparNovos, marcarAberto, memoriaVazia,
  prateleira, precisaDeVerificar, registarArtista, type ItemDaPrateleira, type MemoriaDosLancamentos,
} from '../lib/novosLancamentos';
import { useArtistasFavoritos } from './artistasFavoritos';
import { useConnectivity } from './connectivity';

/**
 * Os novos lançamentos dos teus artistas (10/10, `lib/novosLancamentos.ts`).
 *
 * A memória vive NO APARELHO (AsyncStorage; no PC o localStorage), por conta:
 * a verificação é uma vez por dia e só fala com o YouTube Music. O único
 * pedido ao Supabase é o perfil de escuta (quem se ouve mais), uma vez por
 * dia, e só quando há verificação.
 *
 * Começa 8 s depois de a conta abrir, para não disputar a rede e o JavaScript
 * com a abertura, e vê um artista de cada vez.
 */
type Estado = {
  itens: ItemDaPrateleira[];
  /** As chaves dos artistas com um lançamento novo que ainda não se foi ver. */
  comNovidade: Set<string>;
};

export const useNovosLancamentos = create<Estado>(() => ({ itens: [], comNovidade: new Set() }));

const ESPERA_DEPOIS_DE_ABRIR_MS = 8000;
const chaveGuardada = (conta: string) => `novos-lancamentos:v1:${conta}`;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

let memoria: MemoriaDosLancamentos = memoriaVazia();
let conta: string | null = null;
let geracao = 0;

function publicar(): void {
  const agora = Date.now();
  useNovosLancamentos.setState({ itens: prateleira(memoria, agora), comNovidade: artistasComNovidade(memoria, agora) });
}

async function gravar(daConta: string): Promise<void> {
  try { await AsyncStorage.setItem(chaveGuardada(daConta), JSON.stringify(memoria)); } catch { /* fica para a próxima */ }
}

/** Liga para a conta que abriu; devolve quem desliga (a conta saiu). */
export function iniciarNovosLancamentos(daConta: string): () => void {
  const minha = ++geracao;
  conta = daConta;
  memoria = memoriaVazia();
  useNovosLancamentos.setState({ itens: [], comNovidade: new Set() });
  let relogio: ReturnType<typeof setTimeout> | null = null;
  void (async () => {
    try {
      const guardado = await AsyncStorage.getItem(chaveGuardada(daConta));
      if (minha !== geracao) return;
      memoria = lerMemoria(guardado ? JSON.parse(guardado) : null);
    } catch {
      memoria = memoriaVazia();
    }
    publicar();
    if (precisaDeVerificar(memoria, Date.now())) {
      relogio = setTimeout(() => { void verificar(daConta, minha); }, ESPERA_DEPOIS_DE_ABRIR_MS);
    }
  })();
  return () => {
    if (relogio) clearTimeout(relogio);
    if (minha !== geracao) return;
    geracao++;
    conta = null;
    memoria = memoriaVazia();
    useNovosLancamentos.setState({ itens: [], comNovidade: new Set() });
  };
}

async function verificar(daConta: string, minha: number): Promise<void> {
  const viva = () => minha === geracao;
  if (useConnectivity.getState().offline) return; // fica para a próxima abertura
  // Os favoritos vêm da conta: espera-se um pouco por eles.
  for (let i = 0; i < 25 && !useArtistasFavoritos.getState().carregados; i++) await esperar(200);
  const favoritos = [...useArtistasFavoritos.getState().chaves];
  const [faixas, perfil] = await Promise.all([
    lerFaixas(getLibrary).catch(() => []),
    lerPerfilDeRecomendacoes(20).catch(() => null),
  ]);
  if (!viva()) return;
  const maisOuvidos = perfil ? [...perfil.escutas.entries()].sort((a, b) => b[1] - a[1]).map(([chave]) => chave) : [];
  const grupos = new Map(agruparPorArtista(faixas).map((g) => [g.chave, g]));
  const artistas = escolherArtistas(favoritos, maisOuvidos, grupos);
  let lidos = 0;
  for (const a of artistas) {
    if (!viva() || useConnectivity.getState().offline) return;
    const lido = await lancamentosDoArtista(a.nome, a.faixas, memoria.artistas[a.chave]?.canal ?? null).catch(() => null);
    if (!viva()) return;
    if (!lido) continue;
    lidos++;
    memoria = registarArtista(memoria, a.chave, a.nome, lido.canal, lido.albuns, Date.now());
    publicar();
    await gravar(daConta);
  }
  if (!viva()) return;
  // Nenhum lido (a rede caiu a meio): volta a tentar na próxima abertura.
  if (lidos > 0 || !artistas.length) memoria = { ...limparNovos(memoria, Date.now()), verificadoEm: Date.now() };
  publicar();
  await gravar(daConta);
}

/** Abriu-se a página do artista: o ponto dele nos Artists sai. */
export function marcarArtistaAberto(chave: string): void {
  if (!conta || !chave || !useNovosLancamentos.getState().comNovidade.has(chave)) return;
  memoria = marcarAberto(memoria, chave, Date.now());
  publicar();
  void gravar(conta);
}
