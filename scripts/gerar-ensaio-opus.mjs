/**
 * Gera os ficheiros do ensaio do Opus (entrega 2 do
 * docs/PLANO-AUDIO-IOS-CACHE-OPUS.md) em assets/ensaio-opus/.
 *
 * A pergunta que eles respondem é UMA: o AVPlayer do iPhone toca Opus dentro de
 * um MP4 (ou de um CAF), do princípio ao fim, com a duração certa no ecrã
 * bloqueado? São gerados FORA da app de propósito -- se falharem, o defeito é
 * do motor e não de um conversor nosso por escrever.
 *
 * O som é sintético e diz onde está: um apito agudo de 0,2 s no início, pulsos
 * de segundo a segundo com um tom que sobe a cada 5 s (dá para saber de ouvido
 * em que zona se está depois de um seek), e três apitos no último segundo, o
 * último a acabar EXATAMENTE aos 30,000 s. Início cortado (pre-skip mal
 * aplicado) come o primeiro apito; fim cortado come o terceiro.
 *
 *  - opus-fmp4.m4a  fMP4 como o do YouTube, com mvhd/tkhd/mdhd a ZERO: o layout
 *                   que a app teria em produção (ver lib/mp4Fixer.ts, e o
 *                   "duração 2x" que isto evita). É o que decide.
 *  - opus-mp4.m4a   MP4 convencional (moov com a duração, sem fragmentos):
 *                   se nem este toca, o AVPlayer não toca Opus em MP4 e ponto.
 *  - opus.caf       CAF, o contentor em que a Apple suporta Opus no iOS. NÃO
 *                   sai daqui: o ffmpeg não escreve Opus em CAF, e o cookie
 *                   que a Apple põe lá não está documentado (o próprio
 *                   demuxer do ffmpeg diz "layout currently unknown"). Um CAF
 *                   escrito à mão seria um palpite, e um palpite que falha
 *                   não prova nada. Quem o faz é o `afconvert` da Apple, no
 *                   runner macOS do CI (build-ios.yml), antes do bundle. Aqui
 *                   fica um marcador, e o `origem.json` diz se há CAF a sério.
 *  - aac-fmp4.m4a   O MESMO som em AAC, pelo mesmo fixer da app: o controlo.
 *                   Se este falhar, o ensaio está estragado, não o Opus.
 *
 * Precisa do ffmpeg com libopus no PATH (só para gerar; a app não o usa).
 * `--so-wav <caminho>` escreve só o som, sem ffmpeg: é o que o CI usa para dar
 * ao afconvert a mesma fonte.
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/gerar-ensaio-opus.mjs
 * O `scripts/test-ensaio-opus.mjs` confere o que ficou escrito.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zerarDuracoes } from './ensaio-opus-caixas.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DESTINO = path.join(RAIZ, 'assets', 'ensaio-opus');
export const TAXA = 48_000;
export const SEGUNDOS = 30;

/** O som, em PCM 16 bits estéreo. */
function sintetizar() {
  const n = TAXA * SEGUNDOS;
  const pcm = Buffer.alloc(n * 4);
  const entre = (t, a, b) => t >= a && t < b;
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    let v = 0;
    if (entre(t, 0, 0.2)) v += 0.5 * Math.sin(2 * Math.PI * 1760 * t);
    if (entre(t, 0.5, 29) && t % 1 < 0.6) {
      const f = 220 * 2 ** (Math.floor(t / 5) / 3);
      v += 0.3 * Math.sin(2 * Math.PI * f * t);
    }
    if (entre(t, 29.2, 29.35) || entre(t, 29.5, 29.65) || entre(t, 29.8, 30)) {
      v += 0.5 * Math.sin(2 * Math.PI * 1760 * t);
    }
    const s = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    pcm.writeInt16LE(s, i * 4);
    pcm.writeInt16LE(s, i * 4 + 2);
  }
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + pcm.length, 4); cab.write('WAVE', 8);
  cab.write('fmt ', 12); cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(2, 22);
  cab.writeUInt32LE(TAXA, 24); cab.writeUInt32LE(TAXA * 4, 28); cab.writeUInt16LE(4, 32); cab.writeUInt16LE(16, 34);
  cab.write('data', 36); cab.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cab, pcm]);
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ensaio-opus-'));
  const wav = path.join(tmp, 'fonte.wav');
  fs.writeFileSync(wav, sintetizar());
  const saida = (nome) => path.join(DESTINO, nome);
  const FRAG = ['-movflags', '+frag_keyframe+empty_moov+default_base_moof'];
  // Sem metadados do ffmpeg (encoder, datas): o ficheiro sai igual de cada vez.
  const LIMPO = ['-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact'];

  ffmpeg(['-i', wav, ...LIMPO, '-c:a', 'libopus', '-b:a', '128k', '-f', 'mp4', ...FRAG, path.join(tmp, 'opus-fmp4.m4a')]);
  const fmp4 = new Uint8Array(fs.readFileSync(path.join(tmp, 'opus-fmp4.m4a')));
  zerarDuracoes(fmp4);
  fs.writeFileSync(saida('opus-fmp4.m4a'), fmp4);

  ffmpeg(['-i', wav, ...LIMPO, '-c:a', 'libopus', '-b:a', '128k', '-f', 'mp4', '-movflags', '+faststart', saida('opus-mp4.m4a')]);
  // O marcador do CAF: o CI troca-o pelo do afconvert, e o origem.json diz qual é.
  fs.writeFileSync(saida('opus.caf'), 'marcador: sem CAF nesta build\n');
  fs.writeFileSync(saida('origem.json'), `${JSON.stringify({ caf: 'ausente' }, null, 2)}\n`);

  // O controlo passa pelo MESMO fixer que os downloads da app.
  ffmpeg(['-i', wav, ...LIMPO, '-c:a', 'aac', '-b:a', '128k', '-f', 'mp4', ...FRAG, path.join(tmp, 'aac-fmp4.m4a')]);
  const { fixMp4Duration } = await import('../src/lib/mp4Fixer.ts');
  const aac = new Uint8Array(fs.readFileSync(path.join(tmp, 'aac-fmp4.m4a')));
  fixMp4Duration(aac, SEGUNDOS);
  fs.writeFileSync(saida('aac-fmp4.m4a'), aac);

  fs.rmSync(tmp, { recursive: true, force: true });
  for (const f of fs.readdirSync(DESTINO)) console.log(`${f}: ${fs.statSync(saida(f)).size} bytes`);
}

const iSoWav = process.argv.indexOf('--so-wav');
if (iSoWav >= 0) fs.writeFileSync(process.argv[iSoWav + 1], sintetizar());
else await main();
