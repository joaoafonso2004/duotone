import { File, Paths } from 'expo-file-system';

/**
 * Onde a saúde da app guarda o que tem de sobreviver a um crash (iPhone).
 *
 * Síncrono de propósito: quem escreve pode ser o handler de um erro fatal, e
 * depois dele o processo morre -- o AsyncStorage escreveria tarde de mais.
 * Fica em Documents, como o áudio: a pasta de cache pode ser limpa pelo iOS.
 */
export type ChaveDaSaude = 'incidentes' | 'sessao';

function ficheiro(chave: ChaveDaSaude): File {
  return new File(Paths.document, `saude-${chave}.json`);
}

export function lerDaGuarda(chave: ChaveDaSaude): string | null {
  try {
    const f = ficheiro(chave);
    return f.exists ? f.textSync() : null;
  } catch {
    return null;
  }
}

export function escreverNaGuarda(chave: ChaveDaSaude, texto: string): void {
  try {
    ficheiro(chave).write(texto);
  } catch {
    // Sem disco não há registo -- e nunca pode ser isto a partir a app.
  }
}
