// A personalização do iPhone (10/10, fases 1 e 2 do docs/PLANO-PERSONALIZACAO-IOS.md).
// Correr: node --experimental-strip-types scripts/test-aparencia.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  abrirJaNasLetras, alternarBotao, alternarSecao, alturaDaLinha, aplicarTema, BOTOES_DO_LEITOR, capaDoTema, destinoDaOrigem,
  ESTILOS_DA_CAPA, fonteDosTitulos, lerAparencia, MAXIMO_DE_BOTOES, moverSecao, NOMES_DAS_SECOES, olhoDaOrigem, ordemDasSecoes,
  PADRAO, SECOES_DA_HOME, secoesVisiveis, tamanhoDasLetras, TEMAS, temaDe, veuDoLeitor,
  fundoDasFolhas, GRAFITE_DAS_FOLHAS, NOMES_DOS_BOTOES, rotuloDoTemporizador, alturaDoPoster, degradesDoPoster, emCinzento,
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
assert.deepEqual(TEMAS.map((t) => t.id), ['duotone', 'minimal', 'glow', 'poster', 'oled']);
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
assert.deepEqual(ESTILOS_DA_CAPA.map((e) => e.valor), ['floating', 'simple', 'full', 'poster']);

// O Poster e a cor dos controlos (16/11, a maquete do João).
assert.equal(PADRAO.controlos, 'destaque', 'quem não mexe fica com os símbolos na cor do destaque');
assert.equal(capaDoTema('poster'), 'poster');
const poster = aplicarTema('poster');
assert.equal(poster.controlos, 'branco', 'o tema Poster: só o fundo tem a cor da capa');
assert.equal(poster.topo, 'origem');
assert.equal(poster.play, 'anel');
assert.equal(poster.posterImagem, 'artista', 'o tema Poster: fotos do artista');
assert.equal(poster.posterMono, true, 'a preto e branco, como a maquete');
assert.equal(PADRAO.posterImagem, 'artista', 'o Poster escolhido à mão também começa nas fotos');
assert.equal(PADRAO.posterMono, false);
assert.equal(lerAparencia({ posterImagem: 'capa', posterMono: true }).posterImagem, 'capa');
assert.equal(lerAparencia({ posterMono: true }).posterMono, true);
assert.equal(lerAparencia({ posterImagem: 'video', posterMono: 'sim' }).posterImagem, 'artista', 'um valor desconhecido cai no de omissão');
assert.equal(lerAparencia({ posterMono: 'sim' }).posterMono, false);
assert.equal(temaDe({ ...poster, posterMono: false }, 'poster'), 'custom', 'o Poster a cores já é Custom');
assert.equal(temaDe(poster, 'poster'), 'poster');
assert.equal(temaDe(poster, 'floating'), 'custom', 'o Poster com outra capa já não é o Poster');
assert.equal(temaDe({ ...PADRAO, controlos: 'branco' }), 'custom', 'os controlos brancos à mão passam a Custom');
assert.equal(aplicarTema('duotone', poster).controlos, 'destaque', 'escolher um tema repõe os controlos dele');
assert.equal(lerAparencia({ controlos: 'branco' }).controlos, 'branco');
assert.equal(lerAparencia({ controlos: 'roxo' }).controlos, 'destaque', 'um valor desconhecido cai no de omissão');
// A imagem desce até um pouco abaixo do título, entre metade e 82% do ecrã.
assert.equal(alturaDoPoster(474, 852), 624);
assert.equal(alturaDoPoster(800, 852), Math.round(852 * 0.82), 'nunca tapa os controlos de baixo');
assert.equal(alturaDoPoster(100, 852), 426, 'nunca menos de metade');
// As bordas na cor da capa: transparente no meio, cheia em baixo (é a mesma que fica por trás dos controlos).
const d = degradesDoPoster('#2A4B7C');
assert.equal(d.topo.cores[0], 'rgba(42,75,124,0.9)', 'em cima, o tom da capa (era preto)');
assert.equal(d.topo.cores.at(-1), 'rgba(42,75,124,0)');
assert.equal(d.baixo.cores[0], 'rgba(42,75,124,0)');
assert.equal(d.baixo.cores.at(-1), 'rgba(42,75,124,1)', 'em baixo, cheio: sem aresta com o fundo');
assert.equal(d.topo.cores.length, d.topo.paragens.length);
assert.equal(d.baixo.cores.length, d.baixo.paragens.length);
assert.equal(degradesDoPoster('lixo').baixo.cores.at(-1), 'rgba(6,6,8,1)', 'sem cor, o fundo da app');
// A preto e branco, as bordas em cinzento com a mesma luz.
assert.equal(emCinzento('#1A0F55'), '#0C0C0C', 'um azul fundo dá quase preto, como a maquete');
assert.equal(emCinzento('#767676'), '#424242', 'a mais clara que o corDoAmbiente dá (contraste 4,5 com o branco) fica escura');
assert.equal(emCinzento('#000000'), '#000000');
assert.equal(emCinzento('lixo'), 'lixo');
assert.ok(ESTILOS_DA_CAPA.every((e) => e.nome !== 'Vinyl'), 'o vinil saiu (10/10)');

// Os botões de baixo: no máximo quatro, pela ordem em que se ligam.
let b = alternarBotao(['fila'], 'letras');
assert.deepEqual(b, ['fila', 'letras']);
b = alternarBotao(alternarBotao(alternarBotao(b, 'eq'), 'visibilidade'), 'partilhar');
assert.equal(b.length, MAXIMO_DE_BOTOES, 'o quinto não entra');
assert.ok(!b.includes('partilhar'));
assert.deepEqual(alternarBotao(b, 'letras'), ['fila', 'eq', 'visibilidade'], 'tirar um');
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
assert.deepEqual(lerAparencia({ botoes: ['aparelhos', 'fila'] }).botoes, ['fila'], 'o "Devices" guardado de antes (saiu a 1/11) cai');
assert.deepEqual(lerAparencia({ botoes: [] }).botoes, [], 'sem botões é uma escolha');
assert.ok(BOTOES_DO_LEITOR.every((x) => ['fila', 'eq', 'visibilidade', 'partilhar', 'letras',
  'temporizador', 'radio', 'playlist', 'descarregar', 'carro'].includes(x)));
// 15/11: o temporizador, o Radio, a playlist, o download e o carro também vão para baixo.
assert.deepEqual(lerAparencia({ botoes: ['temporizador', 'radio', 'playlist', 'descarregar', 'carro'] }).botoes,
  ['temporizador', 'radio', 'playlist', 'descarregar'], 'os novos leem-se, e o máximo continua a ser quatro');
assert.equal(rotuloDoTemporizador(0, false), 'Sleep');
assert.equal(rotuloDoTemporizador(754, false), '12:34');
assert.equal(rotuloDoTemporizador(3900, false), '1:05:00');
assert.equal(rotuloDoTemporizador(0.4, false), '0:01', 'arredonda para cima: nunca mostra 0:00 a contar');
assert.equal(rotuloDoTemporizador(0, true), 'End');
for (const b of BOTOES_DO_LEITOR) assert.ok(NOMES_DOS_BOTOES[b], `nome de ${b}`);
const doLeitor = readFileSync(new URL('../src/components/PlayerRoot.tsx', import.meta.url), 'utf8');
for (const b of BOTOES_DO_LEITOR) assert.ok(doLeitor.includes(`case '${b}':`), `o leitor desenha o ${b}`);

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

// O fundo das folhas (11/10): com o destaque pela capa, a capa desfocada; senão segue o fundo da app.
assert.deepEqual(fundoDasFolhas('dark', 'steel'), { cor: GRAFITE_DAS_FOLHAS, linhaEmCima: false, capa: false }, 'Dark: o grafite');
assert.deepEqual(fundoDasFolhas('oled', 'steel'), { cor: '#000', linhaEmCima: true, capa: false }, 'OLED: preto com a linha');
assert.deepEqual(fundoDasFolhas('dark', 'cover'), { cor: GRAFITE_DAS_FOLHAS, linhaEmCima: false, capa: true }, 'Cover: a capa desfocada');
assert.deepEqual(fundoDasFolhas('oled', 'cover'), { cor: '#000', linhaEmCima: false, capa: true }, 'no OLED a base é preta');
assert.notEqual(GRAFITE_DAS_FOLHAS.toLowerCase(), '#1d1d28', 'sem o azul de antes');

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
// O perfil (24/11): o de um amigo leva ao dele, o teu (sem id) ao teu.
assert.deepEqual(destinoDaOrigem({ tipo: 'perfil', id: 'u2', nome: 'Ana’s most played' }), { tipo: 'perfil', userId: 'u2' });
assert.deepEqual(destinoDaOrigem({ tipo: 'perfil', nome: 'Your song of the moment' }), { tipo: 'perfil' });
assert.equal(destinoDaOrigem({ tipo: 'radio', nome: 'Radio' }), null, 'o Radio não é página');

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
assert.match(ler('src/components/FundoDasPaginas.tsx'), /fundoApp === 'oled' \? '#000'/, 'o fundo OLED');
assert.match(ler('src/navigation/RootNavigator.tsx'), /fundoApp === 'oled' \? '#000'/, 'as folhas no OLED');
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
assert.match(leitor, /outputRange: \[raioDaMolduraNoMini, capaInteira \? 0 : 20\]/, 'sem cantos');
assert.match(leitor, /raio=\{capaFlutuante \? CAPA_FLUTUANTE\.raio : capaInteira \? 0 : 20\}/);
assert.match(leitor, /sombra: capaFlutuante \? 0 : capaInteira \|\| capaPoster \? 0 :/, 'sem sombra');
assert.match(leitor, /const capaPoster = Platform\.OS === 'ios' && estiloDaCapaCarregado && estiloDaCapa === 'poster'/, 'o Poster');
assert.match(leitor, /\{capaPoster \? \(\s*<FundoDoPoster\s+uri=\{imagemDoPoster\}\s+tom=\{tomDoPoster && ap\.posterMono \? emCinzento\(tomDoPoster\) : tomDoPoster\}\s+mono=\{ap\.posterMono\}\s+altura=\{alturaDoPoster\(vidFull\.y \+ vidFull\.h, H\)\}/, 'o Poster é o fundo');
assert.match(leitor, /const noPoster = Platform\.OS === 'ios' && estiloDaCapa === 'poster';/, 'a foto e a cor só se procuram com o Poster');
assert.match(leitor, /useFotoDoPoster\(noPoster && ap\.posterImagem === 'artista' \? current : null\)/, 'a foto do artista só com "Artist photos"');
assert.match(leitor, /const imagemDoPoster = fotoDoPoster \?\? artSource;/, 'sem foto, a capa');
assert.match(leitor, /useCorDoAmbiente\(noPoster \? \(fotoDoPoster \? fotoPequena\(fotoDoPoster\) : fundo\?\.uri \?\? null\) : null\)/, 'a cor das bordas vem da imagem que se vê');
assert.match(ler('src/components/FundoDoPoster.tsx'), /semCor: \{ backgroundColor: '#808080', mixBlendMode: 'saturation' \}/, 'o preto e branco sem módulo nativo');
assert.match(ler('src/components/FundoDoPoster.tsx'), /\{mono \? <ImagemRN source=\{GRAO\} resizeMode="repeat" style=\{imagem\} \/>/, 'o grão, só na fotografia');
assert.match(leitor, /frenteTransparente=\{!!capaDaFrente\}/, 'a face da frente transparente');
assert.match(leitor, /const corDosControlos = ap\.controlos === 'branco' \? colors\.text : theme\.color;/, 'os controlos brancos');
assert.match(leitor, /\[styles\.playAnel, \{ borderColor: corDosControlos \}\]/, 'o anel do play');
assert.match(leitor, /color=\{saved \? corDosControlos : colors\.text\}/, 'o coração');
assert.match(leitor, /color=\{shuffle \? corDosControlos : colors\.textTertiary\}/, 'o shuffle');
assert.match(leitor, /color=\{repeatMode === 'off' \? colors\.textTertiary : corDosControlos\}/, 'o repeat');
assert.match(leitor, /showLyrics === paraAsLetras && \{ backgroundColor: corDosControlos, opacity: 1 \}/, 'os pontos');
assert.equal((leitor.match(/theme\.color/g) ?? []).length, 3, 'o destaque: nos controlos (se escolhido), no mini-player e no aviso de erro');
assert.match(ler('src/lib/capaFlutuante3D.ts'), /atual === 'poster'\) return atual/, 'o Poster guardado lê-se');
assert.match(ler('src/components/ArtworkLyricsCube.tsx'), /frenteTransparente\?null:<Animated\.View/, 'sem o véu escuro a rodar');
const fundoDoPoster = ler('src/components/FundoDoPoster.tsx');
assert.match(fundoDoPoster, /useNativeDriver: true/, 'a passagem da cor no motor nativo');
assert.match(fundoDoPoster, /degradesDoPoster\(c\)/);
assert.match(leitor, /fonteDosTitulos\(ap\.titulos\)/, 'a letra do título do leitor');
assert.match(leitor, /aEsquerda=\{!tituloAoCentro\}/, 'à esquerda, o título vai com o artista (11/10)');
assert.match(ler('src/components/TextoQueCabe.tsx'), /aEsquerda && styles\.conteudoAEsquerda/, 'o que cabe encosta à esquerda');
assert.match(leitor, /abrirJaNasLetras\(ap\.abrirNasLetras, expanded, letrasDaMusica\)/, 'abrir nas letras');
assert.match(ler('src/components/Screen.tsx'), /fonteDosTitulos\(useAparencia\(\(s\) => s\.titulos\)\)/, 'os títulos das páginas');
assert.match(ler('src/components/LyricsView.tsx'), /tamanhoEscolhido=useAparencia\(s=>s\.tamanhoDasLetras\)/, 'o tamanho das letras acompanha a preferência');
assert.match(ler('src/components/LyricsView.tsx'), /tamanhoDasLetras\(tamanhoEscolhido\)/, 'o tamanho das letras usa a escala comum');
const home = ler('src/screens/SearchScreen.tsx');
assert.match(home, /useAparencia\(useShallow\(\(s\) => secoesVisiveis\(s\)\)\)/, 'a Home lê as secções');
assert.match(home, /secoesDaHome\.map\(\(secao\) => <React\.Fragment key=\{secao\}>\{blocoDaHome\(secao\)\}<\/React\.Fragment>\)/);
for (const x of SECOES_DA_HOME) assert.match(home, new RegExp(`case '${x}': return`), `a Home desenha "${x}"`);
assert.match(ler('src/screens/SettingsScreen.tsx'), /opcoes: ESTILOS_DA_CAPA\.map/, 'o Full também nas Definições');
const personalizar = ler('src/screens/PersonalizarScreen.tsx');
assert.doesNotMatch(personalizar, /perspective|rotateY|rotateX/, 'a pré-visualização sem 3D a sério: no iPhone a metade de trás ficava escondida (11/10)');
assert.match(personalizar, /tituloNoLeitor\(faixa\)/, 'a pré-visualização mostra o título limpo, como o leitor');
const gradiente = ler('src/components/FundoEmGradiente.tsx');
assert.match(gradiente, /if \(!animar \|\| !aFrente \|\| reduzido\) return;/, 'o gradiente pára quando não se vê');
assert.match(gradiente, /pedirFluidez\(PASSAGEM_MS \+ 100\)/, 'os 120 Hz só na passagem das cores');
assert.doesNotMatch(gradiente, /segurarFluidez/, 'e não durante a volta lenta (aquecia)');
assert.match(ler('src/lib/capaFlutuante3D.ts'), /atual === 'full'\) return atual/, 'o Full guardado lê-se');
const fundoDaFolha = ler('src/components/FundoDaFolha.tsx');
assert.match(fundoDaFolha, /fundoDasFolhas\(fundoApp, destaque\)/, 'as folhas leem o fundo da app e o destaque');
assert.doesNotMatch(fundoDaFolha, /from 'expo-blur'|positionMs/, 'o desfoque vem na imagem, e não lê a posição');
assert.match(ler('src/components/BottomSheet.tsx'), /<FundoDaFolha raio=\{radii\.xl\} \/>/, 'o EQ, o Share e as outras');
assert.doesNotMatch(ler('src/components/BottomSheet.tsx'), /backgroundColor: colors\.surfaceHigh/, 'sem o cinzento fixo');
assert.match(ler('src/screens/FilaScreen.tsx'), /<FundoDaFolha \/>/, 'a fila');
assert.match(ler('src/screens/FolhaScreen.tsx'), /<FundoDaFolha \/>/, 'as folhas nativas');
assert.match(ler('src/state/aparencia.ts'), /useCapaIOS\.getState\(\)\.setStyle\(capaDoTema\(id\)\)/, 'o tema muda a capa');
assert.doesNotMatch(ler('src/state/aparencia.ts'), /supabase|prefsSync/, 'fica no aparelho');
// O play de metal do PC no iPhone (23/11, o João: "o metálico com o efeito das luzes", de origem).
assert.equal(PADRAO.play, 'metal', 'de origem');
assert.equal(lerAparencia({ play: 'cheio' }).play, 'metal', 'o cheio guardado antes do metal passa a metal, uma vez');
assert.equal(lerAparencia({ play: 'cheio', metalNoPlay: true }).play, 'cheio', 'escolhido depois, fica');
assert.equal(lerAparencia({ play: 'anel' }).play, 'anel', 'as outras escolhas ficam');
assert.equal(lerAparencia({ play: 'metal' }).play, 'metal');
assert.equal(lerAparencia({}).metalNoPlay, true, 'guarda-se que já leu, ao guardar a seguir');
{
  const disco = ler('src/components/DiscoDeMetal.tsx').replace(/\r\n/g, '\n');
  // Roda só quando o play muda (nunca ao montar), como no PC, pelo driver nativo e a 120 Hz.
  assert.match(disco, /if \(antes\.current === aTocar\) return;/);
  assert.match(disco, /const \{ graus, curva \} = voltaDoDisco\(aTocar\);/, 'as voltas do PC (lib/luz)');
  assert.match(disco, /Animated\.timing\(angulo, \{ toValue: onde\.current, duration: DURACAO_DO_TRAVAO, easing: travao, useNativeDriver: true \}\)/);
  assert.match(disco, /Animated\.spring\(angulo, \{ toValue: onde\.current, \.\.\.SOLTAR, useNativeDriver: true \}\)/);
  assert.match(disco, /pedirFluidez\(/, 'a 120 Hz');
  assert.match(disco, /require\('\.\.\/\.\.\/assets\/reflexo-do-disco\.png'\)/);
  assert.match(disco, /export const CORES_DO_METAL = \['#c4c7ce', '#8f929b', '#5c5f68'\] as const;/, 'as cores do metal do PC');
  assert.match(ler('src/desktop/DiscoDeMetal.web.ts'), /#c4c7ce 0%, #8f929b 48%, #5c5f68 100%/, 'e o PC continua com as mesmas');
  assert.ok(readFileSync(new URL('../assets/reflexo-do-disco@3x.png', import.meta.url)).length > 10000, 'o laço do gerador');
}
assert.match(doLeitor, /<NoMetal ligado=\{ap\.play === 'metal'\} lado=\{62\} aTocar=\{isPlaying\}>/, 'o play do Now Playing');
assert.match(doLeitor, /<NoMetal ligado=\{ap\.play === 'metal'\} lado=\{32\} aTocar=\{isPlaying\}>/, 'e o do mini');
assert.match(ler('src/screens/PersonalizarScreen.tsx'), /nomes: \['Metal', 'Filled', 'Ring', 'Icon'\], valores: \['metal', 'cheio', 'anel', 'icone'\]/);
assert.match(ler('src/i18n/fr.ts'), /"Metal": "Métal",/);
console.log('Aparência: temas (com a capa), Custom, botões, Home, letras, títulos, gradiente e cada opção com quem a lê.');
