import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lancamentosDoArtista } from '../api/albunsDoArtista';
import { getLibrary } from '../api/library';
import { lerPerfilDeRecomendacoes } from '../api/perfilDeRecomendacoes';
import { agruparPorArtista } from '../lib/artistName';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import {
  artistasComNovidade, escolherArtistas, esperaAteVerificar, esperaDepoisDeFalhar, lancamentoRecenteDoArtista, lerMemoria,
  limparNovos, marcarAberto, memoriaVazia, prateleira, registarArtista, type ItemDaPrateleira, type Lancamento,
  type MemoriaDosLancamentos,
} from '../lib/novosLancamentos';
import { contagensNoAparelho } from '../lib/playCounts';
import type { Track } from '../types';
import { useArtistasFavoritos } from './artistasFavoritos';
import { useConnectivity } from './connectivity';
import { emRecuo, faltaDoRecuo } from '../lib/pedidosAoYouTube';

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
 *
 * 15/10: e volta a olhar com a app aberta -- quando passam as 20 h, depois de
 * uma falha (5 min, 15, 1 h, 3 h) e quando a rede volta. Antes só se olhava ao
 * abrir a conta, e o PC, aberto dias seguidos no tabuleiro, nunca mais via
 * nada de novo. Custo: o mesmo pedido do perfil por verificação (uma por dia).
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
let relogio: ReturnType<typeof setTimeout> | null = null;
let aVerificar = false;
let falhasSeguidas = 0;

/**
 * No iPhone não se vai à rede por isto com a app escondida (a regra da
 * energia): fica para quando ela volta ao ecrã. O PC vive no tabuleiro, e lá
 * continua a ver.
 */
const escondidaNoIPhone = () => Platform.OS !== 'web' && AppState.currentState !== 'active';

function agendar(daConta: string, minha: number, esperaMs: number): void {
  if (relogio) clearTimeout(relogio);
  relogio = null;
  if (minha !== geracao) return;
  relogio = setTimeout(() => { relogio = null; void verificar(daConta, minha); }, Math.max(ESPERA_DEPOIS_DE_ABRIR_MS, esperaMs));
}

/** O que se ouviu de cada artista, para provar o canal de quem não tem nada guardado (o histórico do aparelho). */
async function ouvidasPorArtista(): Promise<Track[]> {
  const contagens = await contagensNoAparelho().catch(() => []);
  return contagens
    .filter((c) => c.source === 'youtube' && c.sourceId && c.title)
    .sort((a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed)
    .map((c) => ({
      source: c.source, sourceId: c.sourceId, title: c.title, artist: c.artist,
      album: null, artworkUrl: c.artworkUrl, durationSeconds: c.durationSeconds,
    }));
}

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
  falhasSeguidas = 0;
  useNovosLancamentos.setState({ itens: [], comNovidade: new Set() });
  void (async () => {
    try {
      const guardado = await AsyncStorage.getItem(chaveGuardada(daConta));
      if (minha !== geracao) return;
      memoria = lerMemoria(guardado ? JSON.parse(guardado) : null);
    } catch {
      if (minha !== geracao) return;
      memoria = memoriaVazia();
    }
    publicar();
    agendar(daConta, minha, esperaAteVerificar(memoria, Date.now()));
  })();
  // A rede voltou e a verificação estava em falta (falhou, ou passou a hora
  // sem rede): olha-se outra vez, sem esperar pela próxima tentativa.
  const sairDaRede = useConnectivity.subscribe((s, antes) => {
    if (s.offline || !antes.offline || minha !== geracao || aVerificar) return;
    if (esperaAteVerificar(memoria, Date.now()) === 0) agendar(daConta, minha, 0);
  });
  // Ficou em falta com a app escondida (iPhone): olha-se quando ela volta.
  const sairDoEcra = AppState.addEventListener('change', (estado) => {
    if (estado !== 'active' || minha !== geracao || aVerificar) return;
    if (esperaAteVerificar(memoria, Date.now()) === 0) agendar(daConta, minha, 0);
  });
  return () => {
    sairDaRede();
    sairDoEcra.remove();
    if (minha !== geracao) return;
    if (relogio) clearTimeout(relogio);
    relogio = null;
    geracao++;
    conta = null;
    memoria = memoriaVazia();
    useNovosLancamentos.setState({ itens: [], comNovidade: new Set() });
  };
}

async function verificar(daConta: string, minha: number): Promise<void> {
  const viva = () => minha === geracao;
  if (!viva() || escondidaNoIPhone()) return;
  // Ainda a acabar outra (a da conta anterior, que desiste no próximo passo).
  if (aVerificar) { agendar(daConta, minha, 60_000); return; }
  // Sem rede: tenta-se mais tarde (e logo que ela volte, pelo `useConnectivity`).
  if (useConnectivity.getState().offline) { agendar(daConta, minha, esperaDepoisDeFalhar(++falhasSeguidas)); return; }
  // O YouTube está a recusar pedidos desta ligação (16/10,
  // lib/pedidosAoYouTube.ts): os lançamentos esperam que o recuo acabe.
  if (emRecuo()) { agendar(daConta, minha, faltaDoRecuo() + 60_000); return; }
  aVerificar = true;
  let lidos = 0;
  let artistas: { chave: string }[] = [];
  try {
    // Os favoritos vêm da conta: espera-se um pouco por eles.
    for (let i = 0; i < 25 && !useArtistasFavoritos.getState().carregados; i++) await esperar(200);
    const favoritos = [...useArtistasFavoritos.getState().chaves];
    const [faixas, perfil, ouvidas] = await Promise.all([
      lerFaixas(getLibrary).catch(() => []),
      lerPerfilDeRecomendacoes(20).catch(() => null),
      ouvidasPorArtista(),
    ]);
    if (!viva()) return;
    const maisOuvidos = perfil ? [...perfil.escutas.entries()].sort((a, b) => b[1] - a[1]).map(([chave]) => chave) : [];
    // As provas: as músicas guardadas e, para um artista que se ouve sem nada
    // guardado (15/10), as que se ouviram dele. Antes esse ficava de fora.
    const grupos = new Map(agruparPorArtista(faixas).map((g) => [g.chave, g]));
    for (const g of agruparPorArtista(ouvidas)) if (!grupos.get(g.chave)?.faixas.length) grupos.set(g.chave, g);
    const escolhidos = escolherArtistas(favoritos, maisOuvidos, grupos, undefined, (chave) => memoria.artistas[chave]?.lidoEm ?? 0);
    artistas = escolhidos;
    for (const a of escolhidos) {
      if (!viva() || useConnectivity.getState().offline || emRecuo()) break;
      const lido = await lancamentosDoArtista(a.nome, a.faixas, memoria.artistas[a.chave]?.canal ?? null).catch(() => null);
      if (!viva()) return;
      if (!lido) continue;
      lidos++;
      memoria = registarArtista(memoria, a.chave, a.nome, lido.canal, lido.albuns, Date.now());
      publicar();
      await gravar(daConta);
    }
  } finally {
    aVerificar = false;
  }
  if (!viva()) return;
  // Nenhum lido (a rede caiu a meio, o YouTube Music em baixo): volta mais
  // tarde. Os que falharam numa verificação que leu outros ficam para a
  // seguinte, à frente da fila (o `lidoEm` deles não mudou).
  if (lidos > 0 || !artistas.length) {
    falhasSeguidas = 0;
    memoria = { ...limparNovos(memoria, Date.now()), verificadoEm: Date.now() };
    agendar(daConta, minha, esperaAteVerificar(memoria, Date.now()));
  } else {
    agendar(daConta, minha, esperaDepoisDeFalhar(++falhasSeguidas));
  }
  publicar();
  await gravar(daConta);
}

/**
 * Para o Radio (16/10, `state/lancamentosNoRadio.ts`): o lançamento recente de
 * um artista que a prateleira segue, pela memória dela. Zero pedidos.
 */
export function lancamentoParaORadio(chave: string): Lancamento | null {
  if (!conta || !chave) return null;
  return lancamentoRecenteDoArtista(memoria, chave, Date.now());
}

/** Abriu-se a página do artista: o ponto dele nos Artists sai. */
export function marcarArtistaAberto(chave: string): void {
  if (!conta || !chave || !useNovosLancamentos.getState().comNovidade.has(chave)) return;
  memoria = marcarAberto(memoria, chave, Date.now());
  publicar();
  void gravar(conta);
}
