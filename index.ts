import { registerRootComponent } from 'expo';
import { raizDaJanelaMini } from './src/janelaMini';

// A janela do mini leitor do PC (?janela=mini) arranca sozinha, SEM a App: o
// `require` da App só corre quando não é ela, e com ele os efeitos do módulo
// (sessão, Supabase, saúde da app). Ver src/janelaMini.web.tsx.
const mini = raizDaJanelaMini();
registerRootComponent(mini ?? require('./App').default);
