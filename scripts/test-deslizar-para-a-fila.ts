// Deslizar uma música para a direita põe-na na fila (29/9, iPhone,
// components/DeslizarParaAFila.tsx). Os componentes importam o React Native e
// não abrem em Node puro, por isso lê-se o código como texto.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const gesto = ler('src/components/DeslizarParaAFila.tsx');
const linha = ler('src/components/TrackRow.tsx');

assert.match(gesto, /activeOffsetX=\{12\}\s*failOffsetY=\{\[-10, 10\]\}/,
  'só um gesto claramente horizontal e para a DIREITA (a esquerda é o tirar da fila; o vertical é o scroll)');
assert.match(gesto, /Animated\.event\(\[\{ nativeEvent: \{ translationX: dedo \} \}\], \{ useNativeDriver: true \}\)/,
  'o dedo é seguido no motor nativo (auditoria 3.1): uma folha nativa não lhe rouba o gesto');
assert.match(gesto, /if \(state === State\.END && translationX >= LIMIAR_DA_FILA\) \{\s*hapticNotification\(\);\s*acaoRef\.current\(\);/,
  'passado o limiar, põe na fila e vibra');
assert.match(gesto, /Animated\.spring\(dedo, \{ toValue: 0/, 'a linha volta sempre ao sítio');
assert.doesNotMatch(gesto, /PanResponder.create/, 'nada de PanResponder: corre no JavaScript');
assert.match(gesto, /translateX: Animated\.subtract\(dx, LARGURA_DA_FAIXA\)/,
  'a cor só existe na faixa que a linha destapa: a linha é transparente');
assert.match(gesto, /if \(!ativo\) return <>\{children\}<\/>;/, 'desligado, não embrulha nada');
assert.match(gesto, /accessibilityActions=\{\[\{ name: 'addToQueue', label: 'Add to queue' \}\]\}/,
  'o VoiceOver tem o mesmo gesto como ação');

assert.match(linha, /const podeDeslizar = deslizarParaAFila \?\? \(!selectMode && !onLongPress\);/,
  'ligado por omissão, desligado na seleção e onde o toque longo arrasta (fila, edição de playlist)');
assert.match(linha, /<DeslizarParaAFila ativo=\{podeDeslizar\} aoPorNaFila=\{\(\) => usePlayer\.getState\(\)\.addToQueue\(track\)\}>/,
  'o mesmo addToQueue do menu (numa Jam, sugere na fila partilhada)');

console.log('Deslizar para a fila: passou.');
