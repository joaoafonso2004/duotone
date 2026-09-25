import { useEffect } from 'react';
import { getLibrary, getLikedSongs } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { useConnectivity } from '../state/connectivity';
import { usePlaylists } from '../state/playlists';
import { useAbertura } from '../state/abertura';
import { useMisturaDoDia } from '../state/misturaDoDia';

/**
 * As secções carregam no ARRANQUE, e não ao primeiro toque no separador.
 *
 * Antes disto, abrir os Artists (ou as Songs, ou as Playlists) pela primeira
 * vez era ver o esqueleto a girar para mostrar, um segundo depois, uma lista
 * que não mudava há dias. A Pesquisa e o perfil já vinham aquecidos -- as
 * prateleiras vivem fora do ecrã (`state/recomendacoes.ts`) e o perfil tem o
 * `aquecerPerfilProprio` --, e o que faltava era a biblioteca.
 *
 * Aquecer é encher as caches que as páginas já leem, e não montar nada:
 *
 *  - `lib/cacheDaBiblioteca.ts` para as faixas (Songs e Artists nos dois
 *    lados, e a página de artista do PC);
 *  - a store das playlists, que já sabe não mostrar "a carregar" quando tem
 *    alguma coisa na mão.
 *
 * ## Espera que a abertura saia da frente
 *
 * Pela mesma razão do `useAquecerCapas`: a animação do arranque é um WebP que
 * tem de descodificar um fotograma a cada 25 ms, e no iPhone isso disputa o
 * CPU com tudo o que arranque ao lado. Não se perde nada -- ninguém chega a um
 * separador antes de a abertura sair, porque ela tapa o ecrã e engole os
 * toques. Sem abertura (menos movimento, app lançada em segundo plano) o
 * `aFrente` é falso e aquece-se logo.
 *
 * Falhar não diz nada a ninguém: a página tenta outra vez quando abrir, que é
 * o que fazia antes.
 */
export function useAquecerSeccoes(userId: string | undefined): void {
  const offline = useConnectivity((s) => s.offline);
  const naAbertura = useAbertura((s) => s.aFrente);

  useEffect(() => {
    if (!userId || offline || naAbertura) return;
    // As duas listas são pedidos diferentes e não se somam: a alargada traz as
    // faixas das playlists, a outra só as gostadas.
    void lerFaixas(getLibrary).catch(() => {});
    void lerFaixas(getLikedSongs).catch(() => {});
    void usePlaylists.getState().carregar();
    // A Daily mix mora no topo da Pesquisa, nas duas plataformas, e é a lista
    // que se toca sem escolher nada: tem de estar pronta antes de alguém lá
    // chegar. No PC o `guardarEmSegundoPlano` não faz nada (não há downloads).
    void useMisturaDoDia.getState().carregar();
  }, [userId, offline, naAbertura]);
}
