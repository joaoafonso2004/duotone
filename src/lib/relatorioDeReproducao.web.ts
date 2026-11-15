import { APP_VERSION, BUILD_ID } from './buildInfo';
import { relatorio } from './playbackDiagnostics';
import { textoDoTrabalhoDeMetadados } from './trabalhoDeMetadados';
import { textoDoTrabalhoLocal } from './trabalhoLocal';
import { textoDosPedidos } from './pedidosAoYouTube';
import { textoDoSupabase } from './pedidosAoSupabase';
import { textoDosRecursos } from './recursosDaApp';
import { textoDasMigracoes } from './migracoes';
import { verificarMigracoes } from '../api/migracoes';

/**
 * O relatório de reprodução do PC. Vivia dentro das Definições
 * (`exportarRelatorio`); saiu para aqui a 15/11 porque o "Report a problem" o
 * junta ao relato, e os dois têm de mandar o mesmo texto.
 *
 * O detalhe técnico (cliente InnerTube, PO Token, código do embed, HTTP) não
 * vai para a barra do leitor: vive aqui, num ficheiro que se abre, se lê e se
 * cola numa mensagem. Antes ia tudo para `console.warn`, que num executável
 * instalado não é lido por ninguém.
 */

export function plataformaDoRelatorio(): string {
  return `windows (${navigator.userAgent.includes('Electron') ? 'app' : 'browser'})`;
}

export async function textoDoRelatorioDeReproducao(): Promise<string> {
  // Os recursos de cada processo (27/9): demora 2 s, porque o CPU é medido
  // entre duas leituras. Sem ponte (browser) o relatório sai sem eles.
  const [recursos, migracoes] = await Promise.all([
    window.duotoneDesktop?.lerRecursos?.().catch(() => null),
    // Que SQL falta na base (29/9, lib/migracoes.ts).
    verificarMigracoes(),
  ]);
  const secaoDosRecursos = textoDosRecursos(recursos ?? null);
  return relatorio({
    versao: APP_VERSION,
    build: BUILD_ID,
    plataforma: plataformaDoRelatorio(),
    gerado: new Date().toISOString(),
  }) + (secaoDosRecursos ? `\n\n${secaoDosRecursos}\n` : '') + `\n${textoDasMigracoes(migracoes)}\n`
    + `\n${textoDoTrabalhoDeMetadados()}\n`
    + `\n${textoDoTrabalhoLocal()}\n`
    + `\n${textoDosPedidos()}\n`
    + `\n${textoDoSupabase()}\n`;
}

/** "Save playback report": no PC, um ficheiro .txt nas transferências. */
export async function partilharRelatorioDeReproducao(): Promise<void> {
  const texto = await textoDoRelatorioDeReproducao();
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `duotone-reproducao-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar só depois do clique: revogar antes cancela a própria transferência.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
