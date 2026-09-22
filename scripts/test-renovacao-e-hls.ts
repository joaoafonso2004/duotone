/**
 * A renovação depois de um 403 e o HLS de recurso (src/api/ytstream.ts).
 *
 * 22/9: o iPhone do João levava 403 aos 1 012 144 bytes em todas as músicas
 * pelo VISIONOS, e no PC, na mesma rede e com identidade nova, o VISIONOS
 * descarregava tudo. A renovação de sempre repetia a identidade; a nova
 * alterna com uma identidade nova e sem PO Token. E quando nada disso chega, o
 * HLS (que não tem o teto de ~1 MB) vem antes do embed, que parava aos 29 s.
 *
 * O YouTube é um `fetch` falso: regista cada pedido e responde conforme o
 * cliente e o URL. Corre com o `registar-duplos.mjs` (AsyncStorage em memória).
 */
import { criarRenovacao, resolveYouTubeHls } from '../src/api/ytstream.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

type Pedido = { url: string; cliente?: string; visitorData?: string; range?: string };
const pedidos: Pedido[] = [];
let visitantes = 0;
/** Os clientes que o /player recusa (HTTP 400), para simular um que caiu. */
let clientesRecusados = new Set<string>();
/** Quando falso, a resposta do /player não traz HLS. */
let comHls = true;

const resposta = (corpo: unknown, status = 200) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });

(globalThis as any).fetch = async (entrada: string, init: any = {}) => {
  const url = String(entrada);
  const headers = init.headers ?? {};
  if (url.includes('/youtubei/v1/visitor_id')) {
    visitantes += 1;
    pedidos.push({ url: 'visitor_id' });
    return resposta({ responseContext: { visitorData: `vd-${visitantes}` } });
  }
  if (url.includes('/youtubei/v1/player')) {
    const corpo = JSON.parse(init.body);
    const cliente = corpo.context.client.clientName;
    pedidos.push({ url: 'player', cliente, visitorData: corpo.context.client.visitorData });
    if (clientesRecusados.has(cliente)) return resposta({}, 400);
    return resposta({
      playabilityStatus: { status: 'OK' },
      responseContext: { visitorData: corpo.context.client.visitorData },
      videoDetails: { lengthSeconds: '150' },
      playerConfig: { audioConfig: { loudnessDb: 3 } },
      streamingData: {
        expiresInSeconds: '21540',
        adaptiveFormats: [{
          itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 130000, contentLength: '2413615',
          url: `https://cdn.test/videoplayback?c=${cliente}&vd=${corpo.context.client.visitorData}`,
        }],
        hlsManifestUrl: comHls ? `https://manifest.test/${cliente}/master.m3u8` : undefined,
      },
    });
  }
  if (url.startsWith('https://cdn.test/')) {
    pedidos.push({ url, range: headers.Range });
    return new Response(new Uint8Array(2), { status: 206 });
  }
  if (url.endsWith('/master.m3u8')) {
    pedidos.push({ url });
    return resposta([
      '#EXTM3U',
      '#EXT-X-MEDIA:URI="https://manifest.test/itag/233/a.m3u8",TYPE=AUDIO,GROUP-ID="233"',
      '#EXT-X-MEDIA:URI="https://manifest.test/itag/234/a.m3u8",TYPE=AUDIO,GROUP-ID="234"',
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000',
      'https://manifest.test/video.m3u8',
    ].join('\n'));
  }
  // O PO Token não se cunha em Node (não há WebView); o potProvider devolve null.
  return resposta({}, 404);
};

console.log('\nrenovação depois de um 403');
{
  pedidos.length = 0;
  const renovar = criarRenovacao('abc', 'high');
  const primeiro = await renovar();
  const players1 = pedidos.filter((p) => p.url === 'player');
  check('a primeira renovação pede uma identidade nova', pedidos.some((p) => p.url === 'visitor_id'));
  check('e vai pelo VISIONOS', players1.length === 1 && players1[0].cliente === 'VISIONOS');
  check('sem PO Token no URL (o VISIONOS não precisa dele)', !!primeiro && !primeiro.includes('pot='));
  check('confirma o URL com a sonda de 2 bytes antes de o dar',
    pedidos.some((p) => p.url.startsWith('https://cdn.test/') && p.range === 'bytes=0-1'));

  pedidos.length = 0;
  const segundo = await renovar();
  const players2 = pedidos.filter((p) => p.url === 'player');
  check('a segunda faz a renovação de sempre (a cascata inteira, pelo memo refeito)',
    !!segundo && players2.length >= 1 && players2[0].cliente === 'VISIONOS');

  pedidos.length = 0;
  await renovar();
  check('a terceira volta à identidade nova', pedidos.filter((p) => p.url === 'visitor_id').length === 1);

  // A identidade nova é só da renovação: a da app não muda.
  pedidos.length = 0;
  const outra = criarRenovacao('def', 'high');
  await outra();
  await outra();
  const vdsDaCascata = pedidos.filter((p) => p.url === 'player').slice(1).map((p) => p.visitorData);
  const vdNova = pedidos.filter((p) => p.url === 'player')[0]?.visitorData;
  check('a renovação de sempre não herda a identidade da renovação nova',
    vdsDaCascata.length > 0 && vdsDaCascata.every((v) => v !== vdNova), `${vdNova} vs ${vdsDaCascata.join(',')}`);
}

{
  // Com o VISIONOS a recusar, a identidade nova falha e cai na de sempre.
  clientesRecusados = new Set(['VISIONOS']);
  pedidos.length = 0;
  const renovar = criarRenovacao('ghi', 'high');
  const url = await renovar();
  const clientes = pedidos.filter((p) => p.url === 'player').map((p) => p.cliente);
  check('se a identidade nova falhar, faz a renovação de sempre na mesma vez',
    !!url && clientes[0] === 'VISIONOS' && clientes.length > 1, clientes.join(' > '));
  clientesRecusados = new Set();
}

console.log('\nHLS de recurso');
{
  pedidos.length = 0;
  const hls = await resolveYouTubeHls('abc', 'high');
  check('devolve um HLS', hls.isHls === true);
  check('escolhe a rendition só de áudio (itag 234), não a variante com vídeo',
    hls.url === 'https://manifest.test/itag/234/a.m3u8', hls.url);
  check('traz a duração e a loudness da resposta', hls.durationSeconds === 150 && hls.loudnessDb === 3);
  check('diz de onde veio', hls.client === 'VISIONOS+vd/hls', String(hls.client));

  const poupanca = await resolveYouTubeHls('abc', 'saver');
  check('em poupança de dados escolhe a 233', poupanca.url === 'https://manifest.test/itag/233/a.m3u8', poupanca.url);
}
{
  clientesRecusados = new Set(['VISIONOS']);
  const hls = await resolveYouTubeHls('abc', 'high');
  check('se o VISIONOS cair, tenta o IOS', hls.client === 'IOS+vd/hls', String(hls.client));
  clientesRecusados = new Set();
}
{
  comHls = false;
  let falhou = false;
  try { await resolveYouTubeHls('abc', 'high'); } catch { falhou = true; }
  check('sem manifesto nenhum, falha (e o leitor vai ao embed)', falhou);
  comHls = true;
}

console.log(bad ? `\n  ${bad} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(bad ? 1 : 0);
