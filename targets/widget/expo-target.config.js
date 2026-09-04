/**
 * O alvo do widget, gerado a cada `expo prebuild`.
 *
 * O projecto iOS nao esta no repositorio -- o CI gera-o do zero. Um alvo
 * acrescentado a mao no Xcode desaparecia na geracao seguinte; declarado aqui,
 * e reconstruido de cada vez.
 *
 * O App Group tem de ser LETRA POR LETRA o mesmo do DuotoneWidgetModule.swift.
 * Se divergirem, a app escreve num sitio e o widget le noutro, e o sintoma e
 * um widget vazio sem erro nenhum.
 */
module.exports = {
  type: 'widget',
  // O alvo principal já se chama Duotone. Repetir o nome aqui colide no
  // projecto Xcode gerado; o displayName pode continuar a ser o da app.
  name: 'DuotoneWidget',
  displayName: 'Duotone',
  bundleIdentifier: '.widget',
  icon: '../../assets/icon.png',
  entitlements: {
    'com.apple.security.application-groups': ['group.com.joao.duotone'],
  },
  deploymentTarget: '16.4',
};
