/**
 * Que formato o resolvedor escolhe, e que a renovação não troca de formato a
 * meio de um download (src/api/ytstream.ts + src/lib/codecDeAudio.ts +
 * src/lib/saudeDoOpus.ts). Entrega 3 do docs/PLANO-AUDIO-IOS-CACHE-OPUS.md.
 *
 * O YouTube é um `fetch` falso, como no test-renovacao-e-hls.ts.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-escolha-codec.ts
 */
import { criarRenovacao, resolveYouTubeStream, streamEmMemoria } from '../src/api/ytstream.ts';
import { definirEscolhaDoCodec, evitarOpusPara, reporCodecParaTestes } from '../src/lib/codecDeAudio.ts';
import {
  DESLIGADO_POR_MS, FALHAS_PARA_DESLIGAR, SAUDE_INICIAL, depoisDoMotor, descreverSaudeDoOpus, lerSaudeDoOpus,
  podePedirOpus, versaoMaior,
} from '../src/lib/saudeDoOpus.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

/** O que a próxima resposta do /player traz. */
let comOpus = true;
let opusCifrado = false;

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
(globalThis as any).fetch = async (entrada: string, init: any = {}) => {
  const url = String(entrada);
  if (url.includes('/youtubei/v1/visitor_id')) return resposta({ responseContext: { visitorData: 'vd' } });
  if (url.includes('/youtubei/v1/player')) {
    const cliente = JSON.parse(init.body).context.client.clientName;
    const formatos: any[] = [
      { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 130000, contentLength: '2400000', url: `https://cdn.test/v?itag=140&c=${cliente}` },
      { itag: 139, mimeType: 'audio/mp4; codecs="mp4a.40.5"', bitrate: 49000, contentLength: '900000', url: `https://cdn.test/v?itag=139&c=${cliente}` },
      { itag: 250, mimeType: 'audio/webm; codecs="opus"', bitrate: 70000, contentLength: '1300000', url: `https://cdn.test/v?itag=250&c=${cliente}` },
    ];
    if (comOpus) {
      formatos.push(opusCifrado
        ? { itag: 251, mimeType: 'audio/webm; codecs="opus"', bitrate: 140000, signatureCipher: 's=abc' }
        : { itag: 251, mimeType: 'audio/webm; codecs="opus"', bitrate: 140000, contentLength: '2600000', url: `https://cdn.test/v?itag=251&c=${cliente}` });
    }
    return resposta({
      playabilityStatus: { status: 'OK' },
      responseContext: { visitorData: 'vd' },
      videoDetails: { lengthSeconds: '150' },
      streamingData: { expiresInSeconds: '21540', adaptiveFormats: formatos.filter((f) => comOpus || f.itag !== 250) },
    });
  }
  if (url.startsWith('https://cdn.test/')) return new Response(new Uint8Array(2), { status: 206 });
  return resposta({}, 404);
};
const itag = (u: string | null) => (u ? new URL(u).searchParams.get('itag') : null);

console.log('\nque formato o resolvedor escolhe');
{
  reporCodecParaTestes();
  const s = await resolveYouTubeStream('v1', 'high');
  check('sem ninguém a decidir (PC, testes): AAC, como antes', s.formato === 'aac' && itag(s.url) === '140', `${s.formato} ${itag(s.url)}`);
}
{
  reporCodecParaTestes();
  definirEscolhaDoCodec(() => 'opus');
  const s = await resolveYouTubeStream('v2', 'high');
  check('com Opus ligado: o itag 251, em WebM', s.formato === 'opus' && itag(s.url) === '251', `${s.formato} ${itag(s.url)}`);
  check('e o codec diz Opus (para as Definições)', s.codec === 'Opus', String(s.codec));
  const poupar = await resolveYouTubeStream('v2', 'saver');
  check('o Data saver é sempre AAC (o de menor bitrate)', poupar.formato === 'aac' && itag(poupar.url) === '139', `${poupar.formato} ${itag(poupar.url)}`);
}
{
  reporCodecParaTestes();
  definirEscolhaDoCodec(() => 'opus');
  evitarOpusPara('v3');
  const s = await resolveYouTubeStream('v3', 'high');
  check('uma faixa cujo Opus o motor recusou é AAC', s.formato === 'aac' && itag(s.url) === '140');
  const outra = await resolveYouTubeStream('v4', 'high');
  check('e as outras continuam em Opus', outra.formato === 'opus');
}
{
  reporCodecParaTestes();
  definirEscolhaDoCodec(() => 'opus');
  opusCifrado = true;
  const s = await resolveYouTubeStream('v5', 'high');
  check('251 só com assinatura cifrada: vai o outro Opus direto (250), sem decifrar nada', s.formato === 'opus' && itag(s.url) === '250', `${s.formato} ${itag(s.url)}`);
  opusCifrado = false;
  comOpus = false;
  const semOpus = await resolveYouTubeStream('v6', 'high');
  check('sem Opus direto nenhum: AAC', semOpus.formato === 'aac' && itag(semOpus.url) === '140');
  comOpus = true;
}

console.log('\no memo guarda cada formato à parte');
{
  reporCodecParaTestes();
  definirEscolhaDoCodec(() => 'opus');
  const opus = await resolveYouTubeStream('v7', 'high');
  const aac = await resolveYouTubeStream('v7', 'high', false, 'aac');
  check('pedir AAC depois de Opus não devolve o URL do Opus', itag(opus.url) === '251' && itag(aac.url) === '140');
  check('o stream em memória é o do formato preferido', itag(streamEmMemoria('v7', 'high')?.url ?? null) === '251');
  evitarOpusPara('v7');
  check('e depois de o recusar, o de AAC', itag(streamEmMemoria('v7', 'high')?.url ?? null) === '140');
}

console.log('\na renovação não troca de formato a meio de um download');
{
  reporCodecParaTestes();
  definirEscolhaDoCodec(() => 'opus');
  const renovar = criarRenovacao('v8', 'high', 'opus');
  check('renovar um Opus dá um URL do Opus (identidade nova)', itag(await renovar()) === '251');
  check('e a renovação de sempre também', itag(await renovar()) === '251');
  comOpus = false;
  const r3 = await renovar();
  check('se o YouTube já só der AAC, devolve null (bocados de AAC num WebM partiam o ficheiro)', r3 === null, String(r3));
  comOpus = true;
  const deAac = criarRenovacao('v9', 'high', 'aac');
  check('renovar um AAC com o Opus ligado continua AAC', itag(await deAac()) === '140');
}

console.log('\nquando é que o iPhone pede Opus (lib/saudeDoOpus.ts)');
{
  const base = { ligado: true, plataforma: 'ios', versaoDoIos: 17, saude: SAUDE_INICIAL, agora: 1_000 };
  check('iOS 17 com o interruptor ligado: sim', podePedirOpus(base));
  check('iOS 16: não (e o iOS mínimo da app é 16.4)', !podePedirOpus({ ...base, versaoDoIos: 16 }));
  check('versão desconhecida: não', !podePedirOpus({ ...base, versaoDoIos: null }));
  check('fora do iPhone: não', !podePedirOpus({ ...base, plataforma: 'web' }));
  check('interruptor desligado: não', !podePedirOpus({ ...base, ligado: false }));
  check('"17.4" e 18 leem-se como 17 e 18', versaoMaior('17.4') === 17 && versaoMaior(18) === 18 && versaoMaior(undefined) === null);

  let s = SAUDE_INICIAL;
  for (let i = 0; i < FALHAS_PARA_DESLIGAR - 1; i++) s = depoisDoMotor(s, 'recusou', 1_000);
  check('uma recusa só conta', podePedirOpus({ ...base, saude: s }) && s.falhasSeguidas === 1);
  s = depoisDoMotor(s, 'recusou', 1_000);
  check(`${FALHAS_PARA_DESLIGAR} recusas seguidas: desliga`, !podePedirOpus({ ...base, saude: s }));
  check('e volta ao fim do prazo', podePedirOpus({ ...base, saude: s, agora: 1_000 + DESLIGADO_POR_MS + 1 }));
  check('um relógio que andou para trás não o deixa desligado para sempre',
    podePedirOpus({ ...base, saude: { ...s, desligadoAte: 1_000 + 10 * DESLIGADO_POR_MS } }));
  const tocou = depoisDoMotor(depoisDoMotor(SAUDE_INICIAL, 'recusou', 0), 'tocou', 0);
  check('uma faixa que toca zera a contagem e fica como prova', tocou.falhasSeguidas === 0 && tocou.provado);
  const lido = lerSaudeDoOpus(JSON.stringify({ falhasSeguidas: 99, desligadoAte: 5, provado: true }));
  check('o que está guardado lê-se com tolerância', lido.falhasSeguidas === FALHAS_PARA_DESLIGAR && lido.desligadoAte === 5 && lido.provado);
  check('lixo guardado é o estado inicial', lerSaudeDoOpus('{x').falhasSeguidas === 0 && !lerSaudeDoOpus(null).provado);
  check('o relatório diz porque é que está desligado',
    /needs iOS 17/.test(descreverSaudeDoOpus({ ...base, versaoDoIos: 16 }))
    && /refused Opus/.test(descreverSaudeDoOpus({ ...base, saude: s }))
    && /not yet proven/.test(descreverSaudeDoOpus(base)));
}

if (bad) {
  console.error(`\n  ${bad} verificação(ões) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todas as verificações passaram.\n');
