const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * O setter da velocidade só escreve no AVPlayer o que mudou.
 *
 * O módulo nativo aplica a taxa primeiro. O KVO do Expo adota o defaultRate
 * e passa por este setter; repetir `ref.rate = playbackRate` já com o valor
 * certo acrescentava outra escrita à mesma mudança, também com o EQ ligado.
 * A adoção do KVO fica intacta: mantém o valor do Expo e o AVPlayer em acordo.
 *
 * O package.json obriga só o expo-video a compilar da fonte. Sem isso o SDK
 * 57 usava um binário pré-compilado e esta proteção ficava fora do iPhone.
 * A CI confirma também que VideoPlayer.swift entrou nas fontes dos Pods.
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
  // Desfazer o remendo antigo se o prebuild já o tinha aplicado no node_modules.
  // O KVO original é necessário; a proteção pertence ao setter que ele chama.
  if (text.includes(vigiaDepois)) text = trocar(text, vigiaDepois, vigiaAntes, 'legacy rate watcher');
  if (!text.includes(vigiaAntes)) throw new Error('expo-video rate watcher changed. Review velocidade-expo-video before building iOS.');
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
