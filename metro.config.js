// Configuração do Metro.
//
// Existe por uma razão só: as fontes da app (Archivo, Public Sans, JetBrains
// Mono) são embutidas em `assets/fonts/` e carregadas por @font-face no
// desktop. Sem `woff2` na lista de assets, o `require()` delas falha e o
// bundle fica sem tipografia — que era exatamente o defeito que o redesenho
// veio corrigir (o CSS pedia Inter e ninguém a carregava).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('woff2')) {
  config.resolver.assetExts.push('woff2');
}

module.exports = config;
