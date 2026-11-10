/**
 * O alvo dos botões do Duotone para o ecrã bloqueado e o Centro de Controlo
 * (10/11, iOS 18), gerado a cada `expo prebuild` pelo `@bacons/apple-targets`.
 *
 * O projeto iOS não está no repositório -- o CI gera-o do zero. Declarado aqui,
 * o alvo é reconstruído de cada vez.
 *
 * SEM App Group, de propósito: o widget de 1/10 dependia de um para ler o que a
 * app escrevia e saiu porque "não funciona" (ver `.claude/decisoes/energia-ios.md`).
 * Estes botões não leem nada da app: cada um só abre um link `duotone://controlo/…`
 * que a app trata (`lib/atalhosDoIcone.ts`, o mesmo das ações rápidas do ícone).
 */
module.exports = {
  type: 'widget',
  // O alvo principal já se chama Duotone: um nome igual colide no projeto gerado.
  name: 'DuotoneControlos',
  displayName: 'Duotone',
  bundleIdentifier: '.controlos',
  // O da app. Os botões são do iOS 18 (`@available` no Swift): antes disso o
  // alvo instala-se e não oferece nada, e a app continua a instalar-se no 16.4.
  deploymentTarget: '16.4',
};
