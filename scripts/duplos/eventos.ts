import { controlo } from './controlo.ts';

/** Analytics não é efeito observado pela fila/Jam; fica guardado para os casos que medem. */
export const registar = (nome: string, dados: Record<string, unknown> = {}) => {
  controlo.eventos.push({ nome, dados });
};
