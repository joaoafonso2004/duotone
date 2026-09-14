import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const a = require('../electron/atualizacao.cjs');

// ---------------------------------------------------------------- a versão --
const versoes = (windows) => ({ apps: { duotone: { windows } } });
const url = 'https://github.com/joaoafonso2004/duotone/releases/download/win-v3.3.0/Duotone-Setup.exe';
const bom = { version: '3.3.0', asset: { url, size: 115820376 } };
const comAsset = (asset) => versoes({ ...bom, asset: { ...bom.asset, ...asset } });

assert.deepEqual(a.escolherInstalador(versoes(bom), '3.2.0'), { versao: '3.3.0', url, tamanho: 115820376 });
assert.equal(a.escolherInstalador(versoes(bom), '3.3.0'), null, 'A mesma versão não se reinstala');
assert.equal(a.escolherInstalador(versoes(bom), '3.4.0'), null, 'Uma versão mais antiga não se instala');
assert.equal(a.compararVersoes('3.10.0', '3.9.9') > 0, true, 'As versões comparam-se por números, não por texto');
assert.equal(a.escolherInstalador(versoes(bom), '3.10.0'), null);

// ------------------------------------------------ de onde vem o instalador --
// O versions.json é de outro site: se ele mentir, o botão não pode correr um .exe qualquer.
assert.equal(a.escolherInstalador(comAsset({ url: 'https://evil.test/Duotone-Setup.exe' }), '3.2.0'), null, 'Outro servidor não');
assert.equal(a.escolherInstalador(comAsset({ url: url.replace('https:', 'http:') }), '3.2.0'), null, 'Sem HTTPS não');
assert.equal(a.escolherInstalador(comAsset({ url: 'https://github.com/outra-pessoa/duotone/releases/download/v1/Duotone-Setup.exe' }), '3.2.0'), null, 'Outro repositório não');
assert.equal(a.escolherInstalador(comAsset({ url: 'https://github.com/joaoafonso2004/duotone/releases/download/../../../outra/x.exe' }), '3.2.0'), null, 'Um caminho com .. não sai do repositório');
assert.equal(a.escolherInstalador(comAsset({ url: url.replace('.exe', '.zip') }), '3.2.0'), null, 'Só um .exe');
assert.equal(a.escolherInstalador(comAsset({ size: undefined }), '3.2.0'), null, 'Sem tamanho não se pode confirmar o download');
assert.equal(a.escolherInstalador(comAsset({ size: 12 }), '3.2.0'), null, 'Um tamanho absurdo não');
assert.equal(a.escolherInstalador(versoes({ ...bom, version: '3.3' }), '3.2.0'), null, 'Uma versão mal escrita não');
assert.equal(a.escolherInstalador(null, '3.2.0'), null);

// ---------------------------------------------------------------- o comando --
const decifrar = (comando) => Buffer.from(comando.argumentos.at(-1), 'base64').toString('utf16le');
const semAdmin = decifrar(a.comandoDoInstalador({
  instalador: 'C:\\Temp\\Duotone-Setup-3.3.0.exe', executavel: "C:\\Users\\O'Brien\\Duotone\\Duotone.exe", elevar: false,
}));
assert.match(semAdmin, /-ArgumentList '\/S','--updated','--force-run'/, 'Silencioso, como atualização, e reabre no fim');
assert.doesNotMatch(semAdmin, /RunAs/, 'Uma instalação só para o utilizador não pede administrador');
assert.match(semAdmin, /O''Brien/, 'Uma aspa num caminho não parte o comando');
assert.match(semAdmin, /catch \{\s+Start-Process -FilePath 'C:\\Users/, 'Se o instalador nem correr, a app volta a abrir');
const comAdmin = decifrar(a.comandoDoInstalador({ instalador: 'C:\\x.exe', executavel: 'C:\\y.exe', elevar: true }));
assert.match(comAdmin, /-Verb RunAs/, 'Uma instalação para todos pede administrador');

// ---------------------------------------------------------------- o download --
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'duotone-atualizacao-'));
try {
  const bytes = new Uint8Array(3_000_000).fill(7);
  const progresso = [];
  const destino = path.join(pasta, 'Duotone-Setup.exe');
  await a.descarregar({
    fetch: async () => new Response(new Blob([bytes]).stream()),
    url, destino, tamanho: bytes.length, fs, aoProgresso: (p) => progresso.push(p),
  });
  assert.equal(fs.statSync(destino).size, bytes.length);
  assert.equal(progresso.at(-1), 1, 'O progresso acaba em 100%');
  assert.ok(progresso.length <= 101, 'O progresso vai de ponto em ponto percentual, não a cada bocado');

  const curto = path.join(pasta, 'curto.exe');
  await assert.rejects(a.descarregar({
    fetch: async () => new Response(new Blob([bytes.slice(0, 10)]).stream()),
    url, destino: curto, tamanho: bytes.length, fs,
  }), /Tamanho diferente/);
  assert.equal(fs.existsSync(curto), false, 'Um instalador cortado nunca fica com o nome que se corre');
  assert.equal(fs.existsSync(`${curto}.parcial`), false, 'E o parcial é apagado');

  await assert.rejects(a.descarregar({
    fetch: async () => new Response(new Blob([bytes, bytes]).stream()),
    url, destino: path.join(pasta, 'grande.exe'), tamanho: bytes.length, fs,
  }), /Maior do que o anunciado/);
  await assert.rejects(a.descarregar({
    fetch: async () => new Response('nao existe', { status: 404 }),
    url, destino: path.join(pasta, '404.exe'), tamanho: bytes.length, fs,
  }), /HTTP 404/);

  assert.equal(a.podeEscreverEm(fs, pasta), true);
  assert.equal(a.podeEscreverEm(fs, path.join(pasta, 'nao-existe')), false);
} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}

console.log('Atualização do Windows: versão, origem do instalador, comando, download e tamanho verificados.');
