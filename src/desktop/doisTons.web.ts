import { useSyncExternalStore } from 'react';

/**
 * Se as capas a dois tons estão ligadas (30/10, opção das Definições
 * "Two-tone covers", `pref:doisTons`). **Desligado de origem** (pedido do João):
 * todas as capas se veem a cores, e a dois tons só quem o liga. A casca lê a
 * preferência ao arrancar (`getDoisTons` no `RootNavigator.web.tsx`) e as
 * Definições mudam-na ao vivo, no mesmo processo: por isso é uma pequena store
 * de módulo e não um evento, e `CapaDuotone` assina-a (`useDoisTons`).
 *
 * Desligado, a capa nem monta a camada a cinzentos: uma imagem em vez de duas.
 */
let ligado = false;
const ouvintes = new Set<() => void>();

export function definirDoisTons(v: boolean): void {
  if (v === ligado) return;
  ligado = v;
  ouvintes.forEach((f) => f());
}

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const ler = () => ligado;

export function useDoisTons(): boolean {
  return useSyncExternalStore(assinar, ler, ler);
}
