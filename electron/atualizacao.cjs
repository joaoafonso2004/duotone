'use strict';
/**
 * Atualizar o Duotone no Windows com um botão, em vez de ir ao site buscar o
 * instalador (pedido a 14/9).
 *
 * Tudo o que decide DE ONDE e O QUÊ vive aqui e no processo principal: o
 * renderer só pode pedir "instala a versão nova". O `versions.json` é lido
 * deste lado, e o instalador só é aceite se vier dos releases do próprio
 * repositório, com o tamanho anunciado -- senão o botão era uma porta para
 * descarregar e correr um .exe qualquer.
 *
 * Porque é que a instalação silenciosa serve: o instalador do electron-builder
 * (assisted, `oneClick: false`) lê do registo o modo e a pasta da instalação
 * anterior (`initMultiUser` em templates/nsis/assistedInstaller.nsh), por isso
 * `/S --updated` instala por cima no mesmo sítio, e `--force-run` reabre a app
 * no fim (installSection.nsh). Numa instalação "para todos" a pasta é de
 * administrador, e aí pede-se elevação (UAC).
 *
 * Sem `require('electron')`: o `fetch` e o `fs` entram por parâmetro, e é isso
 * que deixa testar isto em Node puro (scripts/test-atualizacao-windows.mjs).
 */
const path = require('node:path');

const VERSOES_URL = 'https://joaoafonso.vercel.app/ota/versions.json';
const CAMINHO_DOS_INSTALADORES = '/joaoafonso2004/duotone/releases/download/';

function compararVersoes(a, b) {
  const partes = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const x = partes(a), y = partes(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * O instalador a descarregar, ou null. Null quando não há versão MAIS NOVA, ou
 * quando o que o versions.json diz não passa no crivo -- aí não se instala nada.
 */
function escolherInstalador(versoes, versaoAtual) {
  const windows = versoes && versoes.apps && versoes.apps.duotone && versoes.apps.duotone.windows;
  if (!windows || typeof windows.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(windows.version)) return null;
  if (compararVersoes(windows.version, versaoAtual) <= 0) return null;
  const asset = windows.asset;
  if (!asset || typeof asset.url !== 'string') return null;
  let url;
  try { url = new URL(asset.url); } catch { return null; }
  // O `URL` já resolveu os `..`: o caminho que se compara é o verdadeiro.
  if (url.protocol !== 'https:' || url.hostname !== 'github.com'
    || !url.pathname.startsWith(CAMINHO_DOS_INSTALADORES) || !/\.exe$/i.test(url.pathname)) return null;
  const tamanho = Number(asset.size);
  if (!Number.isInteger(tamanho) || tamanho < 1_000_000 || tamanho > 2_000_000_000) return null;
  return { versao: windows.version, url: url.href, tamanho };
}

/**
 * Descarrega para `destino`, com progresso de 0 a 1. Escreve primeiro num
 * `.parcial` e só o renomeia com o tamanho CERTO: um instalador cortado a meio
 * nunca chega a ter o nome que se vai correr.
 */
async function descarregar({ fetch, url, destino, tamanho, fs, aoProgresso = () => {} }) {
  const resposta = await fetch(url);
  if (!resposta.ok || !resposta.body) throw new Error(`HTTP ${resposta.status}`);
  const parcial = `${destino}.parcial`;
  const ficheiro = fs.createWriteStream(parcial);
  let recebidos = 0;
  let ultimoPasso = -1;
  try {
    const leitor = resposta.body.getReader();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      recebidos += value.byteLength;
      if (recebidos > tamanho) throw new Error('Maior do que o anunciado.');
      if (!ficheiro.write(Buffer.from(value))) await new Promise((r) => ficheiro.once('drain', r));
      const passo = Math.floor((recebidos / tamanho) * 100);
      if (passo !== ultimoPasso) { ultimoPasso = passo; aoProgresso(recebidos / tamanho); }
    }
    await new Promise((resolve, reject) => { ficheiro.once('error', reject); ficheiro.end(resolve); });
    if (recebidos !== tamanho) throw new Error('Tamanho diferente do anunciado.');
    fs.renameSync(parcial, destino);
    return destino;
  } catch (erro) {
    ficheiro.destroy();
    try { fs.rmSync(parcial, { force: true }); } catch { /* já não existe */ }
    throw erro;
  }
}

/**
 * Se a pasta da app aceita escrita SEM elevação. Testa-se escrevendo: no
 * Windows o `accessSync` só olha para o atributo de só-leitura, e diz que
 * sim ao Program Files.
 */
function podeEscreverEm(fs, pasta) {
  const teste = path.join(pasta, `.duotone-escrita-${process.pid}`);
  try {
    fs.writeFileSync(teste, '');
    fs.rmSync(teste, { force: true });
    return true;
  } catch {
    return false;
  }
}

const aspas = (texto) => `'${String(texto).replace(/'/g, "''")}'`;

/**
 * O que corre depois de a app fechar: espera um instante, corre o instalador em
 * silêncio e espera por ele. O instalador reabre a app (`--force-run`); se ele
 * nem chegar a correr (UAC recusado) ou falhar, reabre-se a app como estava --
 * ninguém fica sem Duotone por ter carregado num botão.
 *
 * Vai em `-EncodedCommand` para nenhum caminho com aspas ou espaços partir a
 * linha de comandos.
 */
function comandoDoInstalador({ instalador, executavel, elevar }) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Start-Sleep -Milliseconds 1500',
    'try {',
    `  $p = Start-Process -FilePath ${aspas(instalador)} -ArgumentList '/S','--updated','--force-run'${elevar ? ' -Verb RunAs' : ''} -Wait -PassThru`,
    `  if ($p.ExitCode -ne 0) { Start-Process -FilePath ${aspas(executavel)} }`,
    '} catch {',
    `  Start-Process -FilePath ${aspas(executavel)}`,
    '}',
  ].join('\n');
  return {
    ficheiro: 'powershell.exe',
    argumentos: [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
    ],
  };
}

module.exports = {
  VERSOES_URL,
  compararVersoes,
  escolherInstalador,
  descarregar,
  podeEscreverEm,
  comandoDoInstalador,
};
