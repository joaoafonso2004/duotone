import type React from 'react';

/**
 * As folhas feitas à mão passam a folhas NATIVAS do iOS (auditoria 3.2, 4/10),
 * sem mudar quem as abre.
 *
 * Quem abre uma folha continua a desenhar `<BottomSheet visible onClose>` com o
 * conteúdo lá dentro. No iPhone, o `BottomSheet` guarda aqui esse conteúdo e
 * empurra a rota `Folha` do stack de raiz (`presentation: 'formSheet'`), que o
 * desenha (`screens/FolhaScreen.tsx`). É um portal: o conteúdo é refeito a
 * cada desenho de quem o abriu, e o estado de quem abriu fica onde estava.
 *
 * Fechar tem dois caminhos, e cada um avisa o outro:
 *  - quem abriu põe `visible` a false -> a rota sai (`fecharPeloDono`);
 *  - a pessoa desce a folha -> a rota sai e o ecrã desmonta -> o `onClose` de
 *    quem abriu (`aoSair`), uma vez só.
 */

/** Alturas da folha: `fitToContents` (o conteúdo manda) ou frações do ecrã. */
export type DetentesDaFolha = 'fitToContents' | number[];

export type FolhaAberta = {
  id: string;
  conteudo: React.ReactNode;
  aoFechar: () => void;
  /** O dono pôs `visible` a false: a saída da rota não chama o `aoFechar`. */
  fechadaPeloDono: boolean;
  /** A rota já saiu do stack (pelo gesto ou pelo dono). */
  saiu: boolean;
  /** Avisa o `useNotificationOverlay` quando a saída acabou. */
  aoSairDeVez?: () => void;
};

const folhas = new Map<string, FolhaAberta>();
const ouvintes = new Map<string, Set<() => void>>();
let proximo = 0;

export function novoIdDeFolha(): string {
  proximo += 1;
  return `folha-${proximo}`;
}

export function abrirFolha(f: Omit<FolhaAberta, 'fechadaPeloDono' | 'saiu'>): void {
  folhas.set(f.id, { ...f, fechadaPeloDono: false, saiu: false });
  avisar(f.id);
}

/** Quem abriu desenhou-se outra vez: o conteúdo novo vai para a folha. */
export function atualizarFolha(id: string, conteudo: React.ReactNode, aoFechar: () => void): void {
  const f = folhas.get(id);
  if (!f) return;
  f.conteudo = conteudo;
  f.aoFechar = aoFechar;
  avisar(id);
}

export function folhaAberta(id: string): FolhaAberta | undefined {
  return folhas.get(id);
}

export function ouvirFolha(id: string, fn: () => void): () => void {
  let s = ouvintes.get(id);
  if (!s) { s = new Set(); ouvintes.set(id, s); }
  s.add(fn);
  return () => { s!.delete(fn); if (s!.size === 0) ouvintes.delete(id); };
}

function avisar(id: string) {
  for (const fn of [...(ouvintes.get(id) ?? [])]) fn();
}

/** O dono fechou: a rota vai sair, e não se lhe devolve o `onClose`. */
export function marcarFechadaPeloDono(id: string): void {
  const f = folhas.get(id);
  if (f) f.fechadaPeloDono = true;
}

/**
 * A rota saiu (o ecrã desmontou). Se foi a pessoa a descer a folha, o dono
 * fica a saber pelo `onClose` dele. A saída nativa ainda está a animar:
 * quem esperava por ela (uma notificação a abrir uma conversa) só é avisado
 * depois de `ESPERA_DA_SAIDA_MS`, senão o iOS recusava apresentar o modal
 * seguinte por cima de uma folha a sair.
 */
export const ESPERA_DA_SAIDA_MS = 450;
export function folhaSaiu(id: string): void {
  const f = folhas.get(id);
  if (!f || f.saiu) return;
  f.saiu = true;
  if (!f.fechadaPeloDono) {
    try { f.aoFechar(); } catch { /* fechar não pode partir quem fecha */ }
  }
  const fim = f.aoSairDeVez;
  setTimeout(() => {
    fim?.();
    // Só se esquece se ninguém a abriu de novo com o mesmo id entretanto.
    if (folhas.get(id) === f) folhas.delete(id);
  }, ESPERA_DA_SAIDA_MS);
}
