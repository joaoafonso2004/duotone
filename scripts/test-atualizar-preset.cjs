// Painéis e hook reais, com React/saída/armazenamento substituídos. Executa o
// percurso escolher → ajustar → Update, sem áudio nem pedidos de rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');
function carregar(ficheiro, duplos) {
  const module = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(path.join(raiz, ficheiro), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(codigo, { module, exports: module.exports, require: nome => {
    assert.ok(nome in duplos, `${ficheiro}: import sem duplo: ${nome}`); return duplos[nome];
  }, fetch() { throw Error('Rede proibida neste teste'); } });
  return module.exports;
}
function hooks() {
  const instancias = new Map();
  let atual;
  const iguais = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const slot = () => [atual.slots, atual.i++];
  const useMemo = (fn, deps) => { const [s, i] = slot(); if (!s[i] || !iguais(s[i].deps, deps)) s[i] = { deps, valor: fn() }; return s[i].valor; };
  return {
    React: {
      memo: fn => fn, useMemo, useCallback: (fn, deps) => useMemo(() => fn, deps),
      useRef(current) { const [s, i] = slot(); return s[i] ??= { current }; },
      useState(inicial) { const [s, i] = slot(); s[i] ??= { valor: typeof inicial === 'function' ? inicial() : inicial }; return [s[i].valor, v => { s[i].valor = typeof v === 'function' ? v(s[i].valor) : v; }]; },
      useEffect(fn, deps) { const [s, i] = slot(); if (s[i] && iguais(s[i].deps, deps)) return; const anterior = s[i]; s[i] = { deps }; atual.efeitos.push(() => { anterior?.limpar?.(); s[i].limpar = fn(); }); },
      createElement: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children } : {}) } }),
    },
    render(fn, props, nome) {
      const instancia = instancias.get(nome) ?? { slots: [] }; instancias.set(nome, instancia);
      atual = instancia; atual.i = 0; atual.efeitos = [];
      const arvore = fn(props);
      for (const efeito of atual.efeitos) efeito();
      return arvore;
    },
    desmontar(nome) { const instancia = instancias.get(nome); instancia?.slots.forEach(s => s?.limpar?.()); instancias.delete(nome); },
  };
}
const todos = n => Array.isArray(n) ? n.flatMap(todos) : !n || typeof n !== 'object' ? [] : [n, ...todos(n.props?.children)];
const texto = n => Array.isArray(n) ? n.map(texto).join('') : typeof n === 'string' ? n : texto(n?.props?.children ?? []);
const eq = carregar('src/lib/equalizer.ts', {});
const regras = carregar('src/lib/presetsDoEqualizador.ts', { './equalizer': eq });
const TOP = [3, 1, 0, 2, 0, 0, 0, 0, 0, 1];
const OUTRO = [0, 0, 0, 0, 2, 0, 0, 1, 0, 0];

for (const plataforma of ['ios', 'windows']) {
  const h = hooks();
  let memoria = regras.criarPreset({}, 'u-top', 'Top', TOP, 100);
  memoria = regras.criarPreset(memoria, 'u-outro', 'Other', OUTRO, 200);
  memoria = regras.definirPresetDoCarro(memoria, 'u-top', 300);
  const escritas = [], avisos = [];
  let recomendado = false, visivel = true, relogio = 1000;
  const player = { current: { source: 'youtube', sourceId: 'A' }, eqGanhos: TOP.slice(), carro: null, playbackRate: 1, eqAtivo: true, ajustesPorFaixa: {} };
  const mudar = g => { player.eqGanhos = g; recomendado = false; };
  player.setEqGanhos = mudar;
  const presets = {
    usePresets: selector => selector({ memoria }),
    mudarPresets: fn => { const nova = fn(memoria, ++relogio); if (nova !== memoria) escritas.push(Object.keys(nova).filter(k => nova[k] !== memoria[k])); memoria = nova; },
  };
  const usePlayer = selector => selector(player);
  const edicao = carregar('src/hooks/useEdicaoDoPreset.ts', { react: h.React, '../lib/presetsDoEqualizador': regras, '../state/presets': presets });
  const native = { Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: { create: s => s } };
  const comuns = {
    react: h.React, 'react-native': native,
    '../lib/equalizer': eq, '../lib/presetsDoEqualizador': regras,
    '../state/presets': presets, '../state/player': { usePlayer, ganhosEmVigor: s => s.eqGanhos, segueABase: () => false },
    '../hooks/useEdicaoDoPreset': edicao, '../hooks/useVelocidadePresa': { useVelocidadePresa: () => null },
    '../state/recomendado': { useRecomendadoNaFaixa: () => recomendado, useRecomendado: sel => sel({ ligado: false }), escolherRecomendadoNaFaixa: () => { recomendado = true; } },
    '../lib/avisoDeRemocao': { avisarFeito: aviso => avisos.push(aviso) },
  };
  const equalizador = carregar('src/components/Equalizador.tsx', {
    react: h.React, 'react-native': native, 'react-native-gesture-handler': { PanGestureHandler: 'Pan', State: {} },
    '../lib/equalizer': eq, '../lib/presetsDoEqualizador': regras, '../lib/haptics': { hapticSelection() {} },
    '../theme': { colors: {}, spacing: {}, radii: {}, type: {} }, './SelectionPill': { SelectionPill: 'SelectionPill' },
  });
  const desktop = carregar('src/desktop/PainelEqualizador.web.tsx', {
    ...comuns, '../components/AdjustmentSyncStatus': { AdjustmentSyncStatus: 'Sync' }, '../components/SelectionPill': { SelectionPill: 'SelectionPill' },
    './RecomendadoDoEq.web': { EscolhaDoModelo: 'Modelo', LinhaDoRecomendado: 'Recomendado' }, './BarraVelocidade.web': { BarraVelocidade: 'Velocidade' },
    './tokens.web': { COR: {}, ESP: {}, ESTADO: {}, RAIO: {}, TIPO: {} }, './ui.web': { Button: 'Button', Field: 'Input', ui: {} },
  });
  const iphone = carregar('src/components/EqualizadorSheet.tsx', {
    ...comuns, './AdjustmentSyncStatus': { AdjustmentSyncStatus: 'Sync' }, '@expo/vector-icons/Ionicons': 'Icon',
    '../lib/haptics': { hapticNotification() {}, hapticSelection() {} }, '../state/carro': { useSaidaDeAudio: sel => sel({ saida: null }) },
    './RecomendadoDoEq': { EscolhaDoModelo: 'Modelo', LinhaDoRecomendado: 'Recomendado' }, './Toque': { Toque: 'Toque' },
    '../theme': { colors: {}, spacing: {}, radii: {}, type: {} }, './BarraVelocidade': { BarraVelocidade: 'Velocidade' },
    './BottomSheet': { BottomSheet: 'Sheet', BottomSheetGestureGuard: 'Guard', BottomSheetScrollView: 'Scroll' },
    './Equalizador': equalizador, './Input': { Input: 'Input' }, './PillButton': { PillButton: 'Button' },
  });
  const painelFn = plataforma === 'ios' ? iphone.EqualizadorSheet : desktop.PainelEqualizador;
  const bandasFn = plataforma === 'ios' ? equalizador.Equalizador : desktop.BandasDoEqualizador;
  const desenhar = () => h.render(painelFn, plataforma === 'ios' ? { visible: visivel, onClose() {} } : { ganhos: player.eqGanhos, aoMudarGanhos: mudar, rate: 1, activo: true, lembrado: true }, 'painel');
  const bandas = () => todos(desenhar()).find(n => n.type === bandasFn);
  const mudarBanda = ganhos => { const p = bandas().props; (p.aoMudar ?? p.aoMudarGanhos)(ganhos); };
  const escolher = nome => { const b = bandas(); const arvore = h.render(bandasFn, b.props, 'bandas'); const p = todos(arvore).find(n => n.type === 'SelectionPill' && n.props.label === nome); assert.ok(p, nome); p.props.onPress(); };
  const botao = label => todos(desenhar()).find(n => n.props?.label === label || (n.type === 'Button' && texto(n) === label));
  const update = () => todos(desenhar()).find(n => (n.props?.label ?? texto(n)).startsWith('Update “'));
  assert.equal(update(), undefined);
  escolher('Top');
  const novos = TOP.map((v, i) => v + (i === 0 ? 1 : 0));
  mudarBanda(novos);
  assert.equal(escritas.length, 0, `${plataforma}: ajustar não escreve o preset`);
  assert.ok(botao('Update “Top”'), `${plataforma}: mantém o nome depois de mexer`);
  botao('Update “Top”').props.onPress();
  assert.deepEqual(escritas, [['u-top']], 'substitui uma linha, não cria um id');
  assert.equal(memoria['u-top'].nome, 'Top');
  assert.equal(memoria['u-top'].criado, 100);
  assert.equal(regras.presetDoCarro(memoria).id, 'u-top');
  assert.deepEqual(Array.from(memoria['u-top'].ganhos), novos);
  assert.equal(update(), undefined, 'depois de guardar não há alterações pendentes');
  assert.equal(avisos.at(-1), 'Preset updated');

  // Duas curvas iguais: a identidade vem do toque, não da primeira igualdade.
  memoria = regras.editarPreset(memoria, 'u-outro', { ganhos: novos }, 2000);
  h.desmontar('painel');
  escolher('Other');
  mudarBanda(OUTRO);
  assert.ok(botao('Update “Other”'), 'escolher e aplicar no mesmo toque preserva o segundo id');
  assert.equal(botao('Update “Top”'), undefined);
  botao('Update “Other”').props.onPress();
  assert.deepEqual(escritas.at(-1), ['u-outro']);

  escolher('Top');
  mudarBanda(eq.PLANO.slice());
  assert.ok(botao('Update “Top”'), 'também se pode substituir por uma curva plana');
  botao('Update “Top”').props.onPress();
  assert.deepEqual(Array.from(memoria['u-top'].ganhos), Array.from(eq.PLANO));
  escolher('Bass boost');
  mudarBanda(novos);
  assert.equal(update(), undefined, 'os presets de origem não se substituem aqui');
  escolher('Other');
  escolher('Recommended');
  mudarBanda(novos);
  assert.equal(update(), undefined, 'Recommended limpa a edição anterior');

  escolher('Other');
  mudarBanda(novos);
  const antesDaTroca = memoria['u-outro'];
  const saveAs = todos(desenhar()).find(n => n.type === equalizador.BotaoGuardarPreset || n.props?.rotulo === 'SAVE AS PRESET');
  assert.ok(saveAs, 'continua a haver Save as preset');
  (saveAs.props.aoGuardar ?? saveAs.props.aoPremir)();
  todos(desenhar()).find(n => n.type === 'Input').props.onChangeText('Copy');
  botao('Save').props.onPress();
  assert.equal(memoria['u-outro'], antesDaTroca, 'guardar uma cópia não substitui o selecionado');
  assert.ok(regras.resolverPresets(memoria).find(p => p.nome === 'Copy'));
  mudarBanda(OUTRO);
  assert.ok(botao('Update “Copy”'), 'a cópia recém-criada também pode ser atualizada');

  player.current = { source: 'youtube', sourceId: 'B' };
  player.eqGanhos = [4, 4, 4, 4, 0, 0, 0, 0, 0, 0];
  assert.equal(update(), undefined, 'outra música não herda o preset em edição');
  escolher('Other');
  mudarBanda(novos);
  if (plataforma === 'ios') { visivel = false; desenhar(); visivel = true; } else h.desmontar('painel');
  assert.equal(update(), undefined, 'fechar e voltar a abrir não herda a edição');
  escolher('Other');
  mudarBanda(novos);
  const antigo = botao('Update “Other”');
  memoria = regras.apagarPreset(memoria, 'u-outro', 4000);
  const antes = escritas.length;
  antigo.props.onPress();
  assert.equal(escritas.length, antes, 'um toque atrasado não ressuscita um preset apagado');
  assert.equal(update(), undefined);
  console.log(`${plataforma}: selecionar, editar, substituir, copiar e as guardas passaram.`);
}
