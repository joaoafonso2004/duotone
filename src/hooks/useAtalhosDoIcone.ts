import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ouvirAtalhosDoIcone } from '../../modules/duotone-atalhos';
import { executarAtalhoDoIcone } from '../state/atalhosDoIcone';
import { avisarInfo } from '../lib/avisoDeRemocao';

/**
 * Executa os atalhos do ícone (lib/atalhosDoIcone.ts). Só com conta: os três
 * precisam dela. Uma app aberta por um atalho chega aqui antes de a sessão do
 * leitor estar lida do disco, por isso o "Resume" espera por ela
 * (`state/atalhosDoIcone.ts`, partilhado com a lista de saltos do Windows).
 */
export function useAtalhosDoIcone(userId: string | null): void {
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    return ouvirAtalhosDoIcone((tipo) => {
      void executarAtalhoDoIcone(tipo, (titulo, detalhe) => { avisarInfo(titulo, detalhe); }).catch(() => {});
    });
  }, [userId]);
}
