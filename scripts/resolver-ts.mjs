/**
 * Deixa o Node seguir os imports relativos do `src/` tal como estão escritos.
 *
 * O código da app escreve `./trackMatch` sem extensão, porque é o bundler que
 * a acrescenta. O Node não: exige o caminho exacto, e um teste que importe um
 * módulo com imports de valor rebenta logo a resolver. Era por isso que o
 * `test-spotify-import.ts` estava fora da suite -- existia, nunca corria, e a
 * importação do Spotify partiu-se sem nada acusar.
 *
 * Isto é só para os testes. No empacotamento nada disto entra.
 */
export async function resolve(especificador, contexto, seguinte) {
  try {
    return await seguinte(especificador, contexto);
  } catch (erro) {
    if (!especificador.startsWith('.') || /\.[cm]?[jt]sx?$/.test(especificador)) throw erro;
    for (const sufixo of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await seguinte(especificador + sufixo, contexto);
      } catch {
        // A próxima extensão que tente; se nenhuma servir, vale o erro original.
      }
    }
    throw erro;
  }
}
