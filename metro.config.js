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
// O MMKV por baixo do AsyncStorage no iPhone (16/11, src/armazem/armazenamento.ts):
// o `import AsyncStorage` do código da app vai para lá, e o código fica igual.
// Nunca o das bibliotecas, nunca o do próprio armazém (que usa o verdadeiro
// para ler o que lá estava) e nunca no PC.
//
// O armazém vive SOZINHO na pasta dele (26/11, a 7.2.3 não deixava entrar na
// conta: "Cannot read property 'removeItem' of undefined"). O Metro guarda a
// resolução de um import POR PASTA (o `_resolutionCache` do DependencyGraph),
// e não por ficheiro: com o armazém em src/lib, o primeiro ficheiro da pasta a
// ser resolvido decidia por todos. Ou a src/lib inteira saltava o MMKV, ou o
// armazém importava-se a si próprio e ficava sem o AsyncStorage verdadeiro (e o
// supabase-js, ao guardar a sessão, rebentava no `removeItem`). Dependia da
// ordem do build. Nenhum outro ficheiro entra em src/armazem/
// (`test-armazenamento.ts`).
const ARMAZEM = path.join(__dirname, 'src', 'armazem', 'armazenamento.ts');
const resolverDeAntes = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const destino = RUNTIMES[moduleName];
  const origem = path.normalize(context.originModulePath || '');
  if (moduleName === '@react-native-async-storage/async-storage' && platform === 'ios'
    && origem.startsWith(RAIZ)
    && !origem.includes(`${path.sep}node_modules${path.sep}`)
    && origem !== ARMAZEM) {
    return { type: 'sourceFile', filePath: ARMAZEM };
  }
  if (destino && platform !== 'web'
    && origem.startsWith(RAIZ)
    && !origem.includes(`${path.sep}node_modules${path.sep}`)
    && !origem.startsWith(PASTA_I18N)) {
    return { type: 'sourceFile', filePath: destino };
  }
  return (resolverDeAntes ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
