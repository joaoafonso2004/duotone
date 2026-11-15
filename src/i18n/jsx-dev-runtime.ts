/** iPhone em desenvolvimento: o mesmo que `jsx-runtime.ts`, para o runtime de dev. */
import * as Real from 'react/jsx-dev-runtime';
import { traduzirProps } from './jsx-runtime';

export const Fragment = Real.Fragment;

export function jsxDEV(tipo: any, props: any, chave: any, estatico: any, origem: any, quem: any) {
  return (Real as any).jsxDEV(tipo, traduzirProps(tipo, props), chave, estatico, origem, quem);
}
