/**
 * A saúde do processo principal do Electron.
 *
 * O renderer só vê os erros dele. O que o mata (um crash, falta de memória), o
 * que prende a janela, a GPU que cai e as exceções do próprio processo
 * principal ficam aqui, num ficheiro em `userData`, até o renderer os pedir
 * (`saude:ler`) e os mandar para a analítica com as mesmas regras do iPhone
 * (src/lib/saudeDaApp.ts -- lá é que o texto é limpo).
 *
 * Os crashes nativos ficam no Crashpad (`crashReporter.start`, sem envio para
 * servidor nenhum): conta-se quantos relatórios novos apareceram desde a
 * última leitura, para se saber que houve um, e o `.dmp` fica no disco para
 * quem o quiser abrir.
 *
 * Sem `require('electron')`: `scripts/test-saude-electron.mjs` corre isto em
 * Node com uma pasta temporária.
 */
const fs = require('node:fs');
const path = require('node:path');

const MAX_INCIDENTES = 20;
/** Recarregar o renderer é a cura; em ciclo, é o problema. */
const MAX_RECARGAS = 3;
const JANELA_DAS_RECARGAS_MS = 5 * 60 * 1000;

function lerJson(ficheiro, porOmissao) {
  try {
    return JSON.parse(fs.readFileSync(ficheiro, 'utf8'));
  } catch {
    return porOmissao;
  }
}

function escreverJson(ficheiro, valor) {
  try {
    fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
    fs.writeFileSync(ficheiro, JSON.stringify(valor));
  } catch {
    // Sem disco não há registo -- e nunca pode ser isto a partir a app.
  }
}

/** Os `.dmp` debaixo de uma pasta (o Crashpad arruma-os em subpastas). */
function contarDumps(pasta, desde) {
  let n = 0;
  let maisRecente = desde;
  const visitar = (dir, fundo) => {
    if (fundo > 4) return;
    let entradas;
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) visitar(caminho, fundo + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.dmp')) {
        try {
          const quando = fs.statSync(caminho).mtimeMs;
          if (quando > desde) {
            n++;
            if (quando > maisRecente) maisRecente = quando;
          }
        } catch {
          // apagado entretanto
        }
      }
    }
  };
  if (pasta) visitar(pasta, 0);
  return { n, maisRecente };
}

function criarSaude({ pastaDeDados, pastaDosDumps, versao, agora = () => Date.now() }) {
  const ficheiro = path.join(pastaDeDados, 'saude-incidentes.json');
  const ficheiroDosDumps = path.join(pastaDeDados, 'saude-dumps.json');
  const processoComecouEm = agora() - Math.round(process.uptime() * 1000);
  const recargas = [];

  function registar(incidente) {
    const lista = lerJson(ficheiro, []);
    const novo = { ...incidente, quando: incidente.quando ?? agora(), versao: incidente.versao ?? versao };
    const ultimo = Array.isArray(lista) ? lista[lista.length - 1] : null;
    let seguinte;
    if (
      ultimo && ultimo.tipo === novo.tipo && ultimo.motivo === novo.motivo
      && ultimo.mensagem === novo.mensagem && novo.quando - ultimo.quando < 60_000
    ) {
      seguinte = [...lista.slice(0, -1), { ...ultimo, quando: novo.quando, vezes: (ultimo.vezes ?? 1) + 1 }];
    } else {
      seguinte = [...(Array.isArray(lista) ? lista : []), novo].slice(-MAX_INCIDENTES);
    }
    escreverJson(ficheiro, seguinte);
  }

  /** O que o renderer pede: os incidentes guardados (e apaga-os) e os dumps novos. */
  function ler() {
    const lista = lerJson(ficheiro, []);
    escreverJson(ficheiro, []);
    const estado = lerJson(ficheiroDosDumps, null);
    const desde = Number(estado?.desde);
    const incidentes = Array.isArray(lista) ? lista : [];
    if (Number.isFinite(desde)) {
      const { n, maisRecente } = contarDumps(pastaDosDumps, desde);
      if (n > 0) incidentes.push({ tipo: 'crash-nativo', quando: Math.round(maisRecente), onde: 'crashpad', vezes: n, versao });
      escreverJson(ficheiroDosDumps, { desde: Math.max(desde, maisRecente) });
    } else {
      // Primeira vez: o que já lá estava é de antes, não se conta.
      escreverJson(ficheiroDosDumps, { desde: agora() });
    }
    return { incidentes, processoComecouEm };
  }

  /** `render-process-gone`: regista e diz se vale a pena recarregar. */
  function rendererMorreu(detalhes) {
    const motivo = String(detalhes?.reason ?? 'desconhecido');
    // `clean-exit` é a janela a fechar; não é uma falha.
    if (motivo === 'clean-exit') return false;
    registar({ tipo: 'renderer', fatal: true, onde: 'renderer', motivo, codigo: Number(detalhes?.exitCode) || 0 });
    const t = agora();
    while (recargas.length && t - recargas[0] > JANELA_DAS_RECARGAS_MS) recargas.shift();
    if (recargas.length >= MAX_RECARGAS) return false;
    recargas.push(t);
    return true;
  }

  function processoFilhoMorreu(detalhes) {
    const tipo = String(detalhes?.type ?? '');
    const motivo = String(detalhes?.reason ?? '');
    if (motivo === 'clean-exit' || motivo === 'killed') return;
    if (tipo === 'GPU') registar({ tipo: 'gpu', fatal: false, onde: 'gpu', motivo, codigo: Number(detalhes?.exitCode) || 0 });
  }

  function erroDoPrincipal(erro, onde) {
    registar({
      tipo: 'principal',
      fatal: false,
      onde,
      nome: String(erro?.name ?? typeof erro).slice(0, 40),
      // O texto é limpo no renderer, antes de sair do aparelho.
      mensagem: String(erro?.message ?? erro ?? '').slice(0, 300),
    });
  }

  function janelaPresa() {
    registar({ tipo: 'bloqueio', fatal: false, onde: 'janela', motivo: 'unresponsive' });
  }

  return { registar, ler, rendererMorreu, processoFilhoMorreu, erroDoPrincipal, janelaPresa, processoComecouEm };
}

module.exports = { criarSaude, contarDumps, MAX_INCIDENTES, MAX_RECARGAS };
