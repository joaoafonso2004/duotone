/**
 * Deixa o Node seguir os imports relativos do `src/` tal como estão escritos,
 * e -- quando lhe pedem -- trocar por duplos os módulos que não correm em Node.
 *
 * O código da app escreve `./trackMatch` sem extensão, porque é o bundler que
 * a acrescenta. O Node não: exige o caminho exacto, e um teste que importe um
 * módulo com imports de valor rebenta logo a resolver. Era por isso que o
 * `test-spotify-import.ts` estava fora da suite -- existia, nunca corria, e a
 * importação do Spotify partiu-se sem nada acusar.
 *
 * Isto é só para os testes. No empacotamento nada disto entra.
 *
 * ---------------------------------------------------------------------------
 * OS DUPLOS
 *
 * O `src/state/player.ts` -- onde vivem a fila, o shuffle e a passagem entre
 * faixas -- não corre em Node por causa de treze imports, e todos são folhas:
 * armazenamento, um módulo nativo, e chamadas ao Supabase e ao YouTube. O
 * `zustand` em si é JavaScript puro e corre lá sem queixas.
 *
 * Trocadas essas treze folhas por duplos, a loja passa a poder ser EXECUTADA
 * dentro de um teste -- que é o que faltava. Os bugs que ela teve não eram
 * contas erradas, eram sequências: quem lê o quê, e quando. Nenhuma função
 * pura os podia apanhar. Ver scripts/test-player-store.ts.
 *
 * A troca só acontece para quem a pedir -- pelo `registar-duplos.mjs` em vez do
 * `registar-resolver.mjs` -- para nenhum dos testes que já existem mudar de
 * comportamento por causa disto. O pedido viaja pelo `data` do `register`, e
 * não por uma variável de ambiente: as hooks correm noutra thread, e um
 * `VAR=1 node ...` à frente do comando não funciona no `cmd.exe` que o npm usa
 * no Windows -- onde o CI da build corre.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolverCaminho } from 'node:path';

let trocarPorDuplos = false;

/** O `register` chama isto com o que lhe passarem em `data`. */
export function initialize(dados) {
  trocarPorDuplos = !!(dados && dados.duplos);
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const duplo = (ficheiro) => pathToFileURL(resolverCaminho(AQUI, 'duplos', ficheiro)).href;

/** Módulos do projeto, pela cauda do caminho e sem extensão. */
const DUPLOS = new Map([
  ['src/state/lyrics', 'lyrics.ts'],
  ['src/state/connectivity', 'connectivity.ts'],
  ['src/state/recommendationFeedback', 'recommendationFeedback.ts'],
  ['src/state/trackAdjustments', 'trackAdjustments.ts'],
  ['src/state/auth', 'auth.ts'],
  ['src/state/discoveryControl', 'discoveryControl.ts'],
  ['src/api/plays', 'plays.ts'],
  ['src/api/radio', 'radio.ts'],
  ['src/api/descoberta', 'descoberta.ts'],
  ['src/lib/playCounts', 'playCounts.ts'],
  ['src/lib/prefs', 'prefs.ts'],
  ['src/lib/playbackAlternatives', 'playbackAlternatives.ts'],
  ['src/lib/eventos', 'eventos.ts'],
  ['modules/duotone-audio', 'duotone-audio.ts'],
]);

/** Pacotes, pelo nome exacto. */
const PACOTES = new Map([
  ['@react-native-async-storage/async-storage', 'async-storage.ts'],
]);

/**
 * A cauda do caminho, sem extensão e sem `/index`, para o mapa acima poder ser
 * escrito como se lê num `import` -- `src/api/plays`, e não um caminho absoluto
 * que muda de máquina para máquina.
 */
function chaveDoCaminho(url) {
  let p;
  try {
    p = new URL(url).pathname;
  } catch {
    return null;
  }
  p = p.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, '');
  for (const k of DUPLOS.keys()) {
    if (p.endsWith('/' + k)) return k;
  }
  return null;
}

export async function resolve(especificador, contexto, seguinte) {
  if (trocarPorDuplos) {
    const pacote = PACOTES.get(especificador);
    if (pacote) return { url: duplo(pacote), shortCircuit: true };

    if (especificador.startsWith('.') && contexto.parentURL) {
      // Junta-se o especificador ao pai em vez de resolver o módulo verdadeiro
      // para o deitar fora a seguir: assim o duplo continua a servir mesmo que
      // o original nem chegasse a resolver em Node.
      const k = chaveDoCaminho(new URL(especificador, contexto.parentURL).href);
      if (k) return { url: duplo(DUPLOS.get(k)), shortCircuit: true };
    }
  }

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
