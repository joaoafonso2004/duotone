const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const before = `      if #available(iOS 16.0, tvOS 16.0, *) {
        ref.defaultRate = playbackRate
      }
      ref.rate = playbackRate`;
const after = `      // Duotone: KVO sync after playImmediately must not write the same rate again.
      if #available(iOS 16.0, tvOS 16.0, *) {
        if ref.defaultRate != playbackRate { ref.defaultRate = playbackRate }
      }
      if ref.rate != playbackRate { ref.rate = playbackRate }`;

function patchSpeedSetter(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const text = source.replace(/\r\n/g,'\n');
  if (text.includes(after)) return source;
  if (text.split(before).length !== 2) {
    throw new Error('expo-video speed setter changed. Review velocidade-expo-video before building iOS.');
  }
  return text.replace(before,after).replace(/\n/g,newline);
}
module.exports = config => withDangerousMod(config,['ios',async config => {
  const pkg = require.resolve('expo-video/package.json',{paths:[config.modRequest.projectRoot]});
  const file = path.join(path.dirname(pkg),'ios','VideoPlayer.swift');
  const original = fs.readFileSync(file,'utf8');
  const patched = patchSpeedSetter(original);
  if (patched !== original) fs.writeFileSync(file,patched);
  return config;
}]);
module.exports.patchSpeedSetter = patchSpeedSetter;
