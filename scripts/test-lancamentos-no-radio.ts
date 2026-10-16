// Os lançamentos novos no Radio (16/10).
// Correr: node --experimental-strip-types scripts/test-lancamentos-no-radio.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  artistasParaLancamentos, ESCUTAS_PARA_ADOTAR, faixaDoLancamento, juntarAoLote, MAX_ARTISTAS_POR_LOTE,
} from '../src/lib/lancamentosNoRadio.ts';
import { lancamentoRecenteDoArtista, memoriaVazia, registarArtista } from '../src/lib/novosLancamentos.ts';

type F = { id: string; artista: string };
const f = (id: string, artista: string): F => ({ id, artista });
const chave = (t: F) => t.artista.toLowerCase();
const ids = (l: readonly F[]) => l.map((t) => t.id);

// Quem conta: os das sementes primeiro; depois os ADOTADOS (duas escutas até ao fim nesta sessão).
{
  const sementes = [f('s1', 'Isak'), f('s2', 'Holly Hood'), f('s3', 'Isak')];
  const sessao = [f('o1', 'Plutonio'), f('o2', 'Dillaz'), f('o3', 'Plutonio'), f('o4', 'Isak'), f('o5', 'Isak')];
  const r = artistasParaLancamentos(sementes, sessao, chave);
  assert.deepEqual(r.map((a) => a.chave), ['isak', 'holly hood', 'plutonio'], 'sementes, depois o adotado; o Dillaz (uma escuta) não');
  assert.deepEqual(r.map((a) => a.adotado), [true, false, true]);
  assert.deepEqual(ids(r[2].provas), ['o3', 'o1'], 'as provas de um adotado: as escutas dele, a mais recente primeiro');
  assert.equal(ESCUTAS_PARA_ADOTAR, 2);
  const muitos = Array.from({ length: 10 }, (_, i) => f(`m${i}`, `A${i}`));
  assert.equal(artistasParaLancamentos(muitos, [], chave).length, MAX_ARTISTAS_POR_LOTE, 'um teto por lote');
  assert.deepEqual(artistasParaLancamentos([], [f('x', 'Só Um')], chave), [], 'uma escuta não chega para adotar');
}

// A música do lançamento: a primeira que pode entrar, e do próprio artista quando há.
{
  const album = [f('intro', 'Convidado'), f('a1', 'Isak'), f('a2', 'Isak')];
  assert.equal(faixaDoLancamento(album, 'isak', chave, () => true)?.id, 'a1', 'num álbum com convidados, a dele');
  assert.equal(faixaDoLancamento(album, 'isak', chave, (t) => t.id !== 'a1')?.id, 'a2', 'a que já está na fila salta');
  assert.equal(faixaDoLancamento([f('so', 'Outro Nome')], 'isak', chave, () => true)?.id, 'so',
    'um single com o nome escrito de outra maneira continua a servir');
  assert.equal(faixaDoLancamento(album, 'isak', chave, () => false), null, 'nada pode entrar: nada');
}

// Entra em segundo lugar, e o mesmo artista continua a ser no máximo um quarto do lote.
{
  const lote = [f('r1', 'A'), f('r2', 'B'), f('r3', 'C'), f('r4', 'D'), f('r5', 'E'), f('r6', 'F'), f('r7', 'G')];
  assert.deepEqual(ids(juntarAoLote(lote, f('novo', 'Isak'), chave)), ['r1', 'novo', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
  const cheio = [f('i1', 'Isak'), f('r2', 'B'), f('i2', 'Isak'), f('r4', 'D'), f('r5', 'E'), f('r6', 'F'), f('r7', 'G')];
  const r = juntarAoLote(cheio, f('novo', 'Isak'), chave);
  assert.equal(r.filter((t) => t.artista === 'Isak').length, 2, 'no teto: troca com a última dele, não se soma');
  assert.deepEqual(ids(r), ['i1', 'novo', 'r2', 'r4', 'r5', 'r6', 'r7']);
  assert.deepEqual(ids(juntarAoLote([f('so', 'A')], f('novo', 'B'), chave)), ['so', 'novo']);
}

// O lançamento que a prateleira já conhece: o novo dos últimos 14 dias; sem ele, o mais recente se for deste ano.
{
  const DIA = 24 * 60 * 60 * 1000;
  const agora = Date.UTC(2026, 9, 16, 12);
  const album = (id: string, ano: string | null) => ({ id, titulo: `T ${id}`, tipo: 'Single', ano, capa: null });
  let m = registarArtista(memoriaVazia(), 'isak', 'Isak', 'UCisak', [album('velho', '2025')], agora - 30 * DIA);
  assert.equal(lancamentoRecenteDoArtista(m, 'isak', agora), null, 'só um de 2025: nada para o Radio');
  m = registarArtista(m, 'isak', 'Isak', 'UCisak', [album('deste-ano', '2026'), album('velho', '2025')], agora - 20 * DIA);
  assert.equal(lancamentoRecenteDoArtista(m, 'isak', agora)?.id, 'deste-ano', 'o novo já passou dos 14 dias: fica o mais recente deste ano');
  m = registarArtista(m, 'isak', 'Isak', 'UCisak', [album('novinho', '2026'), album('deste-ano', '2026'), album('velho', '2025')], agora - 2 * DIA);
  assert.equal(lancamentoRecenteDoArtista(m, 'isak', agora)?.id, 'novinho', 'um novo dos últimos 14 dias ganha');
  assert.equal(lancamentoRecenteDoArtista(m, 'dillaz', agora), null, 'um artista que a prateleira não segue');
}

// Custo: nada ao Supabase nem à Data API -- as músicas vêm do YouTube Music, e não da pré-visualização (yt_cache).
{
  const estado = readFileSync(new URL('../src/state/lancamentosNoRadio.ts', import.meta.url), 'utf8');
  assert.match(estado, /lerPlaylistPeloYtMusic\(l\.id\)/);
  assert.doesNotMatch(estado, /supabase|fetchYouTubePlaylistById|cacheGet|cacheSet|yt_cache/, 'nada de Supabase nem da Data API');
  assert.match(estado, /ADOTADO_DURANTE_MS = 20 \* 60 \* 60 \* 1000/, 'um adotado lê-se uma vez a cada 20 h');
  const leitor = readFileSync(new URL('../src/state/player.ts', import.meta.url), 'utf8');
  assert.equal((leitor.match(/comNovo\.marcar\?\.\(\);/g) ?? []).length, 2, 'marcado só depois de o lote entrar, no Radio e no autoplay');
}

console.log('Lançamentos no Radio: quem conta, que música, onde entra, o que a prateleira já sabe e o custo passaram.');
