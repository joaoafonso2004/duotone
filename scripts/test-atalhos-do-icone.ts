/**
 * Os atalhos do ícone da app (7/10) -- src/lib/atalhosDoIcone.ts,
 * modules/duotone-atalhos e o app.json.
 *
 * Correr: node --experimental-strip-types scripts/test-atalhos-do-icone.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acaoDoAtalho, ATALHOS_DO_ICONE } from '../src/lib/atalhosDoIcone.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// Os do app.json (o Info.plist) são exatamente os que o código sabe executar.
const app = JSON.parse(ler('app.json'));
const itens = app.expo.ios.infoPlist.UIApplicationShortcutItems as Record<string, string>[];
assert.deepEqual(itens.map((i) => i.UIApplicationShortcutItemType), ATALHOS_DO_ICONE.map((a) => a.tipo));
assert.deepEqual(itens.map((i) => i.UIApplicationShortcutItemTitle), ATALHOS_DO_ICONE.map((a) => a.titulo));
assert.deepEqual(itens.map((i) => i.UIApplicationShortcutItemIconSymbolName), ATALHOS_DO_ICONE.map((a) => a.simbolo));
assert.ok(itens.length <= 4, 'o iOS mostra no máximo quatro');

assert.equal(acaoDoAtalho('com.joao.duotone.continuar'), 'continuar');
assert.equal(acaoDoAtalho('com.joao.duotone.mistura-do-dia'), 'mistura-do-dia');
assert.equal(acaoDoAtalho('com.joao.duotone.baralhar-gostadas'), 'baralhar-gostadas');
assert.equal(acaoDoAtalho('outra.coisa'), null, 'um tipo que não é nosso não faz nada');

// O módulo nativo: recebe pelo AppDelegate e guarda até o JS ouvir.
const config = JSON.parse(ler('modules/duotone-atalhos/expo-module.config.json'));
assert.deepEqual(config.apple.appDelegateSubscribers, ['DuotoneAtalhosAppDelegate']);
assert.deepEqual(config.apple.modules, ['DuotoneAtalhosModule']);
const swift = ler('modules/duotone-atalhos/ios/DuotoneAtalhosModule.swift');
assert.match(swift, /public class DuotoneAtalhosAppDelegate: ExpoAppDelegateSubscriber/);
assert.match(swift, /performActionFor shortcutItem: UIApplicationShortcutItem/);
assert.match(swift, /Function\("tirarPendente"\)/, 'um arranque a frio guarda o atalho até o JS o pedir');
const ponte = ler('modules/duotone-atalhos/index.ts');
assert.ok(ponte.indexOf("addListener('onAtalho'") < ponte.indexOf('nativo.tirarPendente()'), 'ouve primeiro, lê o pendente depois');

// Ligado no iPhone, só com conta.
assert.match(ler('src/navigation/RootNavigator.tsx'), /useAtalhosDoIcone\(session\?\.user\.id \?\? null\);/);
const hook = ler('src/hooks/useAtalhosDoIcone.ts');
assert.match(hook, /if \(Platform\.OS === 'web' \|\| !userId\) return;/);
assert.match(hook, /executarAtalhoDoIcone\(tipo/, 'executa pelo que é partilhado com a lista de saltos do Windows');
assert.match(ler('src/state/atalhosDoIcone.ts'), /await sessaoLida\(\);/, 'o Resume espera pela sessão guardada do leitor');
assert.match(ler('src/navigation/RootNavigator.web.tsx'), /useBarraDeTarefas\(notify\);/, 'no PC, a lista de saltos faz o mesmo');

console.log('Atalhos do ícone: o app.json, o módulo e o que cada um faz batem certo.');
