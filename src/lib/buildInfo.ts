// Sobrescrito automaticamente pela CI (build-ios.yml) a cada build, com o
// SHA curto do commit e a versão do app.json. Em desenvolvimento local fica
// "dev" / a versão do app.json lida no momento em que este ficheiro foi
// gerado pela última vez.
//
// A versão vive aqui, e não em expo-constants, porque o expo-constants só
// existe aninhado em node_modules/expo — importá-lo directamente parte
// assim que a árvore de dependências mudar.
export const BUILD_ID = 'dev';
export const APP_VERSION = '1.0.0';
