const net = require('node:net');

/**
 * A ligação ao Discord, pelo socket local dele.
 *
 * ## Porque é aqui e não no renderer
 *
 * O Discord não tem API de rede para isto: expõe-se por um *named pipe* na
 * própria máquina (`\\.\pipe\discord-ipc-N` no Windows, um ficheiro em
 * `$XDG_RUNTIME_DIR` nos outros). Um renderer não abre pipes. É a mesma razão
 * que pôs a pesquisa do YouTube e o catálogo aqui.
 *
 * ## O protocolo, que é curto
 *
 * Cada mensagem é um cabeçalho de 8 bytes -- opcode e comprimento, os dois
 * inteiros de 32 bits em little-endian -- seguido de JSON. Opcodes: 0 é o
 * aperto de mão, 1 é um comando, 2 é fechar, 3 e 4 são ping e pong.
 *
 * Abre-se com o `client_id` da aplicação; a partir daí manda-se `SET_ACTIVITY`.
 *
 * ## O que este ficheiro promete
 *
 * **Nunca rebenta a app.** O Discord fechado é o caso NORMAL, não um erro: o
 * pipe não existe, a ligação falha, e a música continua a tocar sem que
 * ninguém dê por nada. Todos os caminhos de falha acabam em silêncio, e a
 * única coisa que sai daqui é um booleano a dizer se pegou.
 */

/** Os dez sockets que o Discord pode usar -- ele escolhe o primeiro livre. */
const SOCKETS = 10;

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

/**
 * Não mais do que um envio a cada 15 segundos.
 *
 * É o limite do próprio Discord por aplicação. Passar dele não dá erro
 * visível: as mensagens seguintes são simplesmente ignoradas, o que é pior do
 * que um erro -- a presença ficava presa numa faixa antiga sem nada a
 * explicar. Quem chama já filtra pelo conteúdo (ver `presencaMudou`); isto é a
 * rede de segurança.
 */
const INTERVALO_MS = 15_000;
/** A aplicação oficial da Duotone no portal do Discord. É um id público. */
const DISCORD_APP_ID = '1547625164328538133';

/**
 * Entrar ou sair de um Jam não é uma atualização cosmética.
 *
 * A presença normal pode esperar pelo limitador; uma mudança que adiciona ou
 * retira um `join secret` tem de substituir já o cartão anterior. Caso
 * contrário, durante os primeiros 15 segundos do Jam os amigos continuam a
 * ver "Listen on YouTube" — exatamente o botão errado no único momento em que
 * precisam de "Join".
 */
function mudancaDeJam(antes, depois) {
  const anterior = antes?.secrets?.join || null;
  const seguinte = depois?.secrets?.join || null;
  return anterior !== seguinte;
}

function caminhoDoSocket(n) {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${n}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
  return `${base.replace(/\/$/, '')}/discord-ipc-${n}`;
}

function moldar(opcode, dados) {
  const corpo = Buffer.from(JSON.stringify(dados), 'utf8');
  const cabecalho = Buffer.alloc(8);
  cabecalho.writeInt32LE(opcode, 0);
  cabecalho.writeInt32LE(corpo.length, 4);
  return Buffer.concat([cabecalho, corpo]);
}

class LigacaoAoDiscord {
  constructor() {
    this.socket = null;
    this.pronta = false;
    this.clientId = null;
    this.aLigar = null;
    this.ultimoEnvio = 0;
    this.porEnviar = null;
    this.relogio = null;
    this.aoJuntar = null;
    this.ultimaPedida = null;
  }

  /** Liga, ou devolve a ligação que já está a ser feita. */
  ligar(clientId) {
    if (this.pronta && this.clientId === clientId) return Promise.resolve(true);
    // Trocar de aplicação obriga a um aperto de mão novo.
    if (this.clientId && this.clientId !== clientId) this.fechar();
    if (this.aLigar) return this.aLigar;

    this.clientId = clientId;
    this.aLigar = this.tentarSockets(clientId).finally(() => { this.aLigar = null; });
    return this.aLigar;
  }

  async tentarSockets(clientId) {
    for (let n = 0; n < SOCKETS; n++) {
      const ok = await this.abrir(caminhoDoSocket(n), clientId).catch(() => false);
      if (ok) return true;
    }
    return false;
  }

  abrir(caminho, clientId) {
    return new Promise((resolver) => {
      let respondido = false;
      const acabar = (valor) => {
        if (respondido) return;
        respondido = true;
        resolver(valor);
      };

      let socket;
      try {
        socket = net.createConnection(caminho);
      } catch {
        acabar(false);
        return;
      }

      // Sem isto, um Discord a arrancar deixava a promessa pendurada e o
      // pedido seguinte a pensar que ainda havia uma ligação a caminho.
      const desistir = setTimeout(() => { socket.destroy(); acabar(false); }, 2000);

      socket.on('error', () => { clearTimeout(desistir); socket.destroy(); acabar(false); });
      socket.on('close', () => {
        clearTimeout(desistir);
        if (this.socket === socket) { this.socket = null; this.pronta = false; }
        acabar(false);
      });

      socket.on('connect', () => {
        socket.write(moldar(OP_HANDSHAKE, { v: 1, client_id: clientId }));
      });

      let buffer = Buffer.alloc(0);
      socket.on('data', (pedaco) => {
        buffer = Buffer.concat([buffer, pedaco]);
        // Uma leitura pode trazer meia mensagem ou duas: consome-se enquanto
        // houver cabeçalho e corpo completos.
        while (buffer.length >= 8) {
          const opcode = buffer.readInt32LE(0);
          const tamanho = buffer.readInt32LE(4);
          if (buffer.length < 8 + tamanho) break;
          const corpo = buffer.subarray(8, 8 + tamanho).toString('utf8');
          buffer = buffer.subarray(8 + tamanho);

          if (opcode === OP_PING) { socket.write(moldar(OP_PONG, corpo ? JSON.parse(corpo) : {})); continue; }
          if (opcode === OP_CLOSE) { socket.destroy(); continue; }
          if (opcode !== OP_FRAME) continue;
          try {
            const mensagem = JSON.parse(corpo);
            // O `READY` é a resposta ao aperto de mão. Só a partir dele é que
            // um `SET_ACTIVITY` significa alguma coisa.
            if (mensagem.evt === 'READY') {
              clearTimeout(desistir);
              this.socket = socket;
              this.pronta = true;
              // Uma ligação nova não herda o relógio da anterior. A primeira
              // atividade tem de aparecer já, especialmente se abriu por Join.
              this.ultimoEnvio = 0;
              // O segredo de uma actividade não chega sozinho: o cliente tem
              // de subscrever explicitamente o evento de Join depois do READY.
              socket.write(moldar(OP_FRAME, {
                cmd: 'SUBSCRIBE', evt: 'ACTIVITY_JOIN', nonce: `${Date.now()}-join`,
              }));
              acabar(true);
              if (this.porEnviar) this.despachar();
            } else if (
              mensagem.cmd === 'DISPATCH'
              && mensagem.evt === 'ACTIVITY_JOIN'
              && typeof mensagem.data?.secret === 'string'
            ) {
              // Um callback defeituoso nunca pode derrubar o leitor nem o pipe.
              try { this.aoJuntar?.(mensagem.data.secret); } catch { /* renderer indisponível */ }
            } else if (mensagem.evt === 'ERROR') {
              // O Discord responde a cada comando, e um ERROR a um SET_ACTIVITY
              // quer dizer que recusou a actividade INTEIRA: o perfil fica vazio.
              // Foi assim que o 5005 (segredo + botões) saiu numa release sem
              // ninguém dar por ele. Pelo menos no terminal passa a ver-se.
              console.warn('[discord]', mensagem.cmd, mensagem.data?.code, mensagem.data?.message);
            }
          } catch {
            // Uma mensagem que não se percebe não derruba a ligação.
          }
        }
      });
    });
  }

  /**
   * Guarda o que se quer mostrar e despacha respeitando o intervalo.
   *
   * Guardar em vez de enviar já é o que faz uma pausa seguida de um play não
   * se perder: o último estado é sempre o que acaba por sair.
   */
  definir(actividade) {
    const urgente = mudancaDeJam(this.ultimaPedida, actividade);
    this.ultimaPedida = actividade;
    this.porEnviar = { actividade };
    this.despachar(urgente);
  }

  despachar(urgente = false) {
    if (!this.pronta || !this.socket || !this.porEnviar) return;
    // Uma transição de Jam cabe folgadamente no orçamento do Discord e não
    // pode ficar atrás de uma atualização de faixa. O resto continua
    // coalescido pelo limitador conservador.
    if (urgente && this.relogio) { clearTimeout(this.relogio); this.relogio = null; }
    const espera = urgente ? 0 : INTERVALO_MS - (Date.now() - this.ultimoEnvio);
    if (espera > 0) {
      if (!this.relogio) this.relogio = setTimeout(() => { this.relogio = null; this.despachar(); }, espera);
      return;
    }
    const { actividade } = this.porEnviar;
    this.porEnviar = null;
    this.ultimoEnvio = Date.now();
    try {
      this.socket.write(moldar(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        nonce: `${Date.now()}`,
        // `activity: null` é como se LIMPA a presença. Sem isto, parar a
        // música deixava a última faixa colada ao perfil.
        args: { pid: process.pid, activity: actividade ?? null },
      }));
    } catch {
      this.fechar();
    }
  }

  fechar() {
    if (this.relogio) { clearTimeout(this.relogio); this.relogio = null; }
    if (this.socket) { try { this.socket.destroy(); } catch { /* já estava fechado */ } }
    this.socket = null;
    this.pronta = false;
    this.clientId = null;
    this.porEnviar = null;
    this.ultimoEnvio = 0;
    this.ultimaPedida = null;
  }
}

const ligacao = new LigacaoAoDiscord();

/**
 * Mostra (ou limpa) a presença. Devolve se o Discord está do outro lado.
 *
 * `actividade` a `null` limpa. `clientId` vazio desliga e fecha.
 */
async function definirPresenca(clientId, actividade) {
  if (!clientId) { ligacao.fechar(); return false; }
  const ligado = await ligacao.ligar(clientId);
  if (!ligado) return false;
  ligacao.definir(actividade);
  return true;
}

/** Abre só a ligação/subscrição, sem publicar o que a pessoa está a ouvir. */
async function prepararDiscord(clientId = DISCORD_APP_ID) {
  return ligacao.ligar(clientId);
}

function ouvirJuncao(listener) {
  ligacao.aoJuntar = typeof listener === 'function' ? listener : null;
}

module.exports = {
  DISCORD_APP_ID,
  mudancaDeJam,
  definirPresenca,
  prepararDiscord,
  ouvirJuncao,
  fecharDiscord: () => ligacao.fechar(),
};
