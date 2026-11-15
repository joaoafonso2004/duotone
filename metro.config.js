// Configuração do Metro.
//
// Existe por uma razão só: as fontes da app (Archivo, Public Sans, JetBrains
// Mono) são embutidas em `assets/fonts/` e carregadas por @font-face no
// desktop. Sem `woff2` na lista de assets, o `require()` delas falha e o
// bundle fica sem tipografia — que era exatamente o defeito que o redesenho
// veio corrigir (o CSS pedia Inter e ninguém a carregava).
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('woff2')) {
  config.resolver.assetExts.push('woff2');
}

// A interface em francês no iPhone (15/11, src/i18n): o runtime JSX do código
// da app passa por src/i18n/jsx-runtime.ts, que traduz o texto ao desenhar.
// Nunca o do node_modules nem o da própria pasta src/i18n (que usa o real), e
// nunca na web: o PC traduz-se no DOM (src/i18n/instalar.web.ts). Em inglês, a
// língua de origem, o runtime devolve as props intactas.
const PASTA_I18N = path.join(__dirname, 'src', 'i18n') + path.sep;
const RAIZ = path.normalize(__dirname) + path.sep;
const RUNTIMES = {
  'react/jsx-runtime': path.join(PASTA_I18N, 'jsx-runtime.ts'),
  'react/jsx-dev-runtime': path.join(PASTA_I18N, 'jsx-dev-runtime.ts'),
};
const resolverDeAntes = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const destino = RUNTIMES[moduleName];
  const origem = path.normalize(context.originModulePath || '');
  if (destino && platform !== 'web'
    && origem.startsWith(RAIZ)
    && !origem.includes(`${path.sep}node_modules${path.sep}`)
    && !origem.startsWith(PASTA_I18N)) {
    return { type: 'sourceFile', filePath: destino };
  }
  return (resolverDeAntes ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
