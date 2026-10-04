import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';
import { useTheme } from '../state/theme';
import { pedirFluidez } from '../state/fluidez';

/**
 * Puxar para atualizar (auditoria 1.8, 4/10), na Home, nas Playlists e no
 * Social do iPhone.
 *
 * O cabeçalho que encolhe FLUTUA por cima da lista (a lista começa com um
 * espaço da altura dele), e o `RefreshControl` do iOS desenha-se no topo do
 * scroll -- por baixo do título. O `progressViewOffset` (que no iOS desloca o
 * desenho dele, ver `RCTPullToRefreshViewComponentView.mm`) põe-no por baixo
 * do cabeçalho, no espaço vazio antes do conteúdo.
 *
 * Fica à vista pelo menos `MINIMO_MS`, para um refrescar instantâneo não
 * piscar, e nunca mais do que `MAXIMO_MS`: uma rede pendurada não pode deixar
 * o spinner preso no topo da lista. No PC não há (o RNW não o desenha, e lá
 * puxar não é um gesto).
 */
const MINIMO_MS = 600;
const MAXIMO_MS = 15_000;

export function usePuxarParaAtualizar(
  atualizar: () => unknown,
  espaco = 0,
): React.ReactElement<React.ComponentProps<typeof RefreshControl>> | undefined {
  const [aAtualizar, setAAtualizar] = useState(false);
  const cor = useTheme((s) => s.destino.color);
  const acao = useRef(atualizar);
  acao.current = atualizar;
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const onRefresh = useCallback(() => {
    setAAtualizar(true);
    pedirFluidez(800);
    const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const trabalho = Promise.resolve().then(() => acao.current()).catch(() => {});
    void Promise.race([Promise.all([trabalho, esperar(MINIMO_MS)]), esperar(MAXIMO_MS)])
      .finally(() => { if (montado.current) setAAtualizar(false); });
  }, []);

  if (Platform.OS !== 'ios') return undefined;
  return (
    <RefreshControl
      refreshing={aAtualizar}
      onRefresh={onRefresh}
      tintColor={cor}
      progressViewOffset={espaco}
    />
  );
}
