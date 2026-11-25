/**
 * Ouvir sem rede no PC (25/11): os downloads pedidos na casca em Tauri, numa
 * pasta que a poda do arranque não toca, com as decisões do iPhone na página.
 * As contas do Rust têm os testes delas (`cargo test audio`, `os_ids_de_uma_pasta`);
 * aqui prende-se a forma: o que não pode voltar atrás sem se dar por isso.
 *
 * Correr: node --experimental-strip-types scripts/test-ouvir-sem-rede-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const audio = ler('desktop/src/audio.rs');
const web = ler('src/lib/descarregarFaixa.web.ts');

caso('a casca: os downloads noutra pasta, que a poda não leva', () => {
  assert.match(audio, /join\(crate::canal::IDENTIFICADOR\)\.join\("downloads"\)/);
  const poda = audio.slice(audio.indexOf('pub fn podar_cache()'), audio.indexOf('/// A página regista o URL'));
  assert.match(poda, /pasta_dos_downloads\(\)[\s\S]*Some\("parcial"\)/, 'dos downloads só sai o bocado a meio');
  assert.equal((poda.match(/LIMITE_DA_CACHE/g) ?? []).length, 1);
  assert.match(poda, /let Some\(pasta\) = pasta_da_cache\(\) else \{ return \};/, 'o limite só conta a cache');
});

caso('a casca: toca primeiro o download, depois a cache, pelo mesmo /audio/<id>', () => {
  assert.match(audio, /fn na_cache\(id: &str\) -> Option<PathBuf> \{\n {4}nos_downloads\(id\)\.or_else\(\|\| so_na_cache\(id\)\)\n\}/);
});

caso('a casca: descarrega aos bocados de 1 MB (um pedido grande sem PO Token leva 403), e da cache só copia', () => {
  const d = audio.slice(audio.indexOf('pub fn descarregar('), audio.indexOf('pub fn tirar_download('));
  assert.match(d, /proximo_bocado\(pos, fim, false\)/);
  assert.match(d, /CANCELADOS\.lock\(\)\.unwrap\(\)\.remove\(id\)/, 'o Cancel download pára entre bocados');
  assert.match(d, /if let Some\(da_cache\) = so_na_cache\(id\)[\s\S]*fs::copy/, 'já inteira na cache: sem rede');
  assert.match(d, /if tamanho != fonte\.tamanho/, 'um ficheiro a meio nunca passa a download');
  assert.match(audio, /pub async fn audio_descarregar[\s\S]*spawn_blocking/, 'fora da thread principal');
});

caso('a casca: os quatro comandos declarados, autorizados e registados', () => {
  const main = ler('desktop/src/main.rs'), build = ler('desktop/build.rs'), ponte = ler('desktop/src/ponte.js');
  for (const c of ['audio_descarregar', 'audio_cancelar_download', 'audio_tirar_download', 'audio_no_disco']) {
    assert.match(main, new RegExp(`audio::${c}\\b`));
    assert.match(build, new RegExp(`"${c}"`));
    for (const cap of ['preview', 'producao']) assert.match(ler(`desktop/capabilities/${cap}/default.json`), new RegExp(`"allow-${c.replace(/_/g, '-')}"`));
    assert.match(ponte, new RegExp(`pedir\\('${c}'`));
  }
});

caso('a página: só com a casca em Tauri, e as decisões do iPhone', () => {
  assert.match(web, /typeof ponte\(\)\?\.descarregarAudio === 'function'/, 'sem a casca nova, não há downloads');
  assert.match(web, /criarAcoesDeDownload\(/);
  assert.match(web, /criarLotesDeDownload<Track>\(/, 'as listas uma de cada vez, com a pausa do lote');
  assert.match(web, /emDisco: \(id\) => useDisco\.getState\(\)\.descarregadas\.has\(id\)/, 'um pedido só está feito na pasta protegida');
  assert.match(web, /let fonte = useDisco\.getState\(\)\.emCache\.has\(id\) \? null : await resolver\(false\);/, 'na cache, não se resolve');
  assert.match(web, /if \(motivo\(e\) !== 'expirada' \|\| !fonte \|\| parar\(\)\) throw e;\n\s+fonte = await resolver\(true\);/, 'um 403 resolve de novo, uma vez');
  assert.match(web, /dadosMoveis: \(\) => false/);
  // O mesmo jeito de falar do ficheiro do iPhone (os dois têm de ter as mesmas funções).
  const ios = ler('src/lib/descarregarFaixa.ts');
  const exportadas = (s: string) => [...s.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(exportadas(web), exportadas(ios));
});

caso('sem rede, a fila do PC só pára no que está no disco', () => {
  assert.match(ler('App.tsx'), /if \(Platform\.OS === 'ios' \|\| ouveSemRedeNesteAparelho\(\)\) definirPodeTocarSemRede\(tocaSemRede\);/);
  assert.match(web, /return d\.descarregadas\.has\(track\.sourceId\) \|\| d\.emCache\.has\(track\.sourceId\);/);
});

caso('onde se vê: o menu de uma música, o botão da playlist e o ↓ nas linhas', () => {
  const nav = ler('src/navigation/RootNavigator.web.tsx');
  assert.match(nav, /podeDescarregar: podeDescarregar\(trackMenu\),\n\s+download: downloadNoMenuDe\(trackMenu\),/);
  assert.match(nav, /case 'descarregar': setTrackMenuOpen\(false\); void alternarDownload\(t\); return;/);
  const pagina = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  assert.match(pagina, /<BotaoDoDownloadDaLista chave=\{`playlist:\$\{id\}`\} nome=\{playlistTitle\} faixas=\{tracks\} \/>/);
  assert.match(pagina, /<LinhaDoDownloadDaLista chave=\{`playlist:\$\{id\}`\} faixas=\{tracks\} \/>/);
  assert.match(ler('src/desktop/ui.web.tsx'), /const descarregada = useDescarregadaDeProposito\(track\);/);
  const botao = ler('src/desktop/DownloadDaLista.web.tsx');
  assert.match(botao, /leaves this PC\./, 'o aviso diz PC, não iPhone');
  assert.match(ler('src/i18n/fr.ts'), /leaves this PC\.": "/);
});

caso('as Liked Songs também descarregam, e as Definições dizem o espaço e tiram tudo (25/11)', () => {
  const biblioteca = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
  assert.match(biblioteca, /<BotaoDoDownloadDaLista chave="gostadas" nome="Liked Songs" faixas=\{data\.tracks\} \/>/);
  assert.match(biblioteca, /<LinhaDoDownloadDaLista chave="gostadas" faixas=\{data\.tracks\} \/>/);
  assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /<SettingsCard title="Library">\n\s+<DownloadsNasDefinicoes \/>/);
  const botao = ler('src/desktop/DownloadDaLista.web.tsx');
  assert.match(botao, /void limparTodosOsDownloads\(\)\.then/, 'o Remove all é o mesmo do iPhone');
  assert.match(botao, /if \(typeof ponte\?\.descarregarAudio !== 'function'\) return null;/, 'sem a casca em Tauri, não aparece');
  assert.match(audio, /"bytesDescarregadas": bytes_em\(pasta_dos_downloads\(\)\)/);
  const fr = ler('src/i18n/fr.ts');
  for (const k of ['Remove all downloads', 'Remove all downloads?', 'No songs downloaded on this PC yet.', '{0} {1} · {2} on this PC']) assert.ok(fr.includes(`"${k}":`), `falta o francês de "${k}"`);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
