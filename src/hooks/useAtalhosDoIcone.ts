import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { ouvirAtalhosDoIcone } from '../../modules/duotone-atalhos';
import { executarAtalhoDoIcone } from '../state/atalhosDoIcone';
import { acaoDoLink } from '../lib/atalhosDoIcone';
import { avisarInfo } from '../lib/avisoDeRemocao';

/** O link que abriu a app já foi tratado: o hook volta a montar quando a conta muda. */
let linkInicialTratado = false;

/**
 * Executa os atalhos do ícone (lib/atalhosDoIcone.ts). Só com conta: os três
 * precisam dela. Uma app aberta por um atalho chega aqui antes de a sessão do
 * leitor estar lida do disco, por isso o "Resume" espera por ela
 * (`state/atalhosDoIcone.ts`, partilhado com a lista de saltos do Windows).
 *
 * Os botões do ecrã bloqueado e do Centro de Controlo (10/11, iOS 18,
 * `targets/controlos`) chegam por um link `duotone://controlo/<ação>` e fazem o
 * mesmo: com a app fechada é o link que a abriu, com ela aberta é um evento.
 */
export function useAtalhosDoIcone(userId: string | null): void {
  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    const avisar = (titulo: string, detalhe?: string) => { avisarInfo(titulo, detalhe); };
    const executar = (acao: string) => { void executarAtalhoDoIcone(acao, avisar).catch(() => {}); };
    const pararIcone = ouvirAtalhosDoIcone(executar);
    if (!linkInicialTratado) {
      linkInicialTratado = true;
      void Linking.getInitialURL().then((url) => {
        const acao = acaoDoLink(url);
        if (acao) executar(acao);
      }).catch(() => {});
    }
    const link = Linking.addEventListener('url', ({ url }) => {
      const acao = acaoDoLink(url);
      if (acao) executar(acao);
    });
    return () => { pararIcone(); link.remove(); };
  }, [userId]);
}
