/**
 * Como o `registar-resolver.mjs`, mas a pedir também os duplos.
 *
 * Fica à parte para os testes que já existem continuarem a importar os módulos
 * verdadeiros: quem quer a `store` a correr em Node usa este, os outros usam o
 * outro, e ninguém muda de comportamento sem o pedir.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./resolver-ts.mjs', pathToFileURL(import.meta.filename), {
  data: { duplos: true },
});
