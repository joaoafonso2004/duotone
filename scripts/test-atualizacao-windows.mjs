import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
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
assert.equal(a.escolherInstalador(comAsset({ url: url.replace('win-v3.3.0', 'win-v3.2.0') }), '3.2.0'), null, 'A tag do instalador tem de ser a versão anunciada');
assert.equal(a.escolherInstalador(comAsset({ url: url.replace('Duotone-Setup.exe', 'outro.exe') }), '3.2.0'), null, 'Só corre o instalador publicado pelo workflow');
assert.equal(a.escolherInstalador(comAsset({ size: undefined }), '3.2.0'), null, 'Sem tamanho não se pode confirmar o download');
assert.equal(a.escolherInstalador(comAsset({ size: 12 }), '3.2.0'), null, 'Um tamanho absurdo não');
assert.equal(a.escolherInstalador(versoes({ ...bom, version: '3.3' }), '3.2.0'), null, 'Uma versão mal escrita não');
assert.equal(a.escolherInstalador(null, '3.2.0'), null);

// -------------------------------------------------------- lançar o instalador --
// O PowerShell intermédio chegou a fechar a app mas não arrancou o NSIS no PC
// real. O instalador do electron-builder já trata de fechar, elevar e reabrir.
const chamadas = [];
const processo = new EventEmitter();
let desligado = false;
processo.unref = () => { desligado = true; };
const lancamento = a.lancarInstalador({
  instalador: 'C:\\Temp\\Duotone-Setup-3.3.0.exe',
  spawn: (...args) => {
    chamadas.push(args);
    queueMicrotask(() => processo.emit('spawn'));
    return processo;
  },
});
await lancamento;
assert.deepEqual(chamadas[0][0], 'C:\\Temp\\Duotone-Setup-3.3.0.exe', 'Corre o instalador diretamente');
assert.deepEqual(chamadas[0][1], ['/S', '--updated', '--force-run'], 'Silencioso, como atualização, e o NSIS reabre no fim');
assert.deepEqual(chamadas[0][2], { detached: true, stdio: 'ignore', windowsHide: true });
assert.equal(desligado, true, 'O instalador sobrevive ao fecho da app');

const processoFalhado = new EventEmitter();
processoFalhado.unref = () => {};
await assert.rejects(a.lancarInstalador({
  instalador: 'C:\\nao-existe.exe',
  spawn: () => {
    queueMicrotask(() => processoFalhado.emit('error', new Error('não abriu')));
    return processoFalhado;
  },
}), /não abriu/, 'Se o Windows nem criar o instalador, a app não se fecha');

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

  const preso = path.join(pasta, 'preso.exe');
  await assert.rejects(a.descarregar({
    fetch: async () => new Promise(() => {}),
    url, destino: preso, tamanho: bytes.length, fs, timeoutSemDadosMs: 20,
  }), /tempo/i, 'Um servidor que nunca responde liberta o botão');
  assert.equal(fs.existsSync(`${preso}.parcial`), false, 'A espera presa não deixa um parcial');

  const parado = path.join(pasta, 'parado.exe');
  await assert.rejects(a.descarregar({
    fetch: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(bytes.slice(0, 10)); }
    })),
    url, destino: parado, tamanho: bytes.length, fs, timeoutSemDadosMs: 20,
  }), /tempo/i, 'Um download que para a meio também liberta o botão');
  assert.equal(fs.existsSync(`${parado}.parcial`), false, 'O download parado apaga o parcial');

  // Se uma instalação falhou depois de descarregar, uma nova tentativa da
  // mesma versão substitui o ficheiro antigo em vez de falhar no rename.
  const repetido = path.join(pasta, 'repetido.exe');
  fs.writeFileSync(repetido, Buffer.from('antigo'));
  await a.descarregar({
    fetch: async () => new Response(new Blob([bytes]).stream()),
    url, destino: repetido, tamanho: bytes.length, fs,
  });
  assert.equal(fs.statSync(repetido).size, bytes.length, 'Uma nova tentativa substitui o instalador anterior');

} finally {
  fs.rmSync(pasta, { recursive: true, force: true });
}

// O botão das Definições tem de ler a entrada Windows do mesmo versions.json
// que o aviso automático. `/releases/latest` mistura tags `ios-v*` e `win-v*`.
const settings = fs.readFileSync(new URL('../src/desktop/paginas/SettingsPage.web.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(settings, /repos\/joaoafonso2004\/duotone\/releases\/latest/, 'As Definições não confundem a última release de iOS com a de Windows');
assert.match(settings, /checkForUpdate/, 'As Definições usam a fonte de versões por plataforma');

// Atualizar sem perguntar (27/9): o que fazer, ao abrir, com o que ficou
// descarregado em segundo plano.
const pend = (extra = {}) => ({ versao: '3.9.0', caminho: 'C:/x/Duotone-Setup-3.9.0.exe', tamanho: 115820376, tentativas: 0, ...extra });
assert.equal(a.decidirAoAbrir(null, '3.8.9', -1), 'nada', 'Sem nada pendente, abre normalmente');
assert.equal(a.decidirAoAbrir(pend(), '3.8.9', 115820376), 'instalar', 'Uma versão mais nova e inteira instala antes de abrir');
assert.equal(a.decidirAoAbrir(pend(), '3.9.0', 115820376), 'limpar', 'Já instalada: apaga-se o que ficou');
assert.equal(a.decidirAoAbrir(pend(), '3.8.9', 1234), 'limpar', 'Um ficheiro cortado nunca corre');
assert.equal(a.decidirAoAbrir(pend({ tentativas: 1 }), '3.8.9', 115820376), 'instalar', 'Uma falha ainda tenta outra vez');
assert.equal(a.decidirAoAbrir(pend({ tentativas: a.TENTATIVAS_DE_INSTALACAO }), '3.8.9', 115820376), 'desistir',
  'Depois de duas tentativas desiste: um instalador que falhe não pode impedir a app de abrir');
assert.equal(a.decidirAoAbrir({ versao: '3.9.0', desistiu: true }, '3.8.9', -1), 'nada');
const alvo = { versao: '3.9.0', url, tamanho: 115820376 };
assert.equal(a.precisaDeDescarregar(alvo, null, -1), true);
assert.equal(a.precisaDeDescarregar(alvo, pend(), 115820376), false, 'Já descarregada e inteira: não se volta a descarregar');
assert.equal(a.precisaDeDescarregar(alvo, pend(), 10), true, 'Cortada: descarrega outra vez');
assert.equal(a.precisaDeDescarregar(alvo, { versao: '3.9.0', desistiu: true }, -1), false, 'Da versão desistida não se volta a descarregar');
assert.equal(a.precisaDeDescarregar({ ...alvo, versao: '3.9.1' }, { versao: '3.9.0', desistiu: true }, -1), true, 'Uma versão mais nova volta a tentar');
assert.equal(a.precisaDeDescarregar(null, null, -1), false);

// O processo principal usa as duas regras e já não mostra o aviso no Windows.
const main = fs.readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
assert.match(main, /decidirAoAbrir\(/, 'o main.cjs não instala o que ficou pendente');
assert.match(main, /precisaDeDescarregar\(/, 'o main.cjs não descarrega em segundo plano');
const aviso = fs.readFileSync(new URL('../src/components/UpdateSheet.tsx', import.meta.url), 'utf8');
assert.match(aviso, /atualizacaoAutomatica/, 'o aviso de versão não sabe que no Windows a atualização é automática');

// Relógio virtual: as atualizações chegam sem abrir as Definições, mesmo
// quando a app arrancou sem rede ou a versão saiu depois da primeira procura.
function relogioDaProcura(procurar) {
  let agora = 0;
  let id = 0;
  const tarefas = new Map();
  const fila = a.criarProcuraAutomatica({
    procurar, agora: () => agora,
    agendar: (fn, atraso) => { const chave = ++id; tarefas.set(chave, { fn, em: agora + atraso }); return chave; },
    cancelar: (chave) => tarefas.delete(chave),
  });
  const assentar = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return {
    fila, tarefas, assentar,
    async andar(ms) {
      const fim = agora + ms;
      for (;;) {
        const proxima = [...tarefas].sort((a, b) => a[1].em - b[1].em)[0];
        if (!proxima || proxima[1].em > fim) break;
        agora = proxima[1].em;
        tarefas.delete(proxima[0]);
        proxima[1].fn();
        await assentar();
      }
      agora = fim;
      await assentar();
    },
  };
}

{
  let chamadas = 0;
  let publicada = false;
  let pronta = false;
  const r = relogioDaProcura(async () => {
    chamadas++;
    if (publicada) pronta = true;
    return { estado: publicada ? 'pronta' : 'atual' };
  });
  r.fila.iniciar();
  r.fila.iniciar();
  await r.andar(4_999);
  assert.equal(chamadas, 0, 'O arranque da janela não espera pela rede');
  await r.andar(1);
  assert.equal(chamadas, 1, 'Procura sozinha cinco segundos depois de abrir');
  publicada = true;
  await r.andar(15 * 60_000);
  assert.equal(pronta, true, 'Uma versão publicada depois do arranque chega sem visitar o About');
  assert.equal(chamadas, 2);
  assert.equal(r.tarefas.size, 1, 'Só há um relógio, mesmo com iniciar repetido');
  r.fila.parar();
}

for (const atira of [false, true]) {
  let chamadas = 0;
  const r = relogioDaProcura(async () => {
    chamadas++;
    if (chamadas > 1) return { estado: 'pronta' };
    if (atira) throw Error('sem rede');
    return { estado: 'erro' };
  });
  r.fila.iniciar();
  await r.andar(5_000);
  await r.andar(59_999);
  assert.equal(chamadas, 1);
  await r.andar(1);
  assert.equal(chamadas, 2, 'Arrancar sem rede repete ao fim de um minuto, não seis horas');
  r.fila.parar();
}

{
  let chamadas = 0;
  const r = relogioDaProcura(async () => { chamadas++; return { estado: 'atual' }; });
  r.fila.iniciar();
  await r.andar(5_000);
  r.fila.retomar();
  await r.andar(60_000);
  assert.equal(chamadas, 1, 'Foco logo após a procura não repete pedidos');
  r.fila.retomar();
  await r.andar(500);
  r.fila.retomar();
  await r.andar(500);
  assert.equal(chamadas, 2, 'Voltar à app/acordar o PC antecipa o relógio; foco repetido não o adia');
  await r.fila.verificar();
  assert.equal(chamadas, 3, 'O botão manual continua a verificar imediatamente');
  assert.equal(r.tarefas.size, 1, 'A procura manual também substitui o relógio anterior');
  r.fila.parar();
  await r.andar(24 * 60 * 60_000);
  assert.equal(chamadas, 3, 'Fechar a app cancela o relógio');
}

{
  let concluir;
  let chamadas = 0;
  const r = relogioDaProcura(() => { chamadas++; return new Promise((resolve) => { concluir = resolve; }); });
  r.fila.iniciar();
  await r.andar(5_000);
  await r.andar(120_000);
  r.fila.retomar();
  const manual = r.fila.verificar();
  assert.equal(manual, r.fila.verificar(), 'Cliques e procura automática partilham o download em curso');
  assert.equal(chamadas, 1);
  r.fila.parar();
  concluir({ estado: 'pronta', versao: '4.0.6' });
  assert.equal((await manual).estado, 'pronta');
  assert.equal(r.tarefas.size, 0, 'Um resultado tardio não rearma a procura depois de sair');
}

console.log('Atualização do Windows: versão, origem, download, instalação e procura automática verificados.');
