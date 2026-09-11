/**
 * Cada definição tem de ter quem a leia fora dos ecrãs de Definições.
 *
 * A regra do CLAUDE.md -- "uma opção que não faz nada é pior do que não
 * existir" -- era só uma regra: o desktop chegou a ter seis opções mortas.
 * Isto passa-a a verificação. Duas partes:
 *
 *  1. Todo o `set*` de lib/prefs.ts que um ecrã de Definições importa tem de
 *     estar na tabela abaixo. Uma opção nova sem entrada aqui parte o teste --
 *     é o momento de dizer quem a lê.
 *  2. Cada entrada da tabela aponta um ficheiro que NÃO é um ecrã de
 *     Definições e um padrão que tem de lá estar.
 *
 * Mais: o PC não pode oferecer as opções do resolver nativo (qualidade, PO
 * Token, normalização, limpar caches) -- lá o player é o IFrame do YouTube.
 *
 * Correr: node scripts/test-definicoes-com-efeito.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ler = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ECRAS = {
  ios: 'src/screens/SettingsScreen.tsx',
  pc: 'src/desktop/paginas/SettingsPage.web.tsx',
};

/**
 * Opção → quem a escreve nas Definições (`set*` de prefs, quando é por aí) →
 * quem a lê e age sobre ela. `leitores` são [ficheiro, padrão]; basta um.
 */
const TABELA = [
  { opcao: 'Audio quality', escreve: ['setAudioQuality'],
    leitores: [['src/components/YouTubePlayerView.tsx', /getAudioQuality\(/]] },
  { opcao: 'Crossfade', escreve: ['setCrossfadeSegundos'],
    leitores: [['src/components/YouTubePlayerView.tsx', /st\.crossfadeSegundos/]] },
  { opcao: 'Playback speed (default)', escreve: [],
    leitores: [['src/state/player.ts', /rate: st\.padraoRate/]] },
  { opcao: 'Equaliser (default)', escreve: [],
    leitores: [['src/state/player.ts', /ganhos: st\.padraoGanhos/]] },
  { opcao: 'Sleep timer', escreve: [],
    leitores: [['App.tsx', /sleepTimerEndsAt/]] },
  { opcao: 'Normalize volume', escreve: ['setVolumeNormalization'],
    leitores: [['src/components/YouTubePlayerView.tsx', /volumeNormalization/]] },
  { opcao: 'Autoplay radio', escreve: ['setAutoplayRadio'],
    leitores: [['src/lib/radioSync.ts', /s\.autoplayRadio/]] },
  { opcao: 'Keep screen awake', escreve: ['setKeepAwake'],
    leitores: [['App.tsx', /getKeepAwake\(/]] },
  { opcao: 'Show track duration', escreve: ['setShowTrackDuration', 'setShowTrackDurationCache'],
    leitores: [['src/components/TrackRow.tsx', /isShowTrackDurationSync\(\)/], ['src/desktop/ui.web.tsx', /isShowTrackDurationSync\(\)/]] },
  { opcao: 'Rewind 15 s', escreve: ['setShowRewindButton'],
    leitores: [['src/components/PlayerRoot.tsx', /showRewindButton/], ['src/desktop/casca.web.tsx', /showRewindButton/]] },
  { opcao: 'Notifications', escreve: ['setNotificationsEnabled'],
    leitores: [['src/hooks/useInAppNotifications.ts', /getNotificationsEnabled/], ['src/hooks/useDesktopNotifications.ts', /getNotificationsEnabled/]] },
  { opcao: 'Haptic feedback', escreve: ['setHapticsEnabled', 'setHapticsEnabledCache'],
    leitores: [['src/lib/haptics.ts', /isHapticsEnabledSync\(\)/]] },
  { opcao: 'PO Token server', escreve: ['setPoTokenServerUrl'],
    leitores: [['src/api/potProvider.ts', /getPoTokenServerUrl\(/]] },
  { opcao: 'Car mode keeps the screen on', escreve: ['setCarroMantemEcra'],
    leitores: [['src/components/ModoCarro.tsx', /getCarroMantemEcra\(/]] },
  { opcao: 'Discord Rich Presence', escreve: ['setDiscordRichPresence'],
    leitores: [['src/navigation/RootNavigator.web.tsx', /usePresencaDoDiscord\(discordOn/]] },
  { opcao: 'Effect mode', escreve: ['setGlitchMode'],
    leitores: [['src/desktop/paginas/NowPlayingPage.web.tsx', /duotone:glitch-mode/]] },
  { opcao: 'Effect intensity', escreve: ['setEffectIntensity'],
    leitores: [['src/desktop/paginas/NowPlayingPage.web.tsx', /duotone:effect-intensity/]] },
  { opcao: 'Accent', escreve: [],
    leitores: [['src/state/theme.ts', /mode === 'cover'/]] },
  { opcao: 'Artwork effect (iPhone)', escreve: [],
    leitores: [['src/components/CapaReactiva.ios.tsx', /useCapaIOS\(s => s\.mode\)/]] },
  { opcao: 'Glass transparency', escreve: [],
    leitores: [['src/navigation/RootNavigator.web.tsx', /duotone:panel-opacity/]] },
  { opcao: 'Start with Windows', escreve: [],
    leitores: [['electron/main.cjs', /setLoginItemSettings/]] },
];

let falhas = 0;
function caso(nome, fn) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

/** Os nomes ORIGINAIS dos `set*` importados de lib/prefs (antes do `as`). */
function settersDePrefs(fonte) {
  const nomes = new Set();
  for (const m of fonte.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(?:\.\.\/)+lib\/prefs'/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (/^set[A-Z]/.test(nome)) nomes.add(nome);
    }
  }
  return nomes;
}

const cobertos = new Set(TABELA.flatMap((e) => e.escreve));

console.log('\ntodo o set* de prefs das Definições está na tabela');
for (const [plataforma, ficheiro] of Object.entries(ECRAS)) {
  const setters = settersDePrefs(ler(ficheiro));
  caso(`${plataforma}: ${setters.size} setters importados, todos com leitor declarado`, () => {
    assert.ok(setters.size > 3, `não encontrei os imports de lib/prefs em ${ficheiro}`);
    const semLeitor = [...setters].filter((s) => !cobertos.has(s));
    assert.deepEqual(semLeitor, [], `sem entrada na TABELA: ${semLeitor.join(', ')}`);
  });
}

console.log('\ncada opção é lida fora dos ecrãs de Definições');
for (const { opcao, leitores } of TABELA) {
  caso(opcao, () => {
    for (const [f] of leitores) {
      assert.ok(!Object.values(ECRAS).includes(f), `${f} é um ecrã de Definições, não conta`);
    }
    const achou = leitores.filter(([f, re]) => fs.existsSync(new URL(`../${f}`, import.meta.url)) && re.test(ler(f)));
    assert.ok(achou.length > 0, `nenhum leitor encontrado: ${leitores.map(([f, re]) => `${f} ${re}`).join(' | ')}`);
  });
}

console.log('\no PC não oferece o que só o resolver nativo lê');
caso('sem qualidade, PO Token, normalização nem limpar caches', () => {
  const pc = ler(ECRAS.pc);
  for (const morto of ['setAudioQuality', 'setPoTokenServerUrl', 'setVolumeNormalization', 'setCrossfadeSegundos', 'clearDownloadedAudioCache', 'clearStreamMemo']) {
    assert.ok(!new RegExp(`\\b${morto}\\b`).test(pc), `${morto} no desktop seria uma opção morta`);
  }
});

console.log('\nas linhas de efeito vêm do módulo partilhado');
caso('os dois ecrãs usam lib/efeitoDasDefinicoes e nenhum escreve as frases à mão', () => {
  for (const f of Object.values(ECRAS)) {
    const fonte = ler(f);
    assert.match(fonte, /from '(?:\.\.\/)+lib\/efeitoDasDefinicoes'/, `${f} não importa o módulo`);
    assert.ok(!/Stops at |Frees \d|also removes your/.test(fonte), `${f} tem uma frase de efeito escrita à mão`);
  }
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
