/**
 * As frases dos estados, as mesmas no PC e no iPhone (A8, 31/10), e o erro
 * duplo da página de uma playlist no PC (A3).
 *
 * Lê o código como TEXTO. Correr: node --experimental-strip-types scripts/test-frases-dos-estados.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FRASES_DOS_ESTADOS } from '../src/lib/frasesDosEstados.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function todos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n);
    return statSync(f).isDirectory() ? todos(f) : /\.tsx?$/.test(n) ? [f] : [];
  });
}
const SRC = todos('src').filter((f) => !f.endsWith('frasesDosEstados.ts')).map((f) => ({ f: f.replace(/\\/g, '/'), s: ler(f) }));
const onde = (re: RegExp) => SRC.filter(({ s }) => re.test(s)).map(({ f }) => f);

console.log('\nas frases');
caso('em inglês, sem ponto final nos títulos, e "Couldn\'t" em vez de "Could not"', () => {
  const textos: string[] = [];
  for (const v of Object.values(FRASES_DOS_ESTADOS)) {
    if (typeof v === 'string') textos.push(v);
    else for (const [k, t] of Object.entries(v)) {
      textos.push(t);
      if (k === 'titulo') assert.ok(!t.endsWith('.'), `um título não é uma frase: ${t}`);
    }
  }
  for (const t of textos) {
    assert.ok(!/[ãõçáéíóúâêô]/i.test(t), `português na interface: ${t}`);
    assert.ok(!/Could not/.test(t), t);
  }
});
caso('só se nomeiam sítios que existem: Home, Search e Liked Songs', () => {
  const tudo = JSON.stringify(FRASES_DOS_ESTADOS);
  assert.ok(!/\bLibrary\b/.test(tudo));
  assert.match(FRASES_DOS_ESTADOS.misturaQueSaiu.corpo, /Go back to Home/);
});

caso('a letra que não há: as frases daqui, e nunca o erro cru (o "Failed to fetch" do PC, 1/11)', () => {
  const vista = ler('src/components/LyricsView.tsx');
  assert.match(vista, /const frase=FRASES_DOS_ESTADOS\[tipo\]/);
  assert.match(vista, /tipo=\{data\?\.instrumental\?'instrumental':entry\.status==='missing'\?'semLetra':'letraFalhou'\}/);
  assert.ok(!/No lyrics found for this recording|Could not load lyrics/.test(vista));
  const estado = ler('src/state/lyrics.ts');
  assert.match(estado, /:FRASES_DOS_ESTADOS\.letraFalhou\.corpo\}\);\}/);
  assert.ok(!/e\?\.message/.test(estado), 'a mensagem do erro não chega ao ecrã');
});

console.log('\nas frases velhas saíram');
for (const [velha, re] of [
  ['"Go back to Search"', /Go back to Search/],
  ['"…or your Library…"', /from Search or your Library/],
  ['"Use track actions from Search…"', /Use track actions from Search/],
  ['"Play a track to see it here."', /Play a track to see it here/],
  ['o título "Silent" do Now Playing do PC', /title="Silent"/],
  ['"No songs by this artist were found."', /No songs by this artist were found/],
  ['o erro em português do perfil', /O perfil foi alterado noutro dispositivo/],
] as const) {
  caso(velha, () => assert.deepEqual(onde(re), []));
}

console.log('\nas duas plataformas dizem o mesmo');
caso('a playlist vazia (PC e iPhone)', () => {
  for (const f of ['src/desktop/paginas/PlaylistPages.web.tsx', 'src/screens/PlaylistDetailScreen.tsx']) {
    assert.match(ler(f), /FRASES_DOS_ESTADOS\.playlistVazia\.corpo : FRASES_DOS_ESTADOS\.playlistVazia\.semPoder/, f);
  }
});
caso('nada a tocar (o painel e o Now Playing do PC)', () => {
  for (const f of ['src/desktop/PainelDoLeitor.web.tsx', 'src/desktop/paginas/NowPlayingPage.web.tsx']) {
    assert.match(ler(f), /title=\{FRASES_DOS_ESTADOS\.nadaATocar\.titulo\} body=\{FRASES_DOS_ESTADOS\.nadaATocar\.corpo\}/, f);
  }
});
caso('o artista sem músicas (PC e iPhone)', () => {
  assert.match(ler('src/desktop/paginas/BibliotecaPages.web.tsx'), /FRASES_DOS_ESTADOS\.artistaSemMusicas\.titulo/);
  assert.match(ler('src/screens/LibraryGroupScreen.tsx'), /FRASES_DOS_ESTADOS\.artistaSemMusicas\.titulo/);
});

console.log('\nA3: o erro da página de uma playlist do PC');
caso('aparece uma vez (o bloco copiado da grelha saiu)', () => {
  const pl = ler('src/desktop/paginas/PlaylistPages.web.tsx');
  const pagina = pl.slice(pl.indexOf('<Page title="Playlist" action='));
  assert.ok(!/Playlists unavailable/.test(pagina.slice(0, 600)), 'sem "Playlists unavailable" na página de UMA playlist');
  assert.match(pagina, /loadError \? <Empty icon="alert-circle-outline" title="Playlist unavailable"/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
