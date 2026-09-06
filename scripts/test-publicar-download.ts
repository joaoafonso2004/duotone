// Publicar o áudio descarregado.
//
// O primeiro teste é a regressão da v1.11.0: o download corria até ao fim e o
// ficheiro desaparecia, porque a limpeza do temporário olhava para
// `parcial.exists` DEPOIS de um moveSync que faz o objecto apontar para o
// destino. A app dizia só "failed to load the player item".
import assert from 'node:assert/strict';
import {
  AUDIO_INCOMPLETO, publicarAudio, type FicheiroLocal,
} from '../src/lib/publicarDownload.ts';

const ABORTADO = 'download aborted';

/** Um sistema de ficheiros de mentira, com a mesma manha do verdadeiro. */
function disco() {
  const ficheiros = new Map<string, number>();
  const criar = (uri: string): FicheiroLocal => {
    let meu = uri;
    return {
      get uri() { return meu; },
      get exists() { return ficheiros.has(meu); },
      get size() { return ficheiros.get(meu) ?? null; },
      create() { ficheiros.set(meu, 0); },
      write(dados) { ficheiros.set(meu, dados.length); },
      moveSync(destino) {
        const bytes = ficheiros.get(meu) ?? 0;
        ficheiros.delete(meu);
        ficheiros.set(destino.uri, bytes);
        // A manha: depois de mover, o objecto passa a apontar para o destino.
        meu = destino.uri;
      },
      delete() { ficheiros.delete(meu); },
    };
  };
  return { ficheiros, criar };
}

let falhas = 0;
function verificar(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHOU - ${nome}: ${(e as Error).message}`); }
}

const dados = new Uint8Array(1000);

console.log('Publicar o download:');

verificar('o ficheiro publicado NÃO é apagado a seguir', () => {
  const d = disco();
  const uri = publicarAudio({
    parcial: d.criar('/tmp/a.part'), destino: d.criar('/audio/a.m4a'),
    dados, total: 1000, erroDeAborto: ABORTADO,
  });
  assert.equal(uri, '/audio/a.m4a');
  assert.equal(d.ficheiros.get('/audio/a.m4a'), 1000, 'o ficheiro descarregado desapareceu');
  assert.equal(d.ficheiros.has('/tmp/a.part'), false, 'o temporário ficou para trás');
});

verificar('uma gravação incompleta não é publicada', () => {
  const d = disco();
  const parcial = d.criar('/tmp/b.part');
  // Escreve menos do que o prometido.
  assert.throws(
    () => publicarAudio({
      parcial, destino: d.criar('/audio/b.m4a'),
      dados, total: 2000, erroDeAborto: ABORTADO,
    }),
    new RegExp(AUDIO_INCOMPLETO),
  );
  assert.equal(d.ficheiros.has('/audio/b.m4a'), false, 'publicou um ficheiro truncado');
  assert.equal(d.ficheiros.has('/tmp/b.part'), false, 'deixou o temporário para trás');
});

verificar('um download abortado não é publicado', () => {
  const d = disco();
  assert.throws(
    () => publicarAudio({
      parcial: d.criar('/tmp/c.part'), destino: d.criar('/audio/c.m4a'),
      dados, total: 1000, abortado: () => true, erroDeAborto: ABORTADO,
    }),
    new RegExp(ABORTADO),
  );
  assert.equal(d.ficheiros.has('/audio/c.m4a'), false);
  assert.equal(d.ficheiros.has('/tmp/c.part'), false);
});

verificar('se outro job chegou primeiro, o que lá está fica', () => {
  const d = disco();
  d.ficheiros.set('/audio/d.m4a', 4321);
  const uri = publicarAudio({
    parcial: d.criar('/tmp/d.part'), destino: d.criar('/audio/d.m4a'),
    dados, total: 1000, erroDeAborto: ABORTADO,
  });
  assert.equal(uri, '/audio/d.m4a');
  assert.equal(d.ficheiros.get('/audio/d.m4a'), 4321, 'sobrepôs-se a um ficheiro que já existia');
  assert.equal(d.ficheiros.has('/tmp/d.part'), false, 'não limpou o temporário');
});

verificar('uma falha a apagar o temporário não estraga a publicação', () => {
  const d = disco();
  const parcial = d.criar('/tmp/e.part');
  const teimoso: FicheiroLocal = { ...parcial, delete() { throw new Error('em uso'); },
    get uri() { return parcial.uri; }, get exists() { return parcial.exists; },
    get size() { return parcial.size; }, create: () => parcial.create(),
    write: (x) => parcial.write(x), moveSync: (x) => parcial.moveSync(x) };
  assert.throws(() => publicarAudio({
    parcial: teimoso, destino: d.criar('/audio/e.m4a'),
    dados, total: 9999, erroDeAborto: ABORTADO,
  }), new RegExp(AUDIO_INCOMPLETO), 'o erro do delete tapou o erro verdadeiro');
});

if (falhas > 0) { console.error(`\n${falhas} teste(s) falharam`); process.exit(1); }
console.log('\nPublicar o download: todos os casos passaram.');
