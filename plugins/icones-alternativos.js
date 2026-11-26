const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Os ícones alternativos da app (26/11, item 9 do plano de melhorias): Customise ›
 * App icon (`src/lib/iconeDaApp.ts`, `modules/duotone-icone`).
 *
 * Cada um entra no catálogo da app como um conjunto de ícone próprio (um PNG de
 * 1024, como o `AppIcon` que o Expo gera), e o alvo da app diz ao Xcode quais são
 * os alternativos (`ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES`): é o Xcode que
 * escreve o `CFBundleAlternateIcons` no Info.plist. O `ios/` não está no repositório
 * (é gerado a cada prebuild), por isso é aqui que vive.
 */
const ICONES = {
  // O de sempre, também como alternativo: voltar a ele com o `nil` do iOS não
  // voltava no iPhone do João (26/11). Uma cópia em PNG do assets/icon.png (que é um JPEG).
  AppIconOriginal: 'assets/icones/icone-original.png',
  AppIconMetal: 'assets/icones/icone-metal.png',
  AppIconTwoTone: 'assets/icones/icone-twotone.png',
  AppIconLight: 'assets/icones/icone-light.png',
  AppIconNight: 'assets/icones/icone-night.png',
};

const CONTENTS = (ficheiro) => JSON.stringify({
  images: [{ filename: ficheiro, idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'expo', version: 1 },
}, null, 2);

module.exports = function iconesAlternativos(config) {
  // 1. Os conjuntos no catálogo da app.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const catalogo = path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName, 'Images.xcassets');
      for (const [nome, origem] of Object.entries(ICONES)) {
        const pasta = path.join(catalogo, `${nome}.appiconset`);
        fs.mkdirSync(pasta, { recursive: true });
        fs.copyFileSync(path.join(cfg.modRequest.projectRoot, origem), path.join(pasta, 'icone.png'));
        fs.writeFileSync(path.join(pasta, 'Contents.json'), CONTENTS('icone.png'));
      }
      return cfg;
    },
  ]);

  // 2. O alvo da APP (o primeiro; o dos botões e da Live Activity não) diz quais são.
  config = withXcodeProject(config, (cfg) => {
    const projeto = cfg.modResults;
    const alvo = projeto.getFirstTarget().firstTarget;
    const lista = projeto.pbxXCConfigurationList()[alvo.buildConfigurationList];
    const seccao = projeto.pbxXCBuildConfigurationSection();
    for (const { value } of lista.buildConfigurations) {
      const ajustes = seccao[value].buildSettings;
      ajustes.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${Object.keys(ICONES).join(' ')}"`;
      ajustes.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = 'YES';
    }
    return cfg;
  });

  return config;
};

module.exports.ICONES = ICONES;
