// Arranque curto do test-renovacao-e-hls.ts, com os duplos já registados.
//
// Existe por causa do tamanho: o `npm test` corre no cmd.exe do Windows (o CI
// da build de Windows), que não aceita linhas acima de 8191 caracteres, e a
// linha estava a 8097. `node --experimental-strip-types --import
// ./scripts/registar-duplos.mjs scripts/...ts` passava-a do limite.
import './registar-duplos.mjs';

await import('./test-renovacao-e-hls.ts');
