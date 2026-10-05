/**
 * Nada se lê abaixo de 11 pt no iPhone (3/10, auditoria).
 *
 * Havia texto de 8, 9 e 10 pt espalhado pelos ecrãs -- datas no chat, rótulos,
 * a marca dos avisos. Este teste lê os ecrãs e os componentes do iPhone como
 * TEXTO e falha com um `fontSize` abaixo de 11 fora das exceções de baixo, que
 * não são texto para ler: escalas de gráficos e do equalizador (têm de caber
 * numa coluna estreita) e emblemas com um número ou duas letras.
 *
 * Correr: node --experimental-strip-types scripts/test-letra-minima.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MINIMO = 11;

/** Ficheiro → porque é que ali pode ser mais pequeno. */
const EXCECOES: Record<string, string> = {
  'src/components/BarraVelocidade.tsx': 'a régua por baixo da barra da velocidade',
  'src/components/Equalizador.tsx': 'os valores e os nomes das dez bandas, numa décima da largura',
  'src/components/PlayerRoot.tsx': 'o "1" dentro do ícone do repeat',
  'src/components/BotaoDasMensagens.tsx': 'o número no emblema das mensagens',
  'src/components/ProfileHero.tsx': 'o número no emblema do perfil',
  'src/components/SourceBadge.tsx': 'o emblema da origem',
  'src/screens/ListeningStatsScreen.tsx': 'a escala do gráfico',
  'src/screens/RetrospetivaScreen.tsx': 'os meses do gráfico',
  'src/screens/SearchScreen.tsx': 'o selo em cima das capas',
};

function ficheiros(pasta: string): string[] {
  const saida: string[] = [];
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    const p = join(pasta, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) { if (e.name !== 'desktop') saida.push(...ficheiros(p)); }
    else if (p.endsWith('.tsx') && !p.endsWith('.web.tsx')) saida.push(p);
  }
  return saida;
}

const errados: string[] = [];
for (const f of ['src/components', 'src/screens', 'src/navigation'].flatMap(ficheiros)) {
  if (f in EXCECOES) continue;
  readFileSync(f, 'utf8').split('\n').forEach((linha, i) => {
    for (const m of linha.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
      if (Number(m[1]) < MINIMO) errados.push(`${f}:${i + 1}  fontSize ${m[1]}`);
    }
  });
}

if (errados.length) {
  console.error(`  FALHOU - texto abaixo de ${MINIMO} pt no iPhone:\n    ${errados.join('\n    ')}`);
  process.exit(1);
}
console.log(`  ok - nada abaixo de ${MINIMO} pt fora das ${Object.keys(EXCECOES).length} exceções`);
