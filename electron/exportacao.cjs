/**
 * A versão ponte (6.2.0, decidida pelo João a 22/11; secção 8 do plano do Tauri).
 *
 * A Duotone vai passar da casca em Electron para a casca em Tauri, com OUTRO
 * motor de páginas por baixo: o armazenamento da página (a sessão do Supabase e
 * as preferências, no `localStorage` da origem da app) não passa sozinho. Por
 * isso esta versão grava, com a app aberta, o que a casca nova precisa para abrir
 * igual, num ficheiro que ela lê no 1.º arranque:
 *
 *   %APPDATA%\Duotone\migracao\exportacao.json
 *     { versao, app, em, origem, localStorage: [[chave, valor], ...], ficheiros: { nome: json } }
 *
 * - O `localStorage` lê-se DENTRO da página, que é a única que o vê inteiro.
 * - Os 4 JSON da pasta de dados (a janela, o arranque com o Windows, os atalhos e
 *   o mini leitor) vão tal e qual; a casca nova usa os mesmos nomes.
 * - Grava-se num `.parcial` e só depois se troca: um ficheiro a meio nunca passa
 *   por bom. Só se reescreve quando muda (o conteúdo é o mesmo quase sempre).
 * - Quando: com a página pronta, de 15 em 15 min, ao sair, e ANTES de correr
 *   qualquer instalador. Sem uma exportação boa, a atualização não se instala
 *   (`main.cjs`): mais vale esperar do que abrir a app nova vazia.
 *
 * O ficheiro tem a sessão, tal como o perfil do Electron ao lado dele, na mesma
 * pasta do utilizador; nada disto sai do PC.
 *
 * Sem dependências do Electron: `scripts/test-exportacao-ponte.mjs`.
 */

const VERSAO = 1;
const FICHEIROS = ['windows-window.json', 'windows-startup.json', 'atalhos.json', 'mini-leitor.json'];
const PASTA = 'migracao';
const NOME = 'exportacao.json';
const ESPERA_PELA_PAGINA_MS = 5000;

/** Corre na página: todas as chaves e valores do localStorage da origem da app. */
const LER_O_ARMAZENAMENTO = `(() => {
  const s = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null) s.push([k, localStorage.getItem(k) ?? '']);
  }
  return s;
})()`;

const ePar = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string';

/** Uma exportação que a casca nova pode usar: a versão, a origem e pelo menos uma chave. */
function exportacaoValida(e) {
  return !!e && typeof e === 'object' && e.versao === VERSAO
    && typeof e.origem === 'string' && /^http:\/\/localhost:\d+$/.test(e.origem)
    && Number.isFinite(e.em) && Array.isArray(e.localStorage) && e.localStorage.length > 0
    && e.localStorage.every(ePar)
    && !!e.ficheiros && typeof e.ficheiros === 'object' && !Array.isArray(e.ficheiros);
}

/** O que muda de uma exportação para a outra (sem a hora): igual = não se reescreve. */
function assinatura(crypto, entradas, ficheiros) {
  return crypto.createHash('sha1').update(JSON.stringify([entradas, ficheiros])).digest('hex');
}

function caminhos(path, pastaDeDados) {
  const pasta = path.join(pastaDeDados, PASTA);
  return { pasta, ficheiro: path.join(pasta, NOME), parcial: path.join(pasta, `${NOME}.parcial`) };
}

/** A exportação que está no disco, se for boa. */
function lerExportacao({ fs, path, pastaDeDados }) {
  try {
    const e = JSON.parse(fs.readFileSync(caminhos(path, pastaDeDados).ficheiro, 'utf8'));
    return exportacaoValida(e) ? e : null;
  } catch {
    return null;
  }
}

/** Os 4 JSON da pasta de dados que existem e se leem; os outros ficam de fora. */
function lerFicheiros({ fs, path, pastaDeDados }) {
  const fora = {};
  for (const nome of FICHEIROS) {
    try { fora[nome] = JSON.parse(fs.readFileSync(path.join(pastaDeDados, nome), 'utf8')); } catch { /* não existe */ }
  }
  return fora;
}

const comPrazo = (promessa, ms) => new Promise((resolver, rejeitar) => {
  const relogio = setTimeout(() => rejeitar(new Error('a página não respondeu')), ms);
  promessa.then((v) => { clearTimeout(relogio); resolver(v); }, (e) => { clearTimeout(relogio); rejeitar(e); });
});

/**
 * Lê a página e grava a exportação. Devolve `{ ok, escrita, chaves, assinatura }`
 * ou `{ ok: false, erro }`. `ultima`: a assinatura da última que se gravou.
 * `eDaApp(url)`: a página está na origem da app (nunca se lê outra).
 */
async function exportar({ webContents, eDaApp, pastaDeDados, versaoDaApp, fs, path, crypto, ultima = null, agora = Date.now(), esperaMs = ESPERA_PELA_PAGINA_MS }) {
  if (!webContents || webContents.isDestroyed?.()) return { ok: false, erro: 'sem página' };
  const url = webContents.getURL();
  if (!eDaApp(url)) return { ok: false, erro: 'a página não é a da app' };
  let entradas;
  try {
    entradas = await comPrazo(webContents.executeJavaScript(LER_O_ARMAZENAMENTO, true), esperaMs);
  } catch (e) {
    return { ok: false, erro: String(e?.message ?? e) };
  }
  if (!Array.isArray(entradas) || !entradas.length || !entradas.every(ePar)) return { ok: false, erro: 'armazenamento vazio ou estranho' };
  const ficheiros = lerFicheiros({ fs, path, pastaDeDados });
  const assin = assinatura(crypto, entradas, ficheiros);
  const c = caminhos(path, pastaDeDados);
  if (assin === ultima && lerExportacao({ fs, path, pastaDeDados })) return { ok: true, escrita: false, chaves: entradas.length, assinatura: assin };
  const exportacao = { versao: VERSAO, app: versaoDaApp, em: agora, origem: new URL(url).origin, localStorage: entradas, ficheiros };
  try {
    fs.mkdirSync(c.pasta, { recursive: true });
    fs.writeFileSync(c.parcial, JSON.stringify(exportacao));
    fs.renameSync(c.parcial, c.ficheiro);
  } catch (e) {
    try { fs.rmSync(c.parcial, { force: true }); } catch { /* nada a limpar */ }
    return { ok: false, erro: String(e?.message ?? e) };
  }
  return { ok: true, escrita: true, chaves: entradas.length, assinatura: assin };
}

module.exports = { VERSAO, FICHEIROS, LER_O_ARMAZENAMENTO, exportacaoValida, exportar, lerExportacao, caminhos };
