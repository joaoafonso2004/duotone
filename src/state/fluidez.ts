import { definirFluidez } from '../../modules/duotone-diagnostico';

/**
 * Os 120 Hz das animações nativas do iPhone (3/10, ver
 * `modules/duotone-diagnostico/ios/DuotoneFluidez.swift`).
 *
 * O React Native anima tudo num relógio que, sem pedir, fica nos 60 Hz. Pedir
 * sempre os 120 fazia as animações que nunca param (a capa a flutuar, a barra
 * a avançar) gastar o dobro, e por isso pede-se só quando se nota: as
 * transições (abrir o leitor, uma folha, a base a mudar), os gestos (o dedo no
 * ecrã) e um toque. Fora disso, o relógio volta ao de sempre.
 *
 * Duas formas:
 *  - `pedirFluidez(ms)`: uma transição com duração conhecida;
 *  - `segurarFluidez()`: enquanto um dedo arrasta; devolve quem larga (e a
 *    mola que vem depois de largar ainda leva uns ms).
 */

let ate = 0;
let segurados = 0;
let alta = false;
let temporizador: ReturnType<typeof setTimeout> | null = null;

function ligar(): void {
  if (alta) return;
  alta = true;
  definirFluidez(true);
}

function verificar(): void {
  temporizador = null;
  if (segurados > 0) return;
  const falta = ate - Date.now();
  if (falta > 0) { temporizador = setTimeout(verificar, falta); return; }
  if (!alta) return;
  alta = false;
  definirFluidez(false);
}

/** A taxa alta durante `ms` (a duração da transição, com folga). */
export function pedirFluidez(ms = 700): void {
  ate = Math.max(ate, Date.now() + ms);
  ligar();
  if (temporizador == null) temporizador = setTimeout(verificar, ms);
}

/** A taxa alta enquanto um gesto dura. Largar dá ainda `depois` ms (a mola). */
export function segurarFluidez(depois = 700): () => void {
  segurados++;
  ligar();
  let largado = false;
  return () => {
    if (largado) return;
    largado = true;
    segurados = Math.max(0, segurados - 1);
    pedirFluidez(depois);
  };
}

/** Para os testes: o estado de agora. */
export function fluidezAgora(): { alta: boolean; segurados: number } {
  return { alta, segurados };
}
