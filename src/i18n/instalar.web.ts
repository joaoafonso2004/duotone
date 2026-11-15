/**
 * PC: traduz a interface no DOM (15/11). Cada nó de texto e cada atributo que
 * se lê (placeholder, title, aria-label, alt) passa pelo dicionário quando o
 * React o escreve. O React nunca relê o texto que escreveu: quando um valor
 * muda, ele reescreve o nó, o observador vê-o e traduz outra vez.
 *
 * Fica de fora o que se escreve (inputs, áreas de texto, contenteditable) e o
 * que estiver dentro de `[data-sem-traducao]`. Títulos e artistas nunca se
 * traduzem (`conteudo.ts`). Em inglês não se instala nada.
 */
import { traduzir } from './index';
import { idiomaAtual } from './idioma';

const ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt'];
const DE_FORA = 'script, style, textarea, input, [contenteditable="true"], [data-sem-traducao]';
/** O que escrevemos nós, para a mudança que isso faz não ser traduzida outra vez. */
const escritos = new WeakMap<Node, string>();

function deFora(el: Element | null): boolean {
  return !el || !!el.closest(DE_FORA);
}

function texto(n: Text): void {
  const v = n.nodeValue;
  if (!v || escritos.get(n) === v || !/[A-Za-z]/.test(v) || deFora(n.parentElement)) return;
  const t = traduzir(v);
  if (t !== v) {
    escritos.set(n, t);
    n.nodeValue = t;
  }
}

function atributo(el: Element, nome: string): void {
  const v = el.getAttribute(nome);
  if (!v || !/[A-Za-z]/.test(v) || (nome !== 'placeholder' && el.closest('[data-sem-traducao]'))) return;
  const t = traduzir(v);
  if (t !== v) el.setAttribute(nome, t);
}

function arvore(raiz: Node): void {
  if (raiz.nodeType === Node.TEXT_NODE) { texto(raiz as Text); return; }
  if (raiz.nodeType !== Node.ELEMENT_NODE) return;
  const el = raiz as Element;
  for (const a of ATRIBUTOS) if (el.hasAttribute(a)) atributo(el, a);
  const andar = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) texto(n as Text);
    else for (const a of ATRIBUTOS) if ((n as Element).hasAttribute(a)) atributo(n as Element, a);
  }
}

let instalado = false;

export function instalarTraducao(): void {
  if (instalado || typeof document === 'undefined' || idiomaAtual() !== 'fr') return;
  instalado = true;
  document.documentElement.lang = 'fr';
  const comecar = () => {
    arvore(document.body);
    new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        if (m.type === 'characterData') texto(m.target as Text);
        else if (m.type === 'attributes' && m.attributeName) atributo(m.target as Element, m.attributeName);
        else m.addedNodes.forEach(arvore);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  };
  if (document.body) comecar();
  else document.addEventListener('DOMContentLoaded', comecar, { once: true });
}
