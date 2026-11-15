import { registerRootComponent } from 'expo';
import { instalarTraducao } from './src/i18n/instalar';
import { comIdioma } from './src/i18n/raiz';
import { raizDaJanelaMini } from './src/janelaMini';

// A língua da interface (15/11, src/i18n): inglês por omissão, francês nas
// Definições. No PC observa o DOM (também a janela do mini leitor); no iPhone
// trata dos Alert.alert, e a raiz espera pela língua antes do primeiro desenho.
instalarTraducao();

// A janela do mini leitor do PC (?janela=mini) arranca sozinha, SEM a App: o
// `require` da App só corre quando não é ela, e com ele os efeitos do módulo
// (sessão, Supabase, saúde da app). Ver src/janelaMini.web.tsx.
const mini = raizDaJanelaMini();
registerRootComponent(mini ?? comIdioma(require('./App').default));
