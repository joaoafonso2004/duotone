import { useCallback, useEffect, useState } from 'react';
import {
  limparPedidosVelhos, mandarPedido, ouvirPedidos, ouvirResposta, pedidosParaMim, responderPedido,
  verPedido,
} from '../api/comandosDeAparelho';
import { fetchOtherSessions } from '../api/playerSessions';
import type { RemoteSession } from './handoff';
import { usePlayer } from '../state/player';
import { appEstaVisivel } from './appVisibility';
import { getDeviceId } from './deviceIdentity';
import {
  VALIDADE_DO_PEDIDO_MS, aparelhosDisponiveis, devoExecutar,
  type AparelhoDisponivel, type EstadoDoPedido, type Pedido, type TipoDePedido,
} from './duotoneConnect';
import { publishSessionNow, takeOverSession } from './sessionSync';

/**
 * O lado vivo do Duotone Connect: executar as ordens que chegam, e esperar
 * pela resposta das que se mandam.
 *
 * A decisão está toda em `lib/duotoneConnect.ts` (pura, testada). Aqui é só a
 * ligação ao leitor e ao transporte.
 */

/**
 * As ordens já tratadas, para não se executarem duas vezes.
 *
 * A mesma ordem chega por dois caminhos de propósito -- o Realtime e a leitura
 * de recurso --, porque um deles falha: o Realtime cai, e quem acaba de abrir
 * a app não recebeu evento nenhum. Sem esta memória, "seguinte" saltava duas
 * faixas.
 */
const tratados = new Set<string>();

function esquecerVelhos(): void {
  // Um teto simples: a lista só cresce enquanto a app está aberta, e cada
  // entrada é um uuid.
  if (tratados.size > 200) tratados.clear();
}

type Resultado = { estado: 'feito' | 'recusado'; detalhe?: string };

const recusar = (detalhe: string): Resultado => ({ estado: 'recusado', detalhe });

/** Faz o que a ordem diz, no leitor deste aparelho. */
async function executar(pedido: Pedido): Promise<Resultado> {
  const p = usePlayer.getState();

  if (pedido.tipo === 'assumir') {
    // A sessão de quem mandou é que traz a faixa, a fila e a posição -- a
    // ordem só diz "passa para ti". Assim não há duas cópias do mesmo estado
    // a viajar por caminhos diferentes.
    const sessoes = await fetchOtherSessions();
    const dele = sessoes.find((s) => s.deviceId === pedido.deAparelho);
    if (!dele?.track) return recusar('Nothing to play');
    await takeOverSession(dele);
    return { estado: 'feito' };
  }

  if (!p.current) return recusar('Nothing is playing');

  switch (pedido.tipo) {
    case 'tocar-pausa': await p.togglePlay(); break;
    case 'pausar': if (p.isPlaying) await p.togglePlay(); break;
    case 'seguinte': await p.next(); break;
    case 'anterior': await p.prev(); break;
  }
  return { estado: 'feito' };
}

async function tratar(pedido: Pedido, meuAparelho: string): Promise<void> {
  if (!devoExecutar(pedido, meuAparelho) || tratados.has(pedido.id)) return;
  tratados.add(pedido.id);
  esquecerVelhos();
  let resultado: Resultado;
  try {
    resultado = await executar(pedido);
  } catch (e: any) {
    resultado = recusar(typeof e?.message === 'string' ? e.message.slice(0, 80) : 'Failed');
  }
  await responderPedido(pedido.id, resultado.estado, resultado.detalhe);
  // Quem mandou está a olhar para a sessão deste aparelho: publicá-la já faz
  // o outro lado mostrar a música certa sem esperar pelo batimento.
  if (resultado.estado === 'feito') publishSessionNow();
}

/**
 * Fica à escuta das ordens para este aparelho. Montado uma vez, no `App.tsx`.
 *
 * Duas portas para a mesma ordem: o Realtime (chega num instante) e uma
 * leitura a cada 20 s (rede de segurança, e é ela que apanha o que foi pedido
 * enquanto a app arrancava). O `tratados` garante que executar duas vezes não
 * acontece.
 */
export function useComandosDoAparelho(): void {
  useEffect(() => {
    let parado = false;
    let pararEscuta: () => void = () => {};
    let intervalo: ReturnType<typeof setInterval> | null = null;

    void getDeviceId().then((meu) => {
      if (parado || !meu) return;
      pararEscuta = ouvirPedidos(meu, (pedido) => { void tratar(pedido, meu); });

      const varrer = () => {
        if (!appEstaVisivel()) return;
        void pedidosParaMim(meu)
          .then((pedidos) => { for (const pedido of pedidos) void tratar(pedido, meu); })
          .catch(() => { /* sem rede não há ordens; tenta-se outra vez a seguir */ });
      };
      varrer();
      intervalo = setInterval(varrer, 20_000);
      // De vez em quando limpa-se o que já não interessa. Falhar não custa.
      void limparPedidosVelhos().catch(() => {});
    });

    return () => {
      parado = true;
      pararEscuta();
      if (intervalo) clearInterval(intervalo);
    };
  }, []);
}

/**
 * Manda uma ordem e espera pela resposta, com o teto de 30 s.
 *
 * Também aqui há duas portas: o Realtime da própria linha e uma leitura de
 * três em três segundos. Sem resposta dentro do prazo, a resposta é
 * `expirado` -- e é isso que faz a interface dizer "abre o Duotone lá" em vez
 * de ficar a rodar para sempre.
 */
export async function mandarComando(
  paraAparelho: string,
  tipo: TipoDePedido,
): Promise<EstadoDoPedido> {
  const meu = await getDeviceId();
  const pedido = await mandarPedido(meu, paraAparelho, tipo);
  // Sem tabela (migração por correr) não se finge que foi: quem chama mostra
  // o aviso de recusa.
  if (!pedido) return 'recusado';

  const estado = await esperarResposta(pedido);

  // "Play on…": quando o outro aparelho assume, este cala-se. Não se pausa
  // antes de saber que pegou -- ficava tudo em silêncio se ninguém respondesse.
  if (tipo === 'assumir' && estado === 'feito') {
    const p = usePlayer.getState();
    if (p.isPlaying) void p.togglePlay();
  }
  return estado;
}

function esperarResposta(pedido: Pedido): Promise<EstadoDoPedido> {
  return new Promise((resolve) => {
    let pronto = false;
    let pararEscuta: () => void = () => {};
    const sondagem = setInterval(() => {
      void verPedido(pedido.id).then((p) => { if (p && p.estado !== 'pendente') terminar(p.estado); }).catch(() => {});
    }, 3_000);
    const prazo = setTimeout(() => terminar('expirado'), VALIDADE_DO_PEDIDO_MS);

    function terminar(estado: EstadoDoPedido) {
      if (pronto) return;
      pronto = true;
      clearInterval(sondagem);
      clearTimeout(prazo);
      pararEscuta();
      resolve(estado);
    }

    pararEscuta = ouvirResposta(pedido.id, (novo) => {
      if (novo.estado !== 'pendente') terminar(novo.estado);
    });
  });
}

/**
 * Os outros aparelhos desta conta, para a lista do "Play on…".
 *
 * Só vai à rede enquanto a lista está ABERTA (`activo`), e volta a ir de
 * dez em dez segundos: um aparelho que acorda entretanto tem de deixar de
 * aparecer apagado sem se ter de fechar e abrir o menu. Fechada, não gasta
 * nada -- é o mesmo cuidado do resto da app.
 */
export function useAparelhos(activo: boolean): {
  aparelhos: AparelhoDisponivel[];
  aCarregar: boolean;
  recarregar: () => void;
} {
  const [sessoes, setSessoes] = useState<RemoteSession[]>([]);
  const [meu, setMeu] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [tique, setTique] = useState(0);

  useEffect(() => { void getDeviceId().then(setMeu); }, []);

  const recarregar = useCallback(() => setTique((n) => n + 1), []);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const ler = () => {
      setACarregar(true);
      void fetchOtherSessions()
        .then((rows) => { if (vivo) setSessoes(rows); })
        .catch(() => { /* sem rede fica a lista que havia */ })
        .finally(() => { if (vivo) setACarregar(false); });
    };
    ler();
    const id = setInterval(() => { if (appEstaVisivel()) ler(); }, 10_000);
    return () => { vivo = false; clearInterval(id); };
  }, [activo, tique]);

  return {
    aparelhos: meu ? aparelhosDisponiveis(sessoes, meu) : [],
    aCarregar,
    recarregar,
  };
}
