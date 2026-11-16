import { File, Paths } from 'expo-file-system';
import { Share } from 'react-native';

/**
 * Guarda um ficheiro da exportação da biblioteca (16/11) no iPhone: escreve-o
 * na cache e abre a folha de partilha com ele (Guardar em Ficheiros, AirDrop,
 * mandar a alguém). É o mesmo gesto do relatório do arranque
 * (lib/partilharRelatorioDoArranque.ts). No PC é uma transferência
 * (guardarExportacao.web.ts).
 */
export async function guardarExportacao(nome: string, conteudo: string, _tipo: string): Promise<void> {
  const ficheiro = new File(Paths.cache, nome);
  if (ficheiro.exists) ficheiro.delete();
  ficheiro.create();
  ficheiro.write(conteudo);
  await Share.share({ url: ficheiro.uri, title: nome });
}
