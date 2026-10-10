// A personalização do iPhone (10/10, fases 1 e 2 do docs/PLANO-PERSONALIZACAO-IOS.md).
// Correr: node --experimental-strip-types scripts/test-aparencia.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  abrirJaNasLetras, alternarBotao, alternarSecao, alturaDaLinha, aplicarTema, BOTOES_DO_LEITOR, capaDoTema, destinoDaOrigem,
  ESTILOS_DA_CAPA, fonteDosTitulos, lerAparencia, MAXIMO_DE_BOTOES, moverSecao, NOMES_DAS_SECOES, olhoDaOrigem, ordemDasSecoes,
  PADRAO, SECOES_DA_HOME, secoesVisiveis, tamanhoDasLetras, TEMAS, temaDe, veuDoLeitor,
} from '../src/lib/aparencia.ts';
import { coresDoGradiente, contraste, deHex } from '../src/lib/corDaCapa.ts';

// O de omissão é o leitor de hoje: nada muda para quem não mexe.
assert.equal(temaDe(PADRAO), 'duotone');
assert.deepEqual(PADRAO.botoes, ['fila', 'visibilidade', 'eq'], 'os botões de baixo de hoje, pela mesma ordem');
assert.equal(PADRAO.topo, 'marca');
assert.equal(PADRAO.fundoApp, 'dark');
assert.deepEqual(veuDoLeitor(PADRAO.brilho), { opacidadeDoVeu: 1, escurecer: 0 }, 'o fundo do leitor de sempre');

// Os temas reconhecem-se; mexer numa opção passa a Custom; voltar ao tema volta.
for (const t of TEMAS) assert.equal(temaDe(aplicarTema(t.id)), t.id, t.id);
const mexido = { ...aplicarTema('minimal'), barra: 'grossa' as const };
assert.equal(temaDe(mexido), 'custom');
assert.equal(temaDe({ ...mexido, barra: 'fina' }), 'minimal');
assert.notEqual(aplicarTema('duotone').botoes, PADRAO.botoes, 'uma cópia: mexer nos botões não estraga o tema');

// Fase 2: o tema leva também o estilo da capa, e não desfaz o que é de uso.
for (const t of TEMAS) assert.equal(temaDe(aplicarTema(t.id), t.capa), t.id, `${t.id} com a capa dele`);
assert.equal(temaDe(aplicarTema('glow'), 'simple'), 'custom', 'o Glow com outra capa já não é o Glow');
assert.equal(capaDoTema('glow'), 'full');
assert.equal(capaDoTema('duotone'), 'floating', 'o de sempre');
assert.deepEqual(TEMAS.map((t) => t.id), ['duotone', 'minimal', 'glow', 'oled']);
const meu = {
  ...PADRAO, botoes: ['letras' as const], tamanhoDasLetras: 'g' as const, abrirNasLetras: true,
  secoesDaHome: moverSecao(PADRAO.secoesDaHome, 'raros', 'topo'), escondidasDaHome: ['decadas' as const],
};
const comTema = aplicarTema('minimal', meu);
assert.deepEqual(comTema.botoes, ['letras'], 'os botões ficam');
assert.equal(comTema.tamanhoDasLetras, 'g');
assert.equal(comTema.abrirNasLetras, true);
assert.equal(comTema.secoesDaHome[0], 'raros', 'a Home fica');
assert.deepEqual(comTema.escondidasDaHome, ['decadas']);
assert.equal(temaDe(comTema), 'minimal', 'o que é de uso não conta para o tema');
assert.equal(comTema.listas, 'compact');
assert.deepEqual(ESTILOS_DA_CAPA.map((e) => e.valor), ['floating', 'simple', 'full']);
assert.ok(ESTILOS_DA_CAPA.every((e) => e.nome !== 'Vinyl'), 'o vinil saiu (10/10)');

// Os botões de baixo: no máximo quatro, pela ordem em que se ligam.
let b = alternarBotao(['fila'], 'letras');
assert.deepEqual(b, ['fila', 'letras']);
b = alternarBotao(alternarBotao(alternarBotao(b, 'eq'), 'aparelhos'), 'partilhar');
assert.equal(b.length, MAXIMO_DE_BOTOES, 'o quinto não entra');
assert.ok(!b.includes('partilhar'));
assert.deepEqual(alternarBotao(b, 'letras'), ['fila', 'eq', 'aparelhos'], 'tirar um');
assert.deepEqual(alternarBotao([], 'fila'), ['fila']);

// O que está guardado: opção a opção, e o que não se reconhece fica o de omissão.
assert.deepEqual(lerAparencia(null), PADRAO);
assert.deepEqual(lerAparencia('lixo'), PADRAO);
const lido = lerAparencia({ fundoApp: 'oled', listas: 'gigante', rotulos: false, brilho: 250, botoes: ['eq', 'eq', 'teletransporte', 'fila', 'letras', 'partilhar', 'aparelhos'] });
assert.equal(lido.fundoApp, 'oled');
assert.equal(lido.listas, 'comfortable', 'um valor de outra versão fica o de omissão');
assert.equal(lido.rotulos, false);
assert.equal(lido.brilho, 100, 'preso entre 0 e 100');
assert.deepEqual(lido.botoes, ['eq', 'fila', 'letras', 'partilhar'], 'sem repetidos, sem desconhecidos, no máximo quatro');
assert.deepEqual(lerAparencia({ botoes: [] }).botoes, [], 'sem botões é uma escolha');
assert.ok(BOTOES_DO_LEITOR.every((x) => ['fila', 'eq', 'visibilidade', 'aparelhos', 'partilhar', 'letras'].includes(x)));

// Os novos guardados: valores de outra versão ficam os de omissão.
const lido2 = lerAparencia({
  fundoLeitor: 'gradiente', titulos: 'mono', tamanhoDasLetras: 'xl', abrirNasLetras: 'sim',
  secoesDaHome: 'x', escondidasDaHome: ['raros', 'nada', 'raros'],
});
assert.equal(lido2.fundoLeitor, 'gradiente');
assert.equal(lido2.titulos, 'mono');
assert.equal(lido2.tamanhoDasLetras, 'm');
assert.equal(lido2.abrirNasLetras, false);
assert.deepEqual(lido2.secoesDaHome, [...SECOES_DA_HOME]);
assert.deepEqual(lido2.escondidasDaHome, ['raros'], 'sem repetidas nem desconhecidas');
assert.equal(lerAparencia({ fundoLeitor: 'vinyl' }).fundoLeitor, 'capa');

// A Home: a ordem guardada, e uma secção nova (de uma versão seguinte) no sítio dela.
const semNovas = SECOES_DA_HOME.filter((x) => x !== 'lancamentos' && x !== 'esquecidas');
const ordem = ordemDasSecoes(['raros', ...semNovas.filter((x) => x !== 'raros'), 'lixo', 'raros']);
assert.equal(ordem.length, SECOES_DA_HOME.length, 'todas, uma vez');
assert.equal(ordem[0], 'raros', 'a escolha fica');
assert.equal(ordem[ordem.indexOf('misturaDoDia') + 1], 'lancamentos', 'a nova entra logo a seguir à que a antecede');
assert.equal(ordem[ordem.length - 1], 'esquecidas');
assert.equal(ordemDasSecoes(['decadas'])[0], 'voltar', 'as que faltam antes da guardada entram antes');
assert.deepEqual(ordemDasSecoes(null), [...SECOES_DA_HOME]);
let h = moverSecao(SECOES_DA_HOME, 'descobrir', 'cima');
assert.equal(h.indexOf('descobrir'), SECOES_DA_HOME.indexOf('descobrir') - 1);
assert.deepEqual(moverSecao(SECOES_DA_HOME, 'voltar', 'cima'), [...SECOES_DA_HOME], 'no topo não sobe');
assert.deepEqual(moverSecao(SECOES_DA_HOME, 'esquecidas', 'baixo'), [...SECOES_DA_HOME], 'no fundo não desce');
h = moverSecao(SECOES_DA_HOME, 'amigos', 'topo');
assert.equal(h[0], 'amigos');
assert.equal(h.length, SECOES_DA_HOME.length);
assert.deepEqual(alternarSecao(alternarSecao([], 'radios'), 'radios'), []);
assert.deepEqual(secoesVisiveis({ secoesDaHome: h, escondidasDaHome: ['voltar', 'amigos'] }).slice(0, 2), ['misturaDoDia', 'lancamentos']);
assert.ok(SECOES_DA_HOME.every((x) => NOMES_DAS_SECOES[x]), 'cada secção tem nome');

// Os títulos e as letras.
assert.equal(fonteDosTitulos('padrao'), null, 'a de sempre');
assert.deepEqual(fonteDosTitulos('serif'), { fontFamily: 'Georgia' });
assert.deepEqual(fonteDosTitulos('mono'), { fontFamily: 'Menlo' });
assert.deepEqual(tamanhoDasLetras('m'), { linha: { fontSize: 23, lineHeight: 31 }, texto: { fontSize: 20, lineHeight: 30 } }, 'o M é o de sempre');
for (const t of ['p', 'm', 'g'] as const) {
  const { linha, texto } = tamanhoDasLetras(t);
  assert.ok(linha.fontSize >= 11 && texto.fontSize >= 11 && linha.lineHeight > linha.fontSize, t);
}
assert.ok(tamanhoDasLetras('p').linha.fontSize < 23 && tamanhoDasLetras('g').linha.fontSize > 23);
const pronta = { status: 'ready', data: { instrumental: false } };
assert.equal(abrirJaNasLetras(true, true, pronta), true);
assert.equal(abrirJaNasLetras(false, true, pronta), false, 'só com a opção');
assert.equal(abrirJaNasLetras(true, false, pronta), false, 'só com o leitor aberto');
assert.equal(abrirJaNasLetras(true, true, { status: 'loading', data: null }), false);
assert.equal(abrirJaNasLetras(true, true, { status: 'missing', data: null }), false);
assert.equal(abrirJaNasLetras(true, true, { status: 'ready', data: { instrumental: true } }), false, 'um instrumental fica na capa');
assert.equal(abrirJaNasLetras(true, true, undefined), false);

// O gradiente: duas cores da capa, escuras o bastante para o texto branco.
const BRANCO = { r: 255, g: 255, b: 255 };
const azulELaranja = [...Array(8).fill({ r: 30, g: 80, b: 200 }), ...Array(8).fill({ r: 240, g: 140, b: 40 })];
const [g1, g2] = coresDoGradiente(azulELaranja)!;
assert.notEqual(g1, g2, 'duas cores, não uma');
const c1 = deHex(g1), c2 = deHex(g2);
assert.ok((c1.b > c1.r) !== (c2.b > c2.r), `uma azul e uma laranja: ${g1} ${g2}`);
for (const c of [g1, g2]) assert.ok(contraste(deHex(c), BRANCO) >= 3, `o branco lê-se sobre ${c}`);
const umaCor = coresDoGradiente(Array(16).fill({ r: 200, g: 40, b: 60 }))!;
assert.notEqual(umaCor[0], umaCor[1], 'uma capa de uma cor leva a mesma mais funda');
assert.ok(contraste(deHex(umaCor[1]), BRANCO) > contraste(deHex(umaCor[0]), BRANCO));
const cinza = coresDoGradiente(Array(16).fill({ r: 128, g: 128, b: 128 }))!;
assert.ok(cinza.every((c) => { const x = deHex(c); return Math.abs(x.r - x.g) <= 2 && Math.abs(x.g - x.b) <= 4; }), 'uma capa cinzenta dá cinzentos');
assert.equal(coresDoGradiente(null), null);
assert.equal(coresDoGradiente([]), null);

// As linhas das listas e o fundo do leitor.
assert.equal(alturaDaLinha('comfortable'), 68, 'a de sempre (TRACK_ROW_HEIGHT)');
assert.equal(alturaDaLinha('compact'), 56);
assert.deepEqual(veuDoLeitor(100), { opacidadeDoVeu: 0.5, escurecer: 0 });
assert.deepEqual(veuDoLeitor(0), { opacidadeDoVeu: 1, escurecer: 0.5 });
assert.deepEqual(veuDoLeitor(Number.NaN), { opacidadeDoVeu: 1, escurecer: 0 });

// "Playing from" (o G1): a frase e para onde leva.
assert.equal(olhoDaOrigem('From'), 'Playing from');
assert.equal(olhoDaOrigem('From search'), 'Playing from search');
assert.equal(olhoDaOrigem('Smart shuffle pick for'), 'Smart shuffle pick for');
assert.deepEqual(destinoDaOrigem({ tipo: 'guardadas', nome: 'Liked Songs' }), { tipo: 'gostadas' });
assert.deepEqual(destinoDaOrigem({ tipo: 'playlist', id: 'p1', nome: 'Rap' }), { tipo: 'playlist', id: 'p1', nome: 'Rap' });
assert.equal(destinoDaOrigem({ tipo: 'playlist', nome: 'Sem id' }), null);
assert.equal(destinoDaOrigem({ tipo: 'prateleira', nome: 'Discover daily' }), null, 'uma prateleira não é página');
assert.equal(destinoDaOrigem(null), null);

// Cada opção tem quem a leia (a regra das Definições: uma opção que não faz nada é pior do que não existir).
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const leitor = ler('src/components/PlayerRoot.tsx');
for (const [opcao, padrao] of [
  ['topo', /ap\.topo === 'origem' && origemNoTopo/], ['titulo', /ap\.titulo === 'centro'/], ['barra', /grossa=\{ap\.barra === 'grossa'\}/],
  ['play', /ap\.play === 'anel'/], ['botoes', /ap\.botoes\.map\(botaoDeBaixo\)/], ['flutuar', /aFlutuar=\{ap\.flutuar\}/],
  ['fundoLeitor', /ap\.fundoLeitor === 'preto'/], ['brilho', /veuDoLeitor\(ap\.brilho\)/],
] as const) assert.match(leitor, padrao, `o leitor lê "${opcao}"`);
assert.match(ler('src/components/CapaFlutuante3D.tsx'), /!foreground \|\| !aFlutuar\) return;/, 'parar de flutuar pára a animação');
assert.match(ler('src/components/ProgressBar.tsx'), /grossa && styles\.trackGrossa/);
assert.match(ler('src/navigation/RootNavigator.tsx'), /fundoApp === 'oled' \? '#000'/, 'o fundo OLED');
assert.match(ler('src/navigation/BarraDeSeparadores.tsx'), /\{rotulos \? <Text/, 'os rótulos da barra');
assert.match(ler('src/components/TrackRow.tsx'), /compacta && styles\.artworkCompacta/, 'as listas compactas');
for (const f of ['src/screens/SongsScreen.tsx', 'src/screens/PrateleiraScreen.tsx']) {
  assert.match(ler(f), /alturaDaLinha\(useAparencia\(\(s\) => s\.listas\)\)/, `${f}: o getItemLayout conta com a altura escolhida`);
}
assert.match(ler('App.tsx'), /useAparencia\.getState\(\)\.carregar\(\)/, 'carrega no arranque');
assert.match(ler('src/screens/SettingsScreen.tsx'), /navigation\.navigate\('Personalizar'\)/, 'a porta nas Definições');
assert.match(ler('src/state/aparencia.ts'), /AsyncStorage/);

// Fase 2: cada opção nova tem quem a leia.
assert.match(leitor, /ap\.fundoLeitor === 'gradiente' \? <FundoEmGradiente uri=\{fundo\?\.uri \?\? null\} animar=\{aberto\} \/>/, 'o fundo em gradiente');
assert.match(leitor, /const capaInteira = Platform\.OS === 'ios' && estiloDaCapaCarregado && estiloDaCapa === 'full'/, 'a capa Full');
assert.match(leitor, /\? Math\.min\(W, Math\.max\(96, H - insets\.top - insets\.bottom - HEADER_H - RESERVA_COM_A_CAPA_INTEIRA/, 'a toda a largura');
assert.match(leitor, /outputRange: \[8, capaInteira \? 0 : 20\]/, 'sem cantos');
assert.match(leitor, /raio=\{capaFlutuante \? CAPA_FLUTUANTE\.raio : capaInteira \? 0 : 20\}/);
assert.match(leitor, /sombra: capaFlutuante \? 0 : capaInteira \? 0 :/, 'sem sombra');
assert.match(leitor, /fonteDosTitulos\(ap\.titulos\)/, 'a letra do título do leitor');
assert.match(leitor, /abrirJaNasLetras\(ap\.abrirNasLetras, expanded, letrasDaMusica\)/, 'abrir nas letras');
assert.match(ler('src/components/Screen.tsx'), /fonteDosTitulos\(useAparencia\(\(s\) => s\.titulos\)\)/, 'os títulos das páginas');
assert.match(ler('src/components/LyricsView.tsx'), /tamanhoDasLetras\(useAparencia\(s=>s\.tamanhoDasLetras\)\)/, 'o tamanho das letras');
const home = ler('src/screens/SearchScreen.tsx');
assert.match(home, /useAparencia\(useShallow\(\(s\) => secoesVisiveis\(s\)\)\)/, 'a Home lê as secções');
assert.match(home, /secoesDaHome\.map\(\(secao\) => <React\.Fragment key=\{secao\}>\{blocoDaHome\(secao\)\}<\/React\.Fragment>\)/);
for (const x of SECOES_DA_HOME) assert.match(home, new RegExp(`case '${x}': return`), `a Home desenha "${x}"`);
assert.match(ler('src/screens/SettingsScreen.tsx'), /opcoes: ESTILOS_DA_CAPA\.map/, 'o Full também nas Definições');
const gradiente = ler('src/components/FundoEmGradiente.tsx');
assert.match(gradiente, /if \(!animar \|\| !aFrente \|\| reduzido\) return;/, 'o gradiente pára quando não se vê');
assert.match(gradiente, /pedirFluidez\(PASSAGEM_MS \+ 100\)/, 'os 120 Hz só na passagem das cores');
assert.doesNotMatch(gradiente, /segurarFluidez/, 'e não durante a volta lenta (aquecia)');
assert.match(ler('src/lib/capaFlutuante3D.ts'), /atual === 'full'\) return atual/, 'o Full guardado lê-se');
assert.match(ler('src/state/aparencia.ts'), /useCapaIOS\.getState\(\)\.setStyle\(capaDoTema\(id\)\)/, 'o tema muda a capa');
assert.doesNotMatch(ler('src/state/aparencia.ts'), /supabase|prefsSync/, 'fica no aparelho');
console.log('Aparência: temas (com a capa), Custom, botões, Home, letras, títulos, gradiente e cada opção com quem a lê.');
