/**
 * O ecrã bloqueado do iPhone (10/11, o João: "não tens como personalizar mais?
 * locked screen" e "faz o básico"):
 *   1. a capa que o iOS mostra (no cartão, em grande e no fundo) a dois tons,
 *      como as capas do PC -- uma opção nas Definições, desligada de origem;
 *   2. botões do Duotone para os cantos de baixo e para o Centro de Controlo
 *      (iOS 18), que abrem `duotone://controlo/<ação>` -- sem App Group.
 *
 * O Swift só o CI compila; aqui confere-se o que se pode ler.
 * Correr: node --experimental-strip-types scripts/test-ecra-bloqueado.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acaoDoLink, ATALHOS_DO_ICONE, eLinkDeControlo } from '../src/lib/atalhosDoIcone.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

console.log('\n1 · a capa a dois tons');
caso('o módulo desenha a capa no estilo escolhido, com as contas do PC', () => {
  const sw = ler('modules/duotone-remote-commands/ios/DuotoneRemoteCommandsModule.swift');
  assert.match(sw, /Function\("setArtworkStyle"\) \{ \(estilo: String\) in/);
  assert.match(sw, /let limpa = estilo == "duotone" \? self\.emDoisTons\(semBarras\) : semBarras/);
  assert.match(sw, /let chave = urls\.first\.map \{ "\\\(estilo\)\|\\\(\$0\)" \} \?\? ""/, 'o estilo faz parte da chave da cache');
  for (const pedaco of ['kCIInputContrastKey: 1.12', 'x: 1.04', '0xcf / 255.0', '0xd3 / 255.0', '0xde / 255.0', '"CIMaximumCompositing"', 'red: 0x0a / 255.0']) {
    assert.ok(sw.includes(pedaco), pedaco);
  }
  const pc = ler('src/lib/doisTons.ts');
  assert.match(pc, /TOM_ESCURO = '#0a0b10'/, 'o escuro é o do PC');
  assert.match(pc, /TOM_CLARO = '#cfd3de'/, 'o claro é o do PC');
});
caso('desligada de origem; o arranque aplica-a; a opção está nas Definições do iPhone', () => {
  assert.match(ler('src/lib/prefs.ts'), /return getBool\(KEY_CAPA_DO_ECRA_BLOQUEADO, false\);/);
  assert.match(ler('App.tsx'), /getCapaDoEcraBloqueadoADoisTons\(\)\.then\(\(sim\) => definirEstiloDaCapaDoEcraBloqueado\(sim \? 'duotone' : 'original'\)\)/);
  assert.match(ler('src/screens/SettingsScreen.tsx'), /<LinhaInterruptor icone="contrast-outline" rotulo="Two-tone lock screen" valor=\{capaADoisTons\}/);
  assert.match(ler('modules/duotone-remote-commands/index.ts'), /native\?\.setArtworkStyle\?\.\(estilo\);/, 'um binário antigo sem a função não parte');
});

console.log('\n2 · os botões do ecrã bloqueado');
caso('cada ação tem o seu link; os outros links não são nossos', () => {
  assert.equal(acaoDoLink('duotone://controlo/continuar'), 'continuar');
  assert.equal(acaoDoLink('duotone://controlo/mistura-do-dia/'), 'mistura-do-dia');
  assert.equal(acaoDoLink(' duotone://controlo/baralhar-gostadas?de=ecra '), 'baralhar-gostadas');
  assert.equal(acaoDoLink('duotone://controlo/apagar-tudo'), null);
  assert.equal(acaoDoLink('duotone://social'), null);
  assert.equal(acaoDoLink(null), null);
  assert.equal(eLinkDeControlo('duotone://controlo/continuar'), true);
  assert.equal(eLinkDeControlo('duotone://social'), false);
});
caso('o alvo tem um botão por ação, cada um a abrir o link dela, e nenhum App Group', () => {
  const sw = ler('targets/controlos/index.swift');
  for (const a of ATALHOS_DO_ICONE) {
    assert.ok(sw.includes(`abrir("${a.acao}")`), a.acao);
    assert.ok(sw.includes(`Label("${a.titulo}", systemImage: "${a.simbolo}")`), `${a.acao}: o nome e o símbolo das ações rápidas`);
    assert.ok(sw.includes(`kind: "com.joao.duotone.controlo.${a.acao}"`), a.acao);
  }
  assert.match(sw, /OpenURLIntent\(URL\(string: "duotone:\/\/controlo\/\\\(acao\)"\)/);
  assert.match(sw, /if #available\(iOS 18\.0, \*\) \{/, 'antes do iOS 18 não oferece nada, e a app instala-se na mesma');
  const cfg = ler('targets/controlos/expo-target.config.js');
  assert.match(cfg, /type: 'widget'/);
  assert.match(cfg, /deploymentTarget: '16\.4'/);
  assert.doesNotMatch(cfg, /application-groups|entitlements/);
});
caso('o plugin é o mesmo que já compilou no CI (5.0.0), e a app trata os links', () => {
  assert.match(ler('package.json'), /"@bacons\/apple-targets": "5\.0\.0"/);
  assert.match(ler('app.json'), /"@bacons\/apple-targets"/);
  const hook = ler('src/hooks/useAtalhosDoIcone.ts');
  assert.match(hook, /void Linking\.getInitialURL\(\)\.then\(\(url\) => \{\n\s+const acao = acaoDoLink\(url\);/);
  assert.match(hook, /Linking\.addEventListener\('url', \(\{ url \}\) => \{/);
  assert.match(ler('src/navigation/RootNavigator.tsx'), /filter: \(url\) => !eLinkDeControlo\(url\),/, 'a navegação não procura um ecrã "controlo"');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
