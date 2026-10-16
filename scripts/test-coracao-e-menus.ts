/**
 * O coração que reage ao carregar (as Faíscas a pôr, o Encolher a tirar) e o
 * menu compacto do iPhone (16/10, `docs/favorito-animacao.html` e
 * `docs/menus-ios.html`, variante B).
 *
 * As contas são puras (lib/coracaoAoCarregar.ts, lib/posicaoDoMenu.ts,
 * lib/menuDaFaixa.ts); o resto lê os ficheiros, para as regras que vivem nos
 * componentes.
 *
 * Correr: node --experimental-strip-types scripts/test-coracao-e-menus.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { animacaoPara, direcoesDasFaiscas, DURACAO, FAISCAS, MOLA, RESPIRA } from '../src/lib/coracaoAoCarregar.ts';
import { posicaoDoMenu } from '../src/lib/posicaoDoMenu.ts';
import { AVISO_SEM_REDE, menuCompacto, menuDaFaixa, MOTIVOS, type ContextoDoMenu } from '../src/lib/menuDaFaixa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');

console.log('\no coração');
caso('pôr são as Faíscas, tirar é o Encolher', () => {
  assert.equal(animacaoPara(true), 'por');
  assert.equal(animacaoPara(false), 'tirar');
});
caso('seis faíscas à volta, a primeira para cima', () => {
  const d = direcoesDasFaiscas();
  assert.equal(d.length, FAISCAS);
  assert.deepEqual(d[0], { x: 0, y: -1 });
  for (const v of d) assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 0.01);
});
caso('nada dura mais de meio segundo, e as molas acabam no tamanho certo', () => {
  for (const ms of Object.values(DURACAO)) assert.ok(ms <= 500, `${ms} ms`);
  assert.equal(MOLA[MOLA.length - 1]![0], 1);
  assert.equal(RESPIRA[RESPIRA.length - 1]![0], 1);
  // começa no aperto do dedo: mais pequeno do que o tamanho normal
  assert.ok(MOLA[0]![0] < 1 && RESPIRA[0]![0] < 1);
});
caso('o gancho anima ao carregar e corre a ação ao largar', () => {
  const g = ler('src/hooks/useCoracaoAoCarregar.ts');
  assert.match(g, /const onPressIn = useCallback\(\(\) => \{\s*largou\.current = false;\s*pedir\(!mostrada\);\s*setPulso/);
  assert.match(g, /const onPress = useCallback\(\(\) => \{\s*largou\.current = true;[\s\S]*?resultado = alternar\(\)/);
  // um toque que não largou (virou scroll) volta atrás
  assert.match(g, /if \(largou\.current \|\| pedidaRef\.current === null\) return;\s*pedir\(null\);\s*setPulso/);
});
caso('os corações de guardar uma música usam-no, nas duas plataformas', () => {
  const sitios = [
    'src/desktop/casca.web.tsx',
    'src/desktop/paginas/NowPlayingPage.web.tsx',
    'src/janelaMini.web.tsx',
    'src/components/PlayerRoot.tsx',
    'src/components/BotaoGuardar.tsx',
    'src/components/FolhaDoAmigo.tsx',
    'src/components/MenuFlutuante.tsx',
  ];
  for (const f of sitios) {
    const t = ler(f);
    assert.match(t, /useCoracaoAoCarregar\(/, `${f}: sem o gancho`);
    assert.match(t, /<CoracaoAnimado /, `${f}: sem o coração animado`);
    assert.doesNotMatch(t, /name=\{(?:saved|guardada|currentIsSaved) \? 'heart' : 'heart-outline'\}/, `${f}: ainda há um coração parado`);
  }
});
caso('o iPhone anima no driver nativo e pede a taxa alta; o PC em CSS no documento de quem desenha', () => {
  const ios = ler('src/components/CoracaoAnimado.tsx');
  assert.match(ios, /pedirFluidez\(/);
  assert.doesNotMatch(ios, /useNativeDriver: false/);
  assert.doesNotMatch(ios, /Animated\.parallel/);
  const pc = ler('src/components/CoracaoAnimado.web.tsx');
  assert.match(pc, /garantirEstilo\(raiz\.current\.ownerDocument\)/);
  assert.match(pc, /prefers-reduced-motion/);
});

console.log('\no menu do iPhone nunca sai da zona segura (I1)');
const iphone = { altura: 844, topo: 59, fundo: 34 };
caso('cabe por baixo: abre por baixo', () => {
  assert.deepEqual(posicaoDoMenu({ y: 100, height: 60 }, 400, iphone), { topo: 172, altura: 400 });
});
caso('não cabe por baixo: abre por cima', () => {
  assert.deepEqual(posicaoDoMenu({ y: 700, height: 60 }, 400, iphone), { topo: 288, altura: 400 });
});
caso('nem por baixo nem por cima: encosta ao fundo, nunca por baixo da ilha', () => {
  const p = posicaoDoMenu({ y: 425, height: 60 }, 520, iphone);
  assert.ok(p.topo >= 59 + 12, `topo ${p.topo}`);
  assert.ok(p.topo + p.altura <= 844 - 34 - 12);
  assert.equal(p.altura, 520);
});
caso('mais alto do que a zona segura: fica com a altura dela (e rola)', () => {
  const p = posicaoDoMenu({ y: 425, height: 60 }, 900, iphone);
  assert.equal(p.topo, 71);
  assert.equal(p.altura, 844 - 34 - 12 - 71);
});

console.log('\no menu compacto (variante B)');
const contexto = (extra: Partial<ContextoDoMenu> = {}): ContextoDoMenu => ({
  plataforma: 'ios', onde: 'lista', semRede: false, tocaSemRede: false, guardada: false,
  podeDescarregar: true, download: 'nenhum', temArtista: true, playlist: { podeEditar: true }, ...extra,
});
caso('o coração sai da lista, e as três mais usadas vão para quadrados', () => {
  const c = contexto();
  const m = menuCompacto(menuDaFaixa(c), c);
  assert.equal(m.guardar?.id, 'guardar');
  assert.deepEqual(m.atalhos.map((a) => a.rotulo), ['Play next', 'Queue', 'Playlist']);
  assert.ok(!m.linhas.some((a) => a.id === 'guardar' || a.id === 'por-na-fila'));
  assert.equal(m.aviso, null);
});
caso('o resto vai em grupos, com o traço só onde o grupo muda', () => {
  const c = contexto({ sugestao: true });
  const m = menuCompacto(menuDaFaixa(c), c);
  assert.deepEqual(m.linhas.map((a) => [a.id, a.inicioDeGrupo]), [
    ['tocar-agora', false],
    ['ver-artista', true], ['partilhar', false], ['descarregar', false],
    ['nao-interessa', true], ['recomendacoes', false],
    ['tirar-da-playlist', true],
  ]);
});
caso('sem rede: um aviso no topo, e as linhas apagadas sem "Needs internet" por baixo', () => {
  const c = contexto({ semRede: true });
  const m = menuCompacto(menuDaFaixa(c), c);
  assert.equal(m.aviso, AVISO_SEM_REDE.naoDescarregada);
  assert.ok(m.linhas.every((a) => a.motivoVisivel === null));
  assert.ok(m.linhas.find((a) => a.id === 'partilhar')!.indisponivel, 'continua indisponível');
  assert.ok(m.atalhos.every((a) => a.indisponivel && a.motivoVisivel === null));
  const descarregada = contexto({ semRede: true, tocaSemRede: true });
  assert.equal(menuCompacto(menuDaFaixa(descarregada), descarregada).aviso, AVISO_SEM_REDE.descarregada);
});
caso('os outros motivos continuam escritos (o aviso não os explica)', () => {
  const c = contexto({ playlist: { podeEditar: false } });
  const m = menuCompacto(menuDaFaixa(c), c);
  assert.equal(m.linhas.find((a) => a.id === 'tirar-da-playlist')!.motivoVisivel, MOTIVOS.soODono);
});
caso('um quadrado sozinho não faz uma fila de atalhos', () => {
  const c = contexto({ onde: 'fila', fila: { emJam: false, mudou: false }, playlist: null });
  const m = menuCompacto(menuDaFaixa(c), c);
  assert.equal(m.atalhos.length, 0);
  assert.ok(m.linhas.some((a) => a.id === 'por-em-playlist'));
});
caso('as listas do iPhone abrem o compacto, com a capa e o coração em cima', () => {
  const t = ler('src/components/TrackActionsSheet.tsx');
  assert.match(t, /const compacto = track \? menuCompacto\(menu,/);
  assert.match(t, /faixa=\{faixaDoMenu\}/);
  assert.match(t, /atalhos=\{compacto \? compacto\.atalhos\.map\(paraAccao\) : undefined\}/);
  const m = ler('src/components/MenuFlutuante.tsx');
  assert.match(m, /posicaoDoMenu\(ancoraVisivel, alturaEstimada, \{ altura: height, topo: insets\.top, fundo: insets\.bottom \}/);
  assert.match(m, /<ScrollView scrollEnabled=\{rola\}/);
});

console.log('\no PC não fica parado numa música que não arranca (16/10)');
caso('o erro sem cópia e a vigia dos 15 s tentam uma vez e depois saltam', () => {
  const motor = ler('src/components/YouTubePlayerView.web.tsx');
  const corpoDaFalha = motor.slice(motor.indexOf('async function falhaSemCopia('), motor.indexOf('const ESPERA_PELA_ENTREGA_MS'));
  // sem rede fica (não percorre a fila toda), o resto salta
  assert.match(corpoDaFalha, /if \(tipo === 'sem-rede'\) \{[\s\S]*?return;\s*\}/);
  assert.match(corpoDaFalha, /tentadasOutraVez\.set\(track\.sourceId, Date\.now\(\)\);[\s\S]*?recarregar\(\);\s*return;/);
  assert.match(corpoDaFalha, /await state\.skipUnavailableTrack\(track\.sourceId\);/);
  // à segunda falha, outra cópia da mesma música antes de saltar
  assert.match(corpoDaFalha, /await recoverUnavailableVideo\(track, tipo\);/);
  // num Jam nunca salta nem troca a música da sala: tenta outra vez
  const noJam = corpoDaFalha.slice(corpoDaFalha.indexOf('if (useOuvirJuntos.getState().sessao) {'));
  assert.match(noJam, /^if \(useOuvirJuntos\.getState\(\)\.sessao\) \{\s*state\.setError\(null\);\s*playbackNotice\(MENSAGEM_NO_JAM\);\s*recarregar\?\.\(\);\s*return;\s*\}/);
});
caso('um player encravado não se reaproveita: tentar outra vez é um player novo', () => {
  const motor = ler('src/components/YouTubePlayerView.web.tsx');
  const recarregar = motor.slice(motor.indexOf('function recarregarAtual() {'), motor.indexOf('const armarVigiaRef'));
  assert.match(recarregar, /setGeracaoDoMotor\(\(n\) => n \+ 1\)/);
  assert.doesNotMatch(recarregar, /loadVideoById/);
  // o motor monta outra vez quando a geração muda
  assert.match(motor, /\}, \[geracaoDoMotor\]\);/);
  // a seguinte a um encravanço (ou a um salto de uma presa há mais de 4 s) começa num player novo
  assert.match(motor, /if \(encravadoRef\.current \|\| preso\) \{\s*encravadoRef\.current = false;\s*state\._setBuffering\(true\);\s*setGeracaoDoMotor/);
  // um vídeo que chega a tocar dá o player por são
  assert.match(motor, /clearTimeout\(vigiaRef\.current\);\s*encravadoRef\.current = false;\s*state\.setError\(null\);\s*state\._onYtStateChange\('playing'\);/);
  // os dois sítios que ficavam parados passam por ela
  assert.equal((motor.match(/void falhaSemCopia\(faixaRef\.current, tipo, recarregarAtual\)/g) ?? []).length, 2);
  assert.doesNotMatch(motor, /state\.setError\(mensagemDaFalha\(tipo\)\);\s*playbackNotice\(mensagemDaFalha\(tipo\)\);\s*\}, 15000\)/);
});

console.log('\nW3, W5, I5 e o EQ (16/10, docs/ui-seguinte.html)');
caso('W3: as Definições do PC leem-se sem chegar a cabeça ao ecrã', () => {
  const e = ler('src/desktop/estilos.web.ts');
  assert.match(e, /settingLabel: \{[^}]*fontSize: 13\.5/);
  assert.match(e, /settingDescription: \{[^}]*fontSize: 12/);
  assert.match(e, /smallSegmentText: \{[^}]*fontSize: 11/);
});
caso('W5: a falha diz-se no lugar do artista, e não numa linha de 10 px ao lado do volume', () => {
  const c = ler('src/desktop/casca.web.tsx');
  assert.match(c, /\{p\.error\s*\? <View[\s\S]{0,200}accessibilityRole="alert"/);
  assert.doesNotMatch(c, /style=\{styles\.playerError\}/);
});
caso('I5: a pesquisa da Home do iPhone tem "Cancel"', () => {
  const s = ler('src/screens/SearchScreen.tsx');
  assert.match(s, /\{isFocused \|\| query\.length > 0 \? \([\s\S]{0,300}Keyboard\.dismiss\(\); setQuery\(''\); setIsFocused\(false\);[\s\S]{0,120}>Cancel</);
});
caso('o EQ do PC não escurece o leitor por trás', () => {
  assert.match(ler('src/desktop/paginas/NowPlayingPage.web.tsx'), /<Dialog open=\{eqAberto\} title="Equaliser"[\s\S]{0,120}width=\{560\} semVeu>/);
  assert.match(ler('src/desktop/ui.web.tsx'), /semVeu && \{ backgroundColor: 'transparent' \}/);
});

console.log(falhas ? `\n  ${falhas} caso(s) a falhar.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
