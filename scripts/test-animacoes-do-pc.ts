/**
 * As animações do PC -- o CSS global da casca e as marcas que o chamam.
 *
 * Este teste existe por causa de um dia inteiro perdido a 20/9: as animações
 * estavam todas escritas, o CSS estava todo injetado, e NADA se mexia. A razão
 * é que o react-native-web desta versão **deita fora o `className`** de
 * qualquer componente RN -- medido num ecrã de ensaio, com uma sonda que levava
 * as três vias ao mesmo tempo: `className` não chegou ao DOM, `dataSet` e
 * `nativeID` chegaram. Com ele morreram em silêncio o vidro da janela
 * (`glass-panel`), o ponto das barras de progresso (`slider-thumb`) e as
 * animações novas -- e na lista de faixas o play ficava POR CIMA do número,
 * porque a regra que esconde um dos dois nunca se aplicava. Foi assim que a
 * 3.7.0 saiu.
 *
 * Por isso este ficheiro lê o código como TEXTO e prende três coisas:
 *   1. nenhum componente RN volta a levar `className` (um `<div>` a sério pode);
 *   2. toda a marca usada no código tem regra no CSS, e toda a regra tem marca
 *      que a produza -- é o outro lado do mesmo erro, e não dá erro nenhum;
 *   3. quem pediu menos movimento continua a ter por onde o desligar.
 *
 * Correr: node --experimental-strip-types scripts/test-animacoes-do-pc.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

/** Ficheiros que desenham o PC: tudo o que é `.web`, mais a casca e o ui. */
function ficheirosDoPc(raiz: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) { ficheirosDoPc(caminho, achados); continue; }
    if (/\.web\.tsx?$/.test(nome)) achados.push(caminho.replace(/\\/g, '/'));
  }
  return achados;
}

const FICHEIROS = ficheirosDoPc('src');
const CASCA = readFileSync('src/desktop/casca.web.tsx', 'utf8');

/**
 * Os sítios onde o `className` é legítimo, porque são `<div>` do DOM e num
 * elemento a sério o atributo passa: a fila do Now Playing (precisa de
 * `onPointerDown` e de captura do ponteiro) e a janela do mini leitor (24/9:
 * precisa do `-webkit-app-region` para se arrastar e de hover em CSS). E o
 * coração animado (16/10): um `<span>` e um `<svg>` do DOM, com o CSS dele
 * injetado no documento de quem o desenha (o mini leitor é outra janela).
 */
const COM_LICENCA = new Set(['src/desktop/FilaArrastavel.web.tsx', 'src/janelaMini.web.tsx', 'src/components/CoracaoAnimado.web.tsx']);

console.log('\no className não passa em componentes RN');
caso('nenhum ficheiro do PC lhe volta a tocar', () => {
  const culpados: string[] = [];
  for (const f of FICHEIROS) {
    if (COM_LICENCA.has(f)) continue;
    const linhas = readFileSync(f, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      // Só a passagem da prop conta; falar dela num comentário é o que este
      // ficheiro e o `marcar` fazem.
      if (/className\s*[=:]/.test(linha) && !/^\s*\*/.test(linha) && !linha.includes('//')) {
        culpados.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(culpados, [], `usa className (o RNW deita-o fora): ${culpados.join(', ')}`);
});

caso('o ficheiro com licença é mesmo um elemento do DOM (<div>, <span>, <svg>) e não um componente RN', () => {
  for (const f of COM_LICENCA) {
    const s = readFileSync(f, 'utf8');
    const m = s.match(/<(?:div|span|svg|path)[\s\S]{0,400}?className=/);
    assert.ok(m, `${f} está na lista de exceções mas o className não está num elemento do DOM`);
  }
});

caso('o marcador continua a ser o dataSet, e não outra coisa', () => {
  const ui = readFileSync('src/desktop/ui.web.tsx', 'utf8');
  // Os nomes vazios ficam de fora (22/11: `marcar('veu', aSair ? 'a-sair' : '')`).
  assert.match(ui, /export const marcar = \(\.\.\.nomes: string\[\]\) => \(\{ dataSet: \{ dt: nomes\.filter\(Boolean\)\.join\(' '\) \} \}/,
    'o `marcar` mudou de forma -- se deixar de escrever `dataSet`, nada chega ao DOM');
});

console.log('\ncada marca tem regra, e cada regra tem marca');
/** As marcas que o código põe nos elementos. */
const usadas = new Set<string>();
for (const f of FICHEIROS) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/marcar\(([^)]*)\)/g)) {
    for (const nome of m[1].matchAll(/'([^']+)'/g)) usadas.add(nome[1]);
  }
  // Um elemento do DOM a sério (um <img>, um <div>) leva o atributo direto:
  // o `dataSet` é do RNW e num elemento do DOM não chega a lado nenhum.
  for (const m of s.matchAll(/data-dt="([^"]+)"/g)) {
    for (const nome of m[1].split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(nome)) usadas.add(nome);
  }
}
/** As marcas que o CSS global espera. */
const noCss = new Set<string>();
for (const m of CASCA.matchAll(/\[data-dt~="([^"]+)"\]/g)) noCss.add(m[1]);

caso('há marcas dos dois lados (senão este teste não prova nada)', () => {
  assert.ok(usadas.size >= 15, `só ${usadas.size} marcas no código`);
  assert.ok(noCss.size >= 15, `só ${noCss.size} marcas no CSS`);
});
caso('nenhuma marca do código ficou sem regra', () => {
  const orfas = [...usadas].filter((n) => !noCss.has(n)).sort();
  assert.deepEqual(orfas, [], `marcadas no código e sem CSS: ${orfas.join(', ')}`);
});
caso('nenhuma regra do CSS ficou sem quem a marque', () => {
  const orfas = [...noCss].filter((n) => !usadas.has(n)).sort();
  assert.deepEqual(orfas, [], `no CSS e em elemento nenhum: ${orfas.join(', ')}`);
});

console.log('\nas regras que custaram a encontrar ficam presas');
caso('a lista troca o número pelo play, e não os mostra aos dois', () => {
  assert.match(CASCA, /\[data-dt~="fila"\] \[data-dt~="toca"\]\{ opacity:0;/,
    'sem isto o play fica por cima do número (o defeito da 3.7.0)');
  assert.match(CASCA, /\[data-dt~="fila"\]:hover \[data-dt~="numero"\][^{]*\{ opacity:0; \}/,
    'o número tem de sair quando o play entra');
});
caso('o realce que desliza acompanha também a ALTURA', () => {
  const bloco = CASCA.match(/\[data-dt~="desliza"\]\{ transition:[^}]+\}/)?.[0] ?? '';
  for (const prop of ['transform', 'width', 'height']) {
    assert.ok(bloco.includes(prop), `a pílula/realce não transita ${prop}: ${bloco}`);
  }
});
caso('nada de backdrop-filter na superfície da janela', () => {
  // Um backdrop-filter do tamanho da janela refaz-se a cada pintura, e esta
  // janela tem sempre alguma coisa a mexer. O desfoque do fundo é estático e
  // vive no estilo da imagem.
  assert.ok(!/backdrop-filters*:/.test(CASCA), 'voltou o backdrop-filter à superfície');
  const estilos = readFileSync('src/desktop/estilos.web.ts', 'utf8');
  assert.match(estilos, /backgroundImage:[\s\S]{0,400}?filter: 'blur\((\d+)px\) brightness/,
    'o fundo deixou de trazer o desfoque dele');
});
caso('a barra dos amigos anda por escala, aos passos, sem transição', () => {
  // Recebe uma posição por segundo. Com `width` o layout refazia-se a cada
  // fotograma (~450 vezes por segundo com 8 amigos, medido a 28/9); o `scaleX`
  // fica no compositor. E SEM transição (22/11): a de 1 s, recomeçada a cada
  // segundo, nunca parava, e a GPU do WebView2 desenhava a janela a cada
  // fotograma (~5 % do PC na 7.0.0). Aos passos, um desenho por segundo.
  for (const f of ['src/desktop/AmigosNaLateral.web.tsx', 'src/components/SocialOverview.web.tsx', 'src/components/SocialPc.web.tsx']) {
    const t = readFileSync(f, 'utf8');
    assert.ok(!/transition: 'width/.test(t), `${f}: a barra dos amigos voltou a animar a largura`);
    assert.ok(!/transition: 'transform 1s linear'/.test(t), `${f}: a transição de 1 s voltou (desenha a janela sem parar)`);
  }
  const amigos = readFileSync('src/desktop/AmigosNaLateral.web.tsx', 'utf8');
  assert.match(amigos, /scaleX: [^\n]*transformOrigin: 'left'/, 'a escala tem de crescer da esquerda');
});
caso('as barrinhas a tocar andam aos saltos, como um medidor', () => {
  // 4 desenhos por volta, em vez de 60 por segundo (22/11).
  const casca = readFileSync('src/desktop/casca.web.tsx', 'utf8');
  assert.match(casca, /\[data-dt~="eq"\] > \*\{ transform-origin: bottom; animation: dt-eq 1s step-end infinite; \}/, 'o eq voltou a deslizar');
  assert.match(casca, /\[data-dt~="barra"\]\{ animation: dt-pular var\(--dt-barra-1, 900ms\) step-end infinite; \}/, 'as barras da fila voltaram a deslizar');
});
caso('os nomes de classe antigos não voltaram', () => {
  assert.ok(!CASCA.includes('glass-panel'), 'sobrou o nome antigo do vidro');
  assert.ok(!/slider-(container|fill|thumb)/.test(CASCA), 'sobraram as classes antigas da barra');
});
caso('só as primeiras linhas de uma lista é que entram a animar', () => {
  // Uma biblioteca de milhares de faixas arrancava com milhares de animações
  // no mesmo fotograma, e da décima segunda para baixo ninguém as vê.
  const m = CASCA.match(/([^\n]*)\{ animation: dt-linha /);
  assert.ok(m, 'a animação de entrada das linhas desapareceu');
  assert.ok(/nth-child\(-n\+\d+\)|first-child/.test(m[1]),
    `a animação apanha TODAS as linhas: ${m[1].trim()}`);
});

console.log('\nquem pediu menos movimento continua servido');
caso('há um interruptor geral e apanha as animações e as transições', () => {
  // A última: a primeira é a do movimento antigo da casca.
  const i = CASCA.lastIndexOf('prefers-reduced-motion');
  assert.ok(i > 0, 'não há media query de movimento reduzido');
  const bloco = CASCA.slice(i, i + 1200);
  assert.ok(bloco.includes('animation: none !important'), 'as animações não são desligadas');
  assert.ok(bloco.includes('transition: none !important'), 'as transições não são desligadas');
});

console.log('\nas prateleiras que chegam da rede andam para a direita (1/10)');

caso('o carrossel liga-se quando a lista aparece, e não só no arranque', () => {
  const ui = readFileSync('src/desktop/ui.web.tsx', 'utf8');
  const i = ui.indexOf('function useCarrossel()');
  const hook = ui.slice(i, ui.indexOf('function SetaDaPrateleira', i));
  // A Daily mix, os Rare finds e as dos amigos montam vazias (a Shelf devolve
  // null): lido no arranque, o elemento não existia e nada ficava ligado.
  assert.ok(/const ligar = useCallback\(\(n: any\) => \{ ref\.current = n; setNo\(n\); \}, \[\]\);/.test(hook), 'o ref é de chamada');
  assert.ok(/\}, \[no\]\);/.test(hook), 'o efeito volta a correr quando a lista aparece');
  assert.ok(hook.includes('return { ref: ligar,'), 'quem usa recebe o ref de chamada');
  assert.ok(/observador\?\.observe\(conteudo\)/.test(hook), 'mais cartões acendem a seta sem redimensionar');
});

console.log('\no painel da direita e a barra do leitor (22/11: o João viu-os aos saltos)');
// Os finais de linha do Windows (o CI faz checkout com CRLF): estes leem em LF.
const emLf = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const PAINEL = emLf('src/desktop/PainelDoLeitor.web.tsx');
const CASCA_LF = CASCA.replace(/\r\n/g, '\n');

caso('o estilo do painel não traz um transition (de 9/11 a 22/11 substituía o do CSS e o painel saltava)', () => {
  const i = PAINEL.indexOf('<div id="painel-do-leitor"');
  assert.ok(i > 0, 'o painel');
  const estilo = PAINEL.slice(i, PAINEL.indexOf('}}>', i));
  assert.doesNotMatch(estilo, /\btransition\s*:/, 'um transition inline anula o do CSS');
  assert.match(estilo, /transform: `translateX\(\$\{noSitio \? 0 : 100\}%\)`/, 'continua a deslizar pelo transform');
});
caso('o CSS da casca anima o deslizar e a cor do painel, e não a arrastar a largura', () => {
  assert.match(CASCA_LF, /\[data-dt~="painel-do-leitor"\] \{ transition: transform 240ms var\(--dt-curva\), background-color 220ms var\(--dt-curva\); will-change: transform; \}/);
  assert.match(CASCA_LF, /html\[data-a-redimensionar\] \[data-dt~="painel-do-leitor"\]\{ transition: none !important; \}/);
});
caso('o lugar da barra do leitor fecha-se com a mesma curva, a partir da altura dela', () => {
  assert.match(CASCA_LF, /\[data-dt~="saida-da-barra"\] \{ flex-shrink: 0; overflow: hidden; pointer-events: none;\n\s*animation: dt-barra-sai 320ms var\(--dt-curva\) both; \}/);
  assert.match(CASCA_LF, /@keyframes dt-barra-sai \{ from \{ height: var\(--dt-altura-da-barra\); \} to \{ height: 0; \} \}/);
  assert.match(CASCA_LF, /\[data-dt~="entrada-da-barra"\], \[data-dt~="saida-da-barra"\],/, 'o menos movimento desliga as duas');
});
caso('a altura lê-se no render da mudança, e as duas barras do fundo saem assim', () => {
  const g = emLf('src/desktop/saidaDaBarra.web.tsx');
  assert.match(g, /if \(anterior !== conteudo\) \{\n\s*setAnterior\(conteudo\);\n\s*const h = ref\.current\?\.offsetHeight \?\? 0;/, 'o padrão do React (guardar o render anterior)');
  assert.match(g, /setAltura\(anterior && !conteudo && h > 0 && !menosMovimentoAgora\(\) \? h : null\);/, 'só quando a barra fica sem nada (e não numa troca)');
  assert.match(g, /const t = setTimeout\(\(\) => setAltura\(null\), 500\);/, 'tira-se mesmo sem o animationend');
  assert.match(g, /<div data-dt="saida-da-barra" aria-hidden\n\s*style=\{\{ \['--dt-altura-da-barra' as any\]: `\$\{altura\}px` \}\} onAnimationEnd=\{\(\) => setAltura\(null\)\} \/>/);
  const inicio = CASCA_LF.indexOf('export function PlayerBar(');
  const corpo = CASCA_LF.slice(inicio, CASCA_LF.indexOf('\n}\n', inicio));
  assert.match(corpo, /const \{ ref: barraRef, espaco: saidaDaBarra \} = useSaidaDaBarra\(p\.current\);/);
  assert.match(corpo, /return <div data-dt="entrada-da-barra" ref=\{barraRef\}><div>/, 'a altura é a da barra que está no ecrã');
  const outro = emLf('src/desktop/OutroAparelho.web.tsx');
  assert.match(outro, /const \{ ref, espaco \} = useSaidaDaBarra\(oferta\);\n\s*if \(!oferta\) return <>\{espaco\}<\/>;/, 'a do outro aparelho também sai');
  assert.match(outro, /<div data-dt="entrada-da-barra" ref=\{ref\}><div>\n\s*<View style=\{styles\.player\}>/, 'e entra a abrir o lugar');
});

console.log('\ntudo o que entra também sai (22/11, antes da 7.0.0)');
const UI_LF = emLf('src/desktop/ui.web.tsx');
caso('o diálogo sai com o que mostrava, e também quando o desmontam numa Saida', () => {
  const dialogo = UI_LF.slice(UI_LF.indexOf('export function Dialog('), UI_LF.indexOf('export function Toast('));
  assert.match(dialogo, /const \{ montado, aSair: aSairDeDentro \} = useSaida\(open, SAIDA_MS\);\n\s*const aSairDeFora = useASair\(\);/);
  assert.match(dialogo, /if \(open\) visto\.current = \{ title, children, width, semVeu, lavagem \};/, 'o conteúdo do último render aberto');
  assert.match(dialogo, /if \(!montado\) return null;/);
  assert.match(dialogo, /marcar\('veu', aSair \? 'a-sair' : ''\)/);
  assert.match(dialogo, /marcar\('dialogo', aSair \? 'a-sair' : ''\)/);
  assert.match(dialogo, /pointerEvents=\{aSair \? 'none' : 'auto'\}/, 'a sair não apanha o rato');
});
caso('o aviso desce e apaga-se antes de avisar quem o mostrou', () => {
  const toast = UI_LF.slice(UI_LF.indexOf('export function Toast('));
  assert.match(toast, /const id = setTimeout\(\(\) => setASair\(true\), duracaoDoAviso\(\{ tipo \}\)\);/);
  assert.match(toast, /const id = setTimeout\(\(\) => onDoneRef\.current\(\), SAIDA_MS\);/);
  assert.match(toast, /marcar\('aviso', aSair \? 'a-sair' : ''\)/);
  assert.match(emLf('src/desktop/AvisoComDesfazer.web.tsx'), /const aSair = useASair\(\);\n\s*return <View ref=\{caixa\} \{\.\.\.marcar\('aviso', aSair \? 'a-sair' : ''\)\}/);
});
caso('a barra da seleção, a BottomSheet e os diálogos em portal saem numa Saida', () => {
  assert.match(emLf('src/desktop/BarraDaSelecao.web.tsx'), /<Saida aberto=\{faixas\.length > 0\}>\{\(\) => \(\n\s*<NaSaida>/);
  assert.match(emLf('src/components/BottomSheet.web.tsx'), /return <Saida aberto=\{visible\}>\{\(\) => createPortal\(/);
  assert.match(emLf('src/desktop/ContaDoSpotifyPc.web.tsx'), /<Saida aberto=\{!!biblioteca\}>\{\(\) => createPortal\(/);
  assert.match(emLf('src/desktop/ProgressoDaImportacao.web.tsx'), /<Saida aberto=\{verFaltas && typeof document !== 'undefined'\}>\{\(\) => createPortal\(/);
  assert.match(emLf('src/desktop/MenuDoAmigo.web.tsx'), /return <Saida aberto=\{!!amigo\}>\{\(\) => \{\n\s*if \(!amigo\) return null;/);
  const saida = emLf('src/desktop/Saida.web.tsx');
  assert.match(saida, /export const SAIDA_MS = 160;/, 'a curva de sair do PC');
  assert.match(saida, /if \(aberto\) ultimo\.current = children\(\);/, 'o conteúdo só se escreve aberto');
});
caso('o menu deixa uma cópia a desvanecer, sem ids, sem rato e sem mais nada a mexer', () => {
  assert.match(emLf('src/desktop/MenuDeContexto.web.tsx'), /useLayoutEffect\(\(\) => \(\) => \{ sairComFantasma\(caixa\.current\); sairComFantasma\(painel\.current\); \}, \[\]\);/);
  const f = emLf('src/desktop/fantasma.web.ts');
  assert.match(f, /if \(!el \|\| !el\.isConnected \|\| typeof document === 'undefined' \|\| menosMovimentoAgora\(\)\) return;/);
  assert.match(f, /copia\.querySelectorAll\('\[id\]'\)\.forEach\(\(n\) => n\.removeAttribute\('id'\)\);/);
  assert.match(f, /copia\.setAttribute\('inert', ''\);/);
  assert.match(f, /setTimeout\(fim, SAIDA_MS \+ 120\);/, 'a cópia nunca fica, mesmo sem o finish');
  assert.match(CASCA_LF, /\[data-fantasma\], \[data-fantasma\] \*\{ animation: none !important; transition: none !important; \}/);
});
caso('o CSS das saídas: a curva de sair, sem rato, e nada com o menos movimento', () => {
  assert.match(CASCA_LF, /\[data-dt~="a-sair"\]\{ pointer-events: none !important; \}/);
  assert.match(CASCA_LF, /\[data-dt~="veu"\]\[data-dt~="a-sair"\]\{ animation: dt-desaparecer var\(--dt-sair-ms\) var\(--dt-sair\) both; \}/);
  assert.match(CASCA_LF, /\[data-dt~="dialogo"\]\[data-dt~="a-sair"\]\{ animation: dt-dialogo-sai var\(--dt-sair-ms\) var\(--dt-sair\) both; \}/);
  assert.match(CASCA_LF, /\[data-dt~="aviso"\]\[data-dt~="a-sair"\], \[data-dt~="barra-da-selecao"\]\[data-dt~="a-sair"\]\{\n\s*animation: dt-descer var\(--dt-sair-ms\) var\(--dt-sair\) both; \}/);
  assert.match(CASCA_LF, /prefers-reduced-motion: reduce\)\{\n\s*\[data-dt~="painel-do-leitor"\] \{ transition: none !important; \}\n\s*\[data-dt~="a-sair"\]\{ animation: none !important; opacity: 0 !important; \}/);
});

caso('o aviso de mensagem nova sobe e apaga-se; o cartão do outro aparelho desvanece', () => {
  const banner = emLf('src/components/NotificationBanner.web.tsx');
  assert.match(banner, /return <Saida aberto=\{!!item\}>\{\(\) => <Aviso key=\{item!\.conversationKey\} item=\{item!\} onOpen=\{onOpen\} \/>\}<\/Saida>;/);
  assert.match(banner, /marcar\('aviso-msg', aSair \? 'a-sair' : ''\)/);
  assert.match(CASCA_LF, /\[data-dt~="aviso-msg"\]\[data-dt~="a-sair"\]\{ animation: dt-aviso-msg-sai var\(--dt-sair-ms\) var\(--dt-sair\) both; \}/);
  assert.match(emLf('src/desktop/OutroAparelho.web.tsx'), /useLayoutEffect\(\(\) => \(\) => sairComFantasma\(cartao\.current\), \[\]\);/);
});
caso('o Pin to sidebar sai por cima de tudo, e não dentro da lateral', () => {
  assert.match(emLf('src/desktop/AtalhosNaLateral.web.tsx'), /const \{ montado \} = useSaida\(aberto, SAIDA_MS\);\n\s*if \(!montado \|\| typeof document === 'undefined'\) return <>\{children\}<\/>;/);
});
caso('as boas-vindas e o modo limpo entram e saem a apagar-se', () => {
  const bv = emLf('src/desktop/BoasVindasPc.web.tsx');
  assert.match(bv, /return <Saida aberto=\{aberto\}>\{\(\) => <Conteudo aoFechar=\{fechar\} \/>\}<\/Saida>;/);
  assert.match(bv, /<View style=\{s\.fundo\} \{\.\.\.marcar\('veu', aSair \? 'a-sair' : ''\)\}>\n\s*<View style=\{s\.cartao\} \{\.\.\.marcar\('dialogo', aSair \? 'a-sair' : ''\)\}>/);
  const ml = emLf('src/desktop/ModoLimpo.web.tsx');
  assert.match(ml, /return <Saida aberto=\{aberto\}>\{\(\) => <EcraLimpo \/>\}<\/Saida>;/);
  assert.match(ml, /\{\.\.\.marcar\('veu', aSair \? 'a-sair' : ''\)\} style=\{\[estilos\.fundo,/);
});
caso('as opções que aparecem no meio das Definições abrem e fecham o lugar', () => {
  const r = emLf('src/desktop/Revelar.web.tsx');
  assert.match(r, /if \(antes !== aberto\) \{\n\s*setAntes\(aberto\);\n\s*setAEntrar\(aberto\);/, 'só anima quando muda com a página aberta');
  assert.match(r, /if \(aSair\) return <div data-dt="revelar a-sair">\{dentro\}<\/div>;/);
  assert.match(CASCA_LF, /\[data-dt~="revelar"\]\{ display: grid; grid-template-rows: 1fr; \}/);
  assert.match(CASCA_LF, /@keyframes dt-revelar\{ from\{ grid-template-rows: 0fr; opacity: 0; \} to\{ grid-template-rows: 1fr; opacity: 1; \} \}/);
  const def = emLf('src/desktop/paginas/SettingsPage.web.tsx');
  assert.match(def, /<Revelar aberto=\{startup\.enabled\}>\{\(\) => <ChoiceLine label="Start in"/);
});
caso('os amigos da lateral entram, saem e trocam de lugar a deslizar', () => {
  const f = emLf('src/desktop/useFlip.web.ts');
  assert.match(f, /el\.animate\(\[\{ transform: `translateY\(\$\{era \+ desvio - topo\}px\)` \}, \{ transform: 'none' \}\]/, 'do sítio antigo (com o deslize que ia a meio) para o novo');
  // 22/11: medido sem a animação em curso e a partir do contentor (senão o desvio somava-se e as linhas fugiam).
  assert.match(f, /const topo = topoNoLayout\(el, raiz\);/);
  assert.match(f, /y \+= n\.offsetTop;/, 'pelo layout, sem transformações nem scroll');
  assert.match(f, /emCurso\.current\.get\(el\)\?\.cancel\(\);/);
  assert.match(f, /const animar = antes\.current !== null && !menosMovimentoAgora\(\);/, 'nada à primeira, nem com o menos movimento');
  const am = emLf('src/desktop/AmigosNaLateral.web.tsx');
  assert.equal((am.match(/<View ref=\{lista\}/g) ?? []).length, 2, 'na lateral larga e na estreita');
  assert.match(am, /\{\.\.\.\(\{ dataSet: \{ dt: 'amigo', chave: a\.friendId \} \} as any\)\}/);
  assert.match(am, /dataSet: \{ \.\.\.comDica\([\s\S]{0,120}\.dataSet, chave: a\.friendId \}/, 'a chave junta-se à legenda, sem a apagar');
});

console.log(falhas === 0 ? '\nTudo bem.\n' : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
