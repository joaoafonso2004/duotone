// A personalização do iPhone (10/10, fase 1 do docs/PLANO-PERSONALIZACAO-IOS.md).
// Correr: node --experimental-strip-types scripts/test-aparencia.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  alternarBotao, alturaDaLinha, aplicarTema, BOTOES_DO_LEITOR, destinoDaOrigem, lerAparencia, MAXIMO_DE_BOTOES,
  olhoDaOrigem, PADRAO, TEMAS, temaDe, veuDoLeitor,
} from '../src/lib/aparencia.ts';

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
assert.doesNotMatch(ler('src/state/aparencia.ts'), /supabase|prefsSync/, 'fica no aparelho');
console.log('Aparência: temas, Custom, botões, leitura do guardado e cada opção com quem a lê.');
