/**
 * iPhone: o runtime JSX da app (15/11). O `metro.config.js` manda para aqui os
 * `react/jsx-runtime` do código da app (nunca os do node_modules, nem os desta
 * pasta). Cada elemento passa por `traduzirProps` antes de ser criado:
 *
 *  - o texto de um `<Text>` ou `<Animated.Text>` (filhos que são texto);
 *  - o `placeholder` de um `<TextInput>`;
 *  - `accessibilityLabel`, `accessibilityHint` e `aria-label` de qualquer um.
 *
 * Um componente que recebe `label="Save"` e desenha `<Text>{label}</Text>` é
 * traduzido nesse `<Text>`. Em inglês sai logo: o objeto passa intacto.
 * No PC não corre (lá traduz-se o DOM, `instalar.web.ts`).
 */
import * as Real from 'react/jsx-runtime';
import { traduzir } from './index';
import { idiomaAtual } from './idioma';

type Componentes = { Text: unknown; TextoAnimado: unknown; TextInput: unknown };
let rn: Componentes | null = null;
function componentes(): Componentes {
  // À primeira vez: o react-native também usa o runtime JSX ao carregar.
  if (!rn) {
    const m = require('react-native');
    rn = { Text: m.Text, TextoAnimado: m.Animated?.Text ?? null, TextInput: m.TextInput };
  }
  return rn;
}

function filhos(valor: unknown): unknown {
  if (typeof valor === 'string') return traduzir(valor);
  if (Array.isArray(valor)) {
    let mudou = false;
    const novos = valor.map((v) => {
      if (typeof v !== 'string') return v;
      const t = traduzir(v);
      if (t !== v) mudou = true;
      return t;
    });
    return mudou ? novos : valor;
  }
  return valor;
}

const ACESSIBILIDADE = ['accessibilityLabel', 'accessibilityHint', 'aria-label'] as const;

export function traduzirProps(tipo: unknown, props: any): any {
  if (idiomaAtual() === 'en' || !props || typeof props !== 'object') return props;
  const c = componentes();
  let p = props;
  const trocar = (chave: string, valor: unknown) => {
    if (valor === p[chave]) return;
    if (p === props) p = { ...props };
    p[chave] = valor;
  };
  if ((tipo === c.Text || (c.TextoAnimado && tipo === c.TextoAnimado)) && props.children != null) {
    trocar('children', filhos(props.children));
  }
  if (tipo === c.TextInput && typeof props.placeholder === 'string') trocar('placeholder', traduzir(props.placeholder));
  for (const chave of ACESSIBILIDADE) {
    if (typeof props[chave] === 'string') trocar(chave, traduzir(props[chave]));
  }
  return p;
}

export const Fragment = Real.Fragment;

export function jsx(tipo: any, props: any, chave?: any) {
  return (Real as any).jsx(tipo, traduzirProps(tipo, props), chave);
}

export function jsxs(tipo: any, props: any, chave?: any) {
  return (Real as any).jsxs(tipo, traduzirProps(tipo, props), chave);
}
