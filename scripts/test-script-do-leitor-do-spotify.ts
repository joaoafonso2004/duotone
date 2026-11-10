/**
 * O script que entra na página do Spotify no iPhone (11/11) -- src/lib/scriptDoLeitorDoSpotify.ts.
 * Corre num `vm` com um `window` falso: o `fetch` e o `XMLHttpRequest` da
 * página, o script do leitor e o pathfinder. Nada vai à rede.
 *
 * Correr: node --experimental-strip-types scripts/test-script-do-leitor-do-spotify.ts
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  chamadaDaConsulta, chegouAoLeitor, doGoogle, ENDERECO_DO_LOGIN, HASHES_GUARDADOS, lerMensagem, SCRIPT_DO_LEITOR,
} from '../src/lib/scriptDoLeitorDoSpotify.ts';

const SCRIPT = 'https://open.spotifycdn.com/cdn/build/web-player/web-player.0123abcd.js';
const HASH_NOVO = 'a'.repeat(64);

function pagina(respostas: { status?: number; json?: unknown }[]) {
  const mensagens: any[] = [];
  const pedidos: { url: string; opcoes: any }[] = [];
  const fetchDaPagina = async (url: string, opcoes: any) => {
    if (url === SCRIPT) return { text: async () => `a,"fetchPlaylist","query","${HASH_NOVO}",b` };
    // Os pedidos do próprio leitor (sem corpo, aqui) não gastam as respostas preparadas.
    if (!opcoes?.body) return { status: 200, ok: true, json: async () => ({ data: {} }) };
    pedidos.push({ url, opcoes });
    const r = respostas.shift() ?? { json: { data: {} } };
    return { status: r.status ?? 200, ok: (r.status ?? 200) < 400, json: async () => r.json };
  };
  class XHR {
    open() {}
    setRequestHeader() {}
    send() {}
  }
  const window: any = {
    fetch: fetchDaPagina,
    ReactNativeWebView: { postMessage: (t: string) => mensagens.push(JSON.parse(t)) },
  };
  const contexto = vm.createContext({
    window, XMLHttpRequest: XHR, document: { scripts: [{ src: SCRIPT }] }, performance: { getEntriesByType: () => [] },
    Promise, JSON, RegExp, String, Object,
  });
  vm.runInContext(SCRIPT_DO_LEITOR, contexto);
  const esperar = () => new Promise((r) => setTimeout(r, 5));
  return { window, contexto, mensagens, pedidos, esperar, XHR };
}

async function main() {
  {
    const p = pagina([{ json: { data: { playlistV2: { name: 'X' } } } }]);
    // Antes de o leitor fazer um pedido, não há cabeçalhos: é como não ter sessão.
    vm.runInContext(chamadaDaConsulta(1, 'fetchPlaylist', { uri: 'spotify:playlist:x' }), p.contexto);
    await p.esperar();
    assert.deepEqual(p.mensagens, [{ tipo: 'resposta', id: 1, ok: false, falha: 'desligado' }]);

    // O leitor faz o seu pedido (com um Headers, que tem forEach): os cabeçalhos ficam.
    const headers = new Map([['Authorization', 'Bearer T'], ['client-token', 'C'], ['spotify-app-version', '1.2.95']]);
    await p.window.fetch('https://api-partner.spotify.com/pathfinder/v2/query', { headers });
    await p.window.fetch('https://api-partner.spotify.com/pathfinder/v2/query', { headers });
    assert.deepEqual(p.mensagens.slice(1), [{ tipo: 'pronto' }], '"pronto" uma vez só');
    p.pedidos.length = 0;

    vm.runInContext(chamadaDaConsulta(2, 'fetchPlaylist', { uri: 'spotify:playlist:x', offset: 0, limit: 1 }), p.contexto);
    await p.esperar();
    const r = p.mensagens.at(-1);
    assert.deepEqual(r, { tipo: 'resposta', id: 2, ok: true, dados: { playlistV2: { name: 'X' } } });
    const pedido = p.pedidos.at(-1)!;
    assert.equal(pedido.url, 'https://api-partner.spotify.com/pathfinder/v2/query');
    assert.equal(pedido.opcoes.headers.authorization, 'Bearer T', 'com o token do próprio leitor');
    assert.equal(pedido.opcoes.headers['client-token'], 'C');
    const corpo = JSON.parse(pedido.opcoes.body);
    assert.equal(corpo.operationName, 'fetchPlaylist');
    assert.equal(corpo.extensions.persistedQuery.sha256Hash, HASH_NOVO, 'o hash lido do script do leitor');
    assert.deepEqual(corpo.variables, { uri: 'spotify:playlist:x', offset: 0, limit: 1 });
  }

  {
    // Sem o hash no script, vai o guardado.
    const p = pagina([{ json: { data: { me: { profile: {} } } } }]);
    await p.window.fetch('https://api-partner.spotify.com/x', { headers: { authorization: 'Bearer T', 'client-token': 'C' } });
    vm.runInContext(chamadaDaConsulta(3, 'profileAttributes', {}), p.contexto);
    await p.esperar();
    assert.equal(JSON.parse(p.pedidos.at(-1)!.opcoes.body).extensions.persistedQuery.sha256Hash, HASHES_GUARDADOS.profileAttributes);
    assert.equal(p.mensagens.at(-1).ok, true);
  }

  {
    // As falhas, uma a uma.
    const p = pagina([
      { status: 401 }, { status: 429 }, { status: 403 },
      { json: { errors: [{ message: 'PersistedQueryNotFound' }] } },
      { json: { errors: [{ message: 'User not authorized' }], data: { me: null } } },
      { json: { errors: [{ message: 'Something' }] } },
    ]);
    await p.window.fetch('https://api-partner.spotify.com/x', { headers: { authorization: 'Bearer T', 'client-token': 'C' } });
    for (let id = 10; id < 16; id++) {
      vm.runInContext(chamadaDaConsulta(id, 'libraryV3', { offset: 0 }), p.contexto);
      await p.esperar();
    }
    assert.deepEqual(p.mensagens.filter((m) => m.tipo === 'resposta').map((m) => m.falha),
      ['desligado', 'ocupado', 'recusado', 'mudou', 'desligado', 'recusado']);
  }

  {
    // O leitor também pode pedir por XMLHttpRequest.
    const p = pagina([]);
    const x = new p.contexto.XMLHttpRequest();
    x.open('POST', 'https://api-partner.spotify.com/pathfinder/v2/query');
    x.setRequestHeader('Authorization', 'Bearer X');
    x.setRequestHeader('Client-Token', 'CX');
    x.send('{}');
    assert.deepEqual(p.mensagens, [{ tipo: 'pronto' }]);
  }

  {
    // Pedidos a outros sítios não contam.
    const p = pagina([]);
    await p.window.fetch('https://spclient.wg.spotify.com/x', { headers: { authorization: 'Bearer T', 'client-token': 'C' } });
    assert.deepEqual(p.mensagens, []);
  }

  // As mensagens e os endereços.
  assert.deepEqual(lerMensagem('{"tipo":"pronto"}'), { tipo: 'pronto' });
  assert.deepEqual(lerMensagem('{"tipo":"resposta","id":4,"ok":true,"dados":{"a":1}}'), { tipo: 'resposta', id: 4, ok: true, dados: { a: 1 } });
  assert.deepEqual(lerMensagem('{"tipo":"resposta","id":4,"ok":false}'), { tipo: 'resposta', id: 4, ok: false, falha: 'rede' });
  assert.equal(lerMensagem('lixo'), null);
  assert.equal(lerMensagem('{"outra":"coisa"}'), null);
  assert.equal(doGoogle('https://accounts.google.com/o/oauth2/v2/auth?x'), true);
  assert.equal(doGoogle('https://accounts.spotify.com/login'), false);
  assert.equal(chegouAoLeitor('https://open.spotify.com/'), true);
  assert.equal(chegouAoLeitor('https://open.spotify.com/intl-pt'), true);
  assert.equal(chegouAoLeitor('https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F'), false, 'o "continue" do login não engana');
  assert.match(ENDERECO_DO_LOGIN, /^https:\/\/accounts\.spotify\.com\/login\?continue=/);

  console.log('script do leitor do Spotify (iPhone): ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
