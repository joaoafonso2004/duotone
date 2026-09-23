const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Dois remendos ao VideoPlayer.swift do expo-video, os dois pela mesma razão:
 * a velocidade desta app é mudada pelo módulo nativo (`modules/duotone-audio`,
 * `aplicarVelocidade`), e o expo-video não pode desfazer o que ele fez.
 *
 * 1. O setter só escreve no AVPlayer o que é mesmo diferente (22/9).
 *
 * 2. A vigia da taxa deixa de ADOTAR o `defaultRate` (23/9). A regra do
 *    expo-video é: se o `defaultRate` do AVPlayer não bate com o valor que ele
 *    guardou, alguém mudou a velocidade nos controlos nativos do vídeo -- e ele
 *    adota esse valor e ESCREVE-O no leitor. Esta app não mostra controlos
 *    nativos nenhuns (não há VideoView), por isso a regra nunca serve e só
 *    estraga: o módulo nativo aplica a velocidade num bloco na thread
 *    principal, e numa janela entre dois toques o `defaultRate` e o valor do
 *    expo-video discordam. A vigia acordava aí e repunha a velocidade ANTERIOR
 *    ("fica um clique atrás") -- e, como uma pausa é uma mudança de taxa,
 *    escrevia uma taxa diferente de zero no leitor em pausa, que no
 *    AVFoundation É tocar ("carrego na pausa e continua a tocar"). O ramo do
 *    iOS < 16 fica como estava: lá o módulo nativo não mexe na velocidade.
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
