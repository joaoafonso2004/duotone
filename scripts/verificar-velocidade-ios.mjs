// Corre depois do pod install: a proteção da velocidade tem de chegar ao IPA.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const raiz = new URL('../', import.meta.url);
const ler = file => fs.readFileSync(new URL(file, raiz), 'utf8');
const pacote = JSON.parse(ler('package.json'));
assert.ok(pacote.expo?.autolinking?.ios?.buildFromSource?.includes('expo-video'), 'ExpoVideo tem de compilar da fonte');
const fonte = ler('node_modules/expo-video/ios/VideoPlayer.swift');
assert.match(fonte, /if ref\.rate != playbackRate \{ ref\.rate = playbackRate \}/, 'O prebuild não aplicou a proteção contra escritas repetidas');
assert.match(fonte, /playbackRate = player\.defaultRate/, 'A sincronização do KVO tem de continuar presente');
const pods = ler('ios/Pods/Pods.xcodeproj/project.pbxproj');
assert.match(pods, /VideoPlayer\.swift in Sources/, 'O projeto Pods não inclui VideoPlayer.swift: a proteção ficaria fora do IPA');
console.log('iOS: ExpoVideo compilado da fonte, velocidade sem escrita repetida e KVO preservado.');
