const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Dois remendos ao VideoPlayer.swift do expo-video: o setter da velocidade só
 * escreve o que é mesmo diferente (22/9), e a vigia da taxa deixa de ADOTAR o
 * defaultRate (23/9).
 *
 * ATENÇÃO -- NÃO CHEGAM AO IPHONE. No SDK 57 o ExpoVideo vem PRÉ-COMPILADO
 * (`[Expo-precompiled] ExpoVideo` no log do pod install): o binário não é
 * construído a partir do node_modules, e este remendo ao código-fonte fica
 * de fora. Descobriu-se a 23/9, com uma build que dependia dele: a segunda
 * mudança de velocidade ficava na primeira. A app tem de estar certa SEM ele
 * (ver src/lib/velocidadeDoMotor.ts e o modelo em
 * scripts/test-mudanca-velocidade.cjs, que corre com a adoção ligada). Fica
 * aqui porque não faz mal e passa a valer se o ExpoVideo voltar a compilar do
 * código-fonte -- e o teste confere que ainda se aplica à versão instalada.
 */
const before = `      if #available(iOS 16.0, tvOS 16.0, *) {
        ref.defaultRate = playbackRate
      }
      ref.rate = playbackRate`;
const after = `      // Duotone: KVO sync after playImmediately must not write the same rate again.
      if #available(iOS 16.0, tvOS 16.0, *) {
        if ref.defaultRate != playbackRate { ref.defaultRate = playbackRate }
      }
      if ref.rate != playbackRate { ref.rate = playbackRate }`;

const vigiaAntes = `    if #available(iOS 16.0, tvOS 16.0, *) {
      if player.defaultRate != playbackRate {
        // User changed the playback speed in the native controls. Update the desiredRate variable
        playbackRate = player.defaultRate
      }
    } else if newRate != 0 && newRate != playbackRate {`;
const vigiaDepois = `    if #available(iOS 16.0, tvOS 16.0, *) {
      // Duotone: speed belongs to modules/duotone-audio and there are no native
      // controls. Adopting defaultRate here put the previous speed back and
      // turned a pause into play (plugins/velocidade-expo-video.js).
    } else if newRate != 0 && newRate != playbackRate {`;

function trocar(text, antes, depois, nome) {
  if (text.includes(depois)) return text;
  if (text.split(antes).length !== 2) {
    throw new Error(`expo-video ${nome} changed. Review velocidade-expo-video before building iOS.`);
  }
  return text.replace(antes, depois);
}

function patchSpeedSetter(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let text = source.replace(/\r\n/g, '\n');
  text = trocar(text, before, after, 'speed setter');
  text = trocar(text, vigiaAntes, vigiaDepois, 'rate watcher');
  return text.replace(/\n/g, newline);
}
module.exports = config => withDangerousMod(config, ['ios', async config => {
  const pkg = require.resolve('expo-video/package.json', { paths: [config.modRequest.projectRoot] });
  const file = path.join(path.dirname(pkg), 'ios', 'VideoPlayer.swift');
  const original = fs.readFileSync(file, 'utf8');
  const patched = patchSpeedSetter(original);
  if (patched !== original) fs.writeFileSync(file, patched);
  return config;
}]);
module.exports.patchSpeedSetter = patchSpeedSetter;
