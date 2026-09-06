const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const FICHEIRO = 'AtalhosDoDuotone.swift';

/**
 * Põe as frases da Siri dentro do alvo principal da app.
 *
 * Porquê um plugin e não um ficheiro no módulo nativo: o Xcode só extrai um
 * `AppShortcutsProvider` do alvo da APP. Enquanto isto viveu no pod
 * `DuotoneIntents`, as ações eram extraídas na mesma -- apareciam na app
 * Atalhos -- mas o `autoShortcuts` do `Metadata.appintents` saía vazio, e a
 * Siri respondia "não posso fazer isso" a todas as frases. Confirmado a abrir
 * o .ipa da 1.11.1.
 *
 * E porquê copiar em vez de acrescentar à mão no Xcode: o `ios/` não está no
 * repositório, é gerado a cada `expo prebuild --clean`. Um ficheiro
 * arrastado para o projeto desaparecia na geração seguinte.
 */
module.exports = function atalhosDaSiri(config) {
  // 1. Pôr o ficheiro no sítio, dentro da pasta do alvo.
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const origem = path.join(cfg.modRequest.projectRoot, 'plugins', 'ios', FICHEIRO);
      const pasta = path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName);
      fs.mkdirSync(pasta, { recursive: true });
      fs.copyFileSync(origem, path.join(pasta, FICHEIRO));
      return cfg;
    },
  ]);

  // 2. Declará-lo nas Sources do alvo, senão fica no disco sem ser compilado.
  config = withXcodeProject(config, (cfg) => {
    const projeto = cfg.modResults;
    const alvo = cfg.modRequest.projectName;
    const caminho = `${alvo}/${FICHEIRO}`;

    // O prebuild pode correr sobre um projeto já gerado; não duplicar.
    if (projeto.hasFile(caminho)) return cfg;

    const grupo = projeto.findPBXGroupKey({ name: alvo });
    if (!grupo) {
      throw new Error(`atalhos-da-siri: não encontrei o grupo "${alvo}" no projeto Xcode.`);
    }
    projeto.addSourceFile(caminho, { target: projeto.getFirstTarget().uuid }, grupo);
    return cfg;
  });

  return config;
};
