import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte para os atalhos do ícone (ver ios/DuotoneAtalhosModule.swift). `null`
 * num binário sem o módulo (anterior à 4.7.0): aí não há atalhos e isto não
 * faz nada.
 */
const nativo = requireOptionalNativeModule<{
  tirarPendente(): string | null;
  addListener(evento: 'onAtalho', fn: (e: { tipo?: unknown } | undefined) => void): { remove(): void };
}>('DuotoneAtalhos');

/**
 * Chama `fn` com o tipo de cada atalho escolhido -- o que chegou antes de o
 * JS ouvir (a app abriu por um atalho) e os seguintes. Devolve o unsubscribe.
 * Ouve-se primeiro e lê-se o pendente depois: assim nenhum se perde entre os dois.
 */
export function ouvirAtalhosDoIcone(fn: (tipo: string) => void): () => void {
  if (!nativo) return () => {};
  const sub = nativo.addListener('onAtalho', (e) => { if (typeof e?.tipo === 'string') fn(e.tipo); });
  try {
    const pendente = nativo.tirarPendente();
    if (pendente) fn(pendente);
  } catch { /* sem pendente */ }
  return () => sub.remove();
}
