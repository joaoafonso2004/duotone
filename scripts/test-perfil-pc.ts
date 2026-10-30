/**
 * O perfil do PC com a capa por página (30/10, passo 5 de `docs/PLANO-ELEVAR-PC.md`):
 * a fotografia cobre a janela e fica presa enquanto a página sobe por cima; escurece
 * ao rolar; o botão do canto, ou a tecla F, abre a capa INTEIRA. A conta é pura
 * (`lib/capaDoPerfilPc.ts`); o resto lê o código como TEXTO, como os outros testes
 * do PC.
 *
 * Correr: node --experimental-strip-types scripts/test-perfil-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESCURECER_MAXIMO, estadoDaCapa, eTeclaDaCapa, progressoDaRolagem, tamanhoDoNome,
} from '../src/lib/capaDoPerfilPc.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const HERO = ler('src/components/ProfileHeroPc.web.tsx');
const PAGINA = ler('src/components/SocialProfileView.tsx');
const NATIVO = ler('src/components/ProfileHeroPc.tsx');

console.log('\no afastamento ao rolar');
caso('o progresso vai de 0 (no topo) a 1 (uma janela rolada), e prende-se nas pontas', () => {
  assert.equal(progressoDaRolagem(0, 800), 0);
  assert.equal(progressoDaRolagem(400, 800), 0.5);
  assert.equal(progressoDaRolagem(5000, 800), 1);
  assert.equal(progressoDaRolagem(-30, 800), 0, 'um scroll elástico para cima não passa de 0');
});
caso('sem altura, ou com números que não o são, não há progresso', () => {
  assert.equal(progressoDaRolagem(300, 0), 0);
  assert.equal(progressoDaRolagem(NaN, 800), 0);
  assert.equal(progressoDaRolagem(300, NaN), 0);
});
caso('no topo a capa está inteira; ao fundo escurece a 78 % e afasta-se um pouco', () => {
  assert.deepEqual(estadoDaCapa(0), { escala: 1, subida: -0, veu: 0, pista: 1 });
  const fim = estadoDaCapa(1);
  assert.equal(fim.veu, ESCURECER_MAXIMO);
  assert.ok(fim.escala > 1 && fim.escala < 1.2, `escala ${fim.escala}`);
  assert.ok(fim.subida < 0 && fim.subida > -40);
  assert.equal(fim.pista, 0);
});
caso('a pista "SCROLL" apaga-se depressa: a um sexto do caminho já não está', () => {
  assert.equal(estadoDaCapa(1 / 6).pista, 0);
  assert.ok(estadoDaCapa(0.05).pista > 0.5);
});
caso('o véu e a escala só crescem com o scroll, nunca andam para trás', () => {
  let antes = estadoDaCapa(0);
  for (let i = 1; i <= 20; i++) {
    const e = estadoDaCapa(i / 20);
    assert.ok(e.veu >= antes.veu && e.escala >= antes.escala && e.pista <= antes.pista);
    antes = e;
  }
});
caso('um progresso que não é número vale zero', () => {
  assert.equal(estadoDaCapa(NaN).veu, 0);
  assert.equal(estadoDaCapa(-4).escala, 1);
  assert.equal(estadoDaCapa(9).veu, ESCURECER_MAXIMO);
});

console.log('\no nome');
caso('um nome curto leva o corpo todo (96), e um comprido encolhe para não passar da janela', () => {
  assert.equal(tamanhoDoNome('Joao', 1000), 96);
  const longo = tamanhoDoNome('Maria Francisca de Albuquerque Pereira', 1000);
  assert.ok(longo < 60 && longo >= 40, `${longo}`);
  assert.equal(tamanhoDoNome('X'.repeat(200), 600), 40, 'nunca abaixo de 40');
});
caso('sem largura medida ainda, um corpo que cabe', () => {
  assert.equal(tamanhoDoNome('Joao', 0), 64);
});

console.log('\na tecla F');
caso('F abre e fecha a capa, com ou sem maiúscula, fora de um campo', () => {
  assert.equal(eTeclaDaCapa({ key: 'f', target: { tagName: 'DIV' } }), true);
  assert.equal(eTeclaDaCapa({ key: 'F', shiftKey: true, target: { tagName: 'BODY' } }), true);
});
caso('Ctrl+F (a pesquisa), Alt, Meta, e outra tecla não a abrem', () => {
  assert.equal(eTeclaDaCapa({ key: 'f', ctrlKey: true }), false);
  assert.equal(eTeclaDaCapa({ key: 'f', altKey: true }), false);
  assert.equal(eTeclaDaCapa({ key: 'f', metaKey: true }), false);
  assert.equal(eTeclaDaCapa({ key: 'g' }), false);
});
caso('escrever um "f" num campo (ou em texto editável) não abre a capa', () => {
  for (const tagName of ['INPUT', 'input', 'TEXTAREA', 'SELECT']) assert.equal(eTeclaDaCapa({ key: 'f', target: { tagName } }), false, tagName);
  assert.equal(eTeclaDaCapa({ key: 'f', target: { tagName: 'DIV', isContentEditable: true } }), false);
});

console.log('\na ligação à página');
caso('só no PC, e só com uma capa guardada: sem ela fica o cabeçalho de sempre', () => {
  assert.match(PAGINA, /const capaPorPagina=web&&!!profile\?\.appearance\?\.cover_path;/);
  assert.match(PAGINA, /\{capaPorPagina\?<ProfileHeroPc /);
  assert.match(PAGINA, /:<View \{\.\.\.\(menuNoTopo as any\)\}>\n\s+<ProfileHero profile=\{profile\}/, 'o ProfileHero (iPhone) fica como estava');
});
caso('a altura da janela do perfil mede-se junto da largura', () => {
  assert.match(PAGINA, /onLayout=\{e=>\{setWidth\(e\.nativeEvent\.layout\.width\);setAltura\(e\.nativeEvent\.layout\.height\);\}\}/);
  assert.match(PAGINA, /altura=\{altura\} largura=\{width\}/);
});
caso('o conteúdo sobe por cima da capa presa, com um degradê que a esconde aos poucos', () => {
  assert.match(PAGINA, /capaPorPagina&&\{position:'relative',zIndex:3,backgroundColor:colors\.bg\}/);
  assert.match(PAGINA, /<LinearGradient pointerEvents="none" colors=\{\['rgba\(12,12,16,0\)',colors\.bg\]\}/);
});
caso('o botão direito num amigo continua a abrir o menu dele, agora no palco da identidade', () => {
  assert.match(PAGINA, /menu=\{menuNoTopo\}/);
  assert.match(HERO, /<View \{\.\.\.\(menu \?\? \{\}\)\} style=\{\{ height: H, zIndex: 2,/);
});
caso('no iPhone o componente novo não desenha nada', () => {
  assert.match(NATIVO, /export function ProfileHeroPc\(_: PropsDoHeroPc\) \{\n  return null;/);
});

console.log('\no cabeçalho do PC');
caso('a capa é presa ao topo do scroll e a identidade sobe por cima dela (duas peças irmãs)', () => {
  assert.match(HERO, /position: 'sticky', top: 0, height: H, marginBottom: -H, overflow: 'hidden', zIndex: 0/);
  assert.match(HERO, /height: H, zIndex: 2, justifyContent: 'flex-end'/);
});
caso('a fotografia usa o mesmo enquadramento do cabeçalho de sempre (`enquadrarCapa`), agora com a altura da janela', () => {
  assert.match(HERO, /const e = enquadrarCapa\(largura, H\);/);
  assert.match(HERO, /cacheKey: profileImageCacheKey\(cover\)/);
});
caso('rola-se por um ouvinte passivo, uma escrita por fotograma, escrita direta no DOM', () => {
  assert.match(HERO, /raiz\.addEventListener\('scroll', agendar, \{ passive: true \}\)/);
  assert.match(HERO, /if \(!quadro\) quadro = requestAnimationFrame\(pintar\)/);
  assert.match(HERO, /imagemRef\.current\.style\.transform = `translateY\(\$\{e\.subida\}px\) scale\(\$\{e\.escala\}\)`/);
  assert.match(HERO, /cancelAnimationFrame\(quadro\); raiz\.removeEventListener\('scroll', agendar\)/);
});
caso('com "menos movimento" a fotografia não se mexe, mas o véu escuro continua', () => {
  assert.match(HERO, /const calmo = !!window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches;/);
  assert.match(HERO, /if \(imagemRef\.current && !calmo\) imagemRef\.current\.style\.transform/);
  assert.match(HERO, /if \(veuRef\.current\) veuRef\.current\.style\.opacity = String\(e\.veu\)/);
});
caso('o botão do canto e o F abrem a capa inteira; só com a página à vista e fora de um campo', () => {
  assert.match(HERO, /label="View full cover \(F\)" icon="expand-outline" onPress=\{\(\) => setAberta\(true\)\}/);
  assert.match(HERO, /window\.addEventListener\('keydown', tecla, true\)/);
  assert.match(HERO, /getComputedStyle\(no\)\.visibility === 'hidden'\) return;/);
  assert.match(HERO, /if \(!eTeclaDaCapa\(e as unknown as Parameters<typeof eTeclaDaCapa>\[0\]\)\) return;/);
});
caso('a capa inteira é um diálogo num portal fixo (a armadilha do Save), com Esc, clique e foco', () => {
  assert.match(HERO, /createPortal\(\n\s+<div ref=\{caixaRef\} role="dialog" aria-modal="true"/);
  assert.match(HERO, /position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 320/);
  assert.match(HERO, /objectFit: 'contain'/, 'a fotografia inteira, sem cortes');
  assert.match(HERO, /if \(aberta && e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); setAberta\(false\); return; \}/);
  assert.match(HERO, /onClick=\{\(\) => setAberta\(false\)\}/);
  assert.match(HERO, /antesDoFoco\.current = document\.activeElement as HTMLElement \| null;/);
});
caso('as ações da identidade são as de sempre (editar, mensagem, "You two", adicionar)', () => {
  for (const r of ['Edit profile', 'Message', 'You two', 'Request pending', 'Add friend']) assert.ok(HERO.includes(`'${r}'`) || HERO.includes(`"${r}"`), r);
});
caso('nada de className nem de backdrop-filter', () => {
  const sem = HERO.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/className\s*[=:]/.test(sem));
  assert.ok(!/backdrop-?[fF]ilter/.test(HERO));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
