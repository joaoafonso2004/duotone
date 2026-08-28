import {
  MIN_GAIN,
  normalizedGain,
  readLoudnessDb,
  targetVolume,
} from '../src/lib/loudness.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};
const perto = (a: number, b: number) => Math.abs(a - b) < 0.01;

// --- a conta --------------------------------------------------------------
check('na referencia nao mexe', normalizedGain(0) === 1);
// -6.02 dB e exatamente metade da amplitude; 6 dB certos dao 0.5012.
check('6 dB acima desce para ~metade', perto(normalizedGain(6), 0.5), String(normalizedGain(6)));
check('20 dB acima desce para 0.1... mas o chao segura', normalizedGain(20) === MIN_GAIN, String(normalizedGain(20)));
check('3 dB acima atenua um pouco', perto(normalizedGain(3), 0.7079), String(normalizedGain(3)));

// So se pode atenuar: o AVPlayer nao passa de 1.0, por isso faixas mais
// baixas que a referencia ficam onde estao em vez de tentar amplificar.
check('faixa mais baixa nao e amplificada', normalizedGain(-6) === 1, String(normalizedGain(-6)));
check('faixa muito mais baixa tambem nao', normalizedGain(-30) === 1);

// --- degradacao -----------------------------------------------------------
// Sem informacao nao se mexe no volume — e o caso das faixas descarregadas
// antes desta funcionalidade existir.
check('sem valor nao mexe', normalizedGain(null) === 1);
check('undefined nao mexe', normalizedGain(undefined) === 1);
check('NaN nao mexe', normalizedGain(NaN) === 1);
check('Infinity nao mexe', normalizedGain(Infinity) === 1, String(normalizedGain(Infinity)));
check('-Infinity nao mexe', normalizedGain(-Infinity) === 1);
// Metadados corrompidos nao podem emudecer a faixa.
check('valor disparatado nao emudece', normalizedGain(999) >= MIN_GAIN);
check('nunca passa de 1', normalizedGain(-999) <= 1);

// --- preferencia ----------------------------------------------------------
check('desligado devolve sempre 1', targetVolume(6, false) === 1);
check('ligado aplica o ganho', perto(targetVolume(6, true), 0.5));
check('desligado sem valor tambem e 1', targetVolume(null, false) === 1);

// --- leitura da resposta do player ----------------------------------------
check(
  'le o loudnessDb da resposta',
  readLoudnessDb({ playerConfig: { audioConfig: { loudnessDb: 4.5 } } }) === 4.5
);
check('resposta vazia da null', readLoudnessDb({}) === null);
check('undefined da null', readLoudnessDb(undefined) === null);
check('campo em falta da null', readLoudnessDb({ playerConfig: { audioConfig: {} } }) === null);
check('valor nao numerico da null', readLoudnessDb({ playerConfig: { audioConfig: { loudnessDb: 'alto' } } }) === null);
check('zero e um valor valido', readLoudnessDb({ playerConfig: { audioConfig: { loudnessDb: 0 } } }) === 0);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);
