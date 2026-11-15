import { Animated } from 'react-native';
import { create } from 'zustand';
import { getGaveta, setGaveta } from '../lib/prefs';
import { gavetaInicial, lerGaveta, type DadosDaPrimeira, type Gaveta } from '../lib/gaveta';
import { molaIOS } from './transicaoDoLeitor';
import { pedirFluidez } from './fluidez';

/**
 * A gaveta da Home do iPhone em memória (6.0.4) -- as regras vivem em
 * `lib/gaveta.ts`, o painel em `components/Gaveta.tsx`.
 *
 * A abertura é um valor do motor nativo, como a do leitor
 * (`state/transicaoDoLeitor.ts`): a app inteira desliza para a direita com ela,
 * e o dedo soma-se-lhe (`dedoDaGaveta`, em pontos) enquanto arrasta, sem passar
 * pelo JavaScript.
 */

/** 0 = fechada, 1 = aberta. */
export const aberturaDaGaveta = new Animated.Value(0);
/** O arrasto em curso, em pontos: positivo a abrir (da borda), negativo a fechar. */
export const dedoDaGaveta = new Animated.Value(0);

/** A largura do painel: quase o ecrã, mas a Home fica sempre à vista para se tocar e fechar. */
export function larguraDaGaveta(larguraDoEcra: number): number {
  return Math.round(Math.min(340, larguraDoEcra * 0.84));
}

/** Quanto se vê da gaveta, de 0 a 1, com o dedo incluído. */
export function aberturaVista(largura: number) {
  return Animated.add(aberturaDaGaveta, Animated.multiply(dedoDaGaveta, 1 / Math.max(1, largura)))
    .interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
}

type Estado = {
  gaveta: Gaveta | null;
  carregada: boolean;
  /** Aberta ou a abrir: a Home não recebe toques e o véu fecha-a. */
  aberta: boolean;
  /** A editar: × tira, ⤢ muda o tamanho, tocar em duas troca-as. */
  editar: boolean;
  /** A primeira peça tocada a editar, à espera da segunda. */
  escolhida: string | null;
  /** A folha de acrescentar peças. */
  acrescentar: boolean;
  /** Muda cada vez que a gaveta abre: as peças entram em cascata a partir daí. */
  aberturas: number;
};

export const useGaveta = create<Estado>(() => ({
  gaveta: null, carregada: false, aberta: false, editar: false, escolhida: null, acrescentar: false, aberturas: 0,
}));

let gravacao: Promise<void> = Promise.resolve();

/** Lê a gaveta guardada. Sem nenhuma, fica `null` até à primeira abertura (que a faz). */
export async function carregarGaveta(): Promise<void> {
  if (useGaveta.getState().carregada) return;
  const gaveta = lerGaveta(await getGaveta());
  useGaveta.setState({ gaveta, carregada: true });
}

/** Muda a gaveta e grava-a, pela ordem em que as mudanças aconteceram. */
export function mudarGaveta(f: (g: Gaveta) => Gaveta): void {
  const atual = useGaveta.getState().gaveta;
  if (!atual) return;
  const nova = f(atual);
  if (nova === atual) return;
  useGaveta.setState({ gaveta: nova });
  gravacao = gravacao.then(() => setGaveta(nova)).catch(() => {});
}

/**
 * A primeira gaveta, feita no instante em que se abre pela primeira vez, com o
 * que a app já tem no aparelho nessa altura (os recentes, os amigos).
 */
function garantirPrimeira(dados: () => DadosDaPrimeira): void {
  const { gaveta, carregada } = useGaveta.getState();
  if (gaveta || !carregada) return;
  const nova = gavetaInicial(dados());
  useGaveta.setState({ gaveta: nova });
  gravacao = gravacao.then(() => setGaveta(nova)).catch(() => {});
}

/**
 * Abre a gaveta com a mola de abrir do leitor. `velocidade` (pontos por segundo,
 * do dedo) e `largura` deixam a mola continuar o gesto em vez de recomeçar.
 */
export function abrirGaveta(dados: () => DadosDaPrimeira, o: { velocidade?: number; largura?: number } = {}): void {
  garantirPrimeira(dados);
  const s = useGaveta.getState();
  useGaveta.setState({ aberta: true, aberturas: s.aberta ? s.aberturas : s.aberturas + 1 });
  pedirFluidez(900);
  Animated.spring(aberturaDaGaveta, {
    toValue: 1, useNativeDriver: true, ...molaIOS(0.5, 0.86),
    velocity: o.velocidade && o.largura ? o.velocidade / o.largura : 0,
  }).start();
}

/** Fecha a gaveta (e sai da edição: voltar a abrir é usar, não editar). */
export function fecharGaveta(o: { velocidade?: number; largura?: number } = {}): void {
  if (!useGaveta.getState().aberta) return;
  useGaveta.setState({ aberta: false, editar: false, escolhida: null, acrescentar: false });
  pedirFluidez(700);
  Animated.spring(aberturaDaGaveta, {
    toValue: 0, useNativeDriver: true, ...molaIOS(0.42, 0.92),
    velocity: o.velocidade && o.largura ? o.velocidade / o.largura : 0,
  }).start();
}

/**
 * O fim de um arrasto: a abertura passa a ser onde o dedo a deixou, e a mola
 * decide para que lado vai -- pelo caminho feito ou pela velocidade.
 */
export function largarGaveta(o: {
  deslocacao: number; velocidade: number; largura: number; deAbrir: boolean; dados: () => DadosDaPrimeira;
}): void {
  const base = o.deAbrir ? 0 : 1;
  const agora = Math.min(1, Math.max(0, base + o.deslocacao / Math.max(1, o.largura)));
  aberturaDaGaveta.setValue(agora);
  dedoDaGaveta.setValue(0);
  const abrir = Math.abs(o.velocidade) > 500 ? o.velocidade > 0 : agora > 0.4;
  if (abrir) {
    // Já aberta (um fecho que desistiu): `abrirGaveta` não conta outra abertura.
    abrirGaveta(o.dados, { velocidade: o.velocidade, largura: o.largura });
  } else {
    // Um abrir que desistiu ainda não estava marcado como aberto: a mola tem de voltar na mesma.
    useGaveta.setState({ aberta: true });
    fecharGaveta({ velocidade: o.velocidade, largura: o.largura });
  }
}

/**
 * O ecrã à frente (o nome da rota), escrito pelo `RootNavigator` a cada mudança
 * de navegação. A borda da gaveta só abre na Home ("Search"), na raiz.
 */
export const useEcraAtual = create<{ nome: string | undefined }>(() => ({ nome: undefined }));

export function editarGaveta(editar: boolean): void {
  useGaveta.setState({ editar, escolhida: null, ...(editar ? {} : { acrescentar: false }) });
}
