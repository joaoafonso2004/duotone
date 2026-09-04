/**
 * Liga o `resolver-ts.mjs` antes de o teste arrancar.
 *
 * Fica num ficheiro à parte porque o `--experimental-loader` está marcado
 * para desaparecer; esta é a forma que o Node recomenda e que fica de pé.
 * Usa-se como `node --experimental-strip-types --import ./scripts/registar-resolver.mjs <teste>`.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./resolver-ts.mjs', pathToFileURL(import.meta.filename));
