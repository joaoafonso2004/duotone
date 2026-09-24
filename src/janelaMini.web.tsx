import React, { useEffect, useState, type ComponentType } from 'react';

/**
 * A janela do mini leitor do PC (entrega 2b do
 * docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md; aprovado pela pré-visualização
 * de 24/9).
 *
 * É um comando à distância: a música toca na janela principal. Esta janela não
 * tem sessão, store nem Supabase -- o index.ts arranca-a EM VEZ da App quando o
 * endereço traz `?janela=mini`, e ela só conhece o resumo que recebe e os
 * comandos que manda (electron/preloadMini.cjs → electron/miniLeitor.cjs).
 *
 * Arrasta-se pela CAPA e só por ela: no Windows uma zona de arrasto não recebe
 * eventos do rato, e com a janela toda a arrastar o hover deixava de existir.
 *
 * É DOM à mão e não React Native: precisa do `-webkit-app-region` para se
 * arrastar pela capa, e o `hovered` do RNW cai ao entrar num botão filho (ver
 * o CLAUDE.md) -- aqui o hover é CSS.
 */

const CSS = `
html, body, #root { margin: 0; height: 100%; background: transparent; overflow: hidden; }
* { box-sizing: border-box; }
.mini { height: 100%; border-radius: 14px; background: #14141C; border: 1px solid rgba(255,255,255,0.08);
  color: #F5F5F7; font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; position: relative;
  overflow: hidden; user-select: none; }
.mini:hover { background: #1b1b25; border-color: rgba(255,255,255,0.14); }
button { -webkit-app-region: no-drag; background: none; border: none; color: inherit; padding: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center; border-radius: 16px; }
button:hover { background: rgba(255,255,255,0.08); }
button:focus-visible { outline: 2px solid #8B5CF6; outline-offset: 1px; }
.play { background: #F5F5F7; color: #0A0A0F; }
.play:hover { background: #ffffff; }
.capa { border-radius: 8px; background: #2a2a36 center / cover no-repeat; flex-shrink: 0; -webkit-app-region: drag; cursor: grab; }
.titulo { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.artista { font-size: 12.5px; color: rgba(245,245,247,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.so-hover { display: none; }
.mini:hover .so-hover { display: flex; }
.mini:hover .sem-hover { display: none; }
.linha { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: rgba(255,255,255,0.1); }
.linha > div { height: 2px; background: #8B5CF6; }
.barra { -webkit-app-region: no-drag; height: 12px; display: flex; align-items: center; cursor: pointer; }
.barra > div { position: relative; height: 4px; width: 100%; border-radius: 2px; background: rgba(255,255,255,0.14); }
.barra > div > div { height: 4px; border-radius: 2px; background: #F5F5F7; }
.tempo { font-size: 11px; color: rgba(245,245,247,0.55); font-variant-numeric: tabular-nums; }
`;

type Resumo = ResumoDoMiniLeitor;

const icone = {
  anterior: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>,
  seguinte: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z" /></svg>,
  tocar: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>,
  pausa: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>,
  coracao: (cheio: boolean) => <svg width="16" height="16" viewBox="0 0 24 24" fill={cheio ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>,
  expandir: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>,
  encolher: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>,
  abrir: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>,
  fechar: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

function tempo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function MiniLeitor() {
  const ponte = window.duotoneMini;
  const [r, setR] = useState<Resumo | null>(null);
  const [expandido, setExpandido] = useState(false);
  // A posição anda sozinha entre resumos (chegam a 2 Hz), para a barra não saltar.
  const [agora, setAgora] = useState(() => Date.now());
  const [recebidoEm, setRecebidoEm] = useState(() => Date.now());

  useEffect(() => {
    if (!ponte) return;
    const sair = ponte.onEstado((novo) => { setR(novo); setRecebidoEm(Date.now()); });
    const sairTamanho = ponte.onTamanho(setExpandido);
    return () => { sair(); sairTamanho(); };
  }, [ponte]);
  useEffect(() => {
    if (!r?.aTocar) return;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [r?.aTocar]);

  const mandar = (tipo: string, ms?: number) => ponte?.comando(ms === undefined ? { tipo } : { tipo, ms });
  const duracao = r?.duracaoMs ?? 0;
  const posicao = r ? Math.min(duracao || Infinity, r.posicaoMs + (r.aTocar ? Math.max(0, agora - recebidoEm) : 0)) : 0;
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;
  const capa = r?.capa ? { backgroundImage: `url("${r.capa}")` } : undefined;
  const procurar = (e: React.MouseEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    if (duracao > 0 && caixa.width > 0) mandar('procurar', ((e.clientX - caixa.left) / caixa.width) * duracao);
  };
  const tocarOuPausa = (
    <button className="play" aria-label={r?.aTocar ? 'Pause' : 'Play'} onClick={() => mandar('tocar-pausa')}
      style={{ width: expandido ? 44 : 38, height: expandido ? 44 : 38, borderRadius: expandido ? 22 : 19 }}>
      {r?.aTocar ? icone.pausa : icone.tocar}
    </button>
  );
  const coracao = (
    <button aria-label={r?.guardada ? 'Remove from library' : 'Save to library'} aria-pressed={!!r?.guardada}
      onClick={() => mandar('guardar')} style={{ width: 30, height: 30 }}>{icone.coracao(!!r?.guardada)}</button>
  );

  if (expandido) {
    return (
      <div className="mini" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div className="capa" style={{ width: 240, height: 240, ...capa, boxShadow: '0 0 60px rgba(111,122,140,0.35)' }} />
        <div style={{ width: '100%', textAlign: 'center', minWidth: 0 }}>
          <div className="titulo" style={{ fontSize: 16 }}>{r?.titulo ?? 'Nothing playing'}</div>
          <div className="artista" style={{ fontSize: 13 }}>{r?.artista ?? ''}</div>
        </div>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tempo">{tempo(posicao)}</span>
          <div className="barra" style={{ flex: 1 }} onClick={procurar} role="slider" aria-label="Seek"
            aria-valuemin={0} aria-valuemax={Math.round(duracao / 1000)} aria-valuenow={Math.round(posicao / 1000)}>
            <div><div style={{ width: `${fracao * 100}%` }} /></div>
          </div>
          <span className="tempo">{tempo(duracao)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {coracao}
          <button aria-label="Previous" onClick={() => mandar('anterior')} style={{ width: 32, height: 32 }}>{icone.anterior}</button>
          {tocarOuPausa}
          <button aria-label="Next" onClick={() => mandar('seguinte')} style={{ width: 32, height: 32 }}>{icone.seguinte}</button>
          <button aria-label="Shrink" onClick={() => mandar('encolher')} style={{ width: 32, height: 32 }}>{icone.encolher}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mini" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
      <div className="capa" style={{ width: 64, height: 64, ...capa }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="titulo">{r?.titulo ?? 'Nothing playing'}</div>
        <div className="artista sem-hover">{r?.artista ?? ''}</div>
        <div className="so-hover" style={{ flexDirection: 'column', gap: 4 }}>
          <span className="tempo">{tempo(posicao)} / {tempo(duracao)}</span>
          <div className="barra" style={{ height: 8 }} onClick={procurar} role="slider" aria-label="Seek"
            aria-valuemin={0} aria-valuemax={Math.round(duracao / 1000)} aria-valuenow={Math.round(posicao / 1000)}>
            <div><div style={{ width: `${fracao * 100}%` }} /></div>
          </div>
        </div>
      </div>
      <div className="sem-hover" style={{ alignItems: 'center', gap: 2, display: 'flex' }}>
        <button aria-label="Previous" onClick={() => mandar('anterior')} style={{ width: 32, height: 32 }}>{icone.anterior}</button>
        {tocarOuPausa}
        <button aria-label="Next" onClick={() => mandar('seguinte')} style={{ width: 32, height: 32 }}>{icone.seguinte}</button>
      </div>
      <div className="so-hover" style={{ alignItems: 'center', gap: 0 }}>
        {coracao}
        {tocarOuPausa}
        <button aria-label="Expand" onClick={() => mandar('expandir')} style={{ width: 30, height: 30 }}>{icone.expandir}</button>
        <button aria-label="Open Duotone" onClick={() => mandar('abrir-duotone')} style={{ width: 30, height: 30 }}>{icone.abrir}</button>
        <button aria-label="Close mini player" onClick={() => mandar('fechar')} style={{ width: 30, height: 30 }}>{icone.fechar}</button>
      </div>
      <div className="linha sem-hover"><div style={{ width: `${fracao * 100}%` }} /></div>
    </div>
  );
}

function RaizDoMini() {
  return (
    <>
      <style>{CSS}</style>
      <MiniLeitor />
    </>
  );
}

/** A raiz, se esta janela for o mini leitor (`?janela=mini` e a ponte dele); senão `null`. */
export function raizDaJanelaMini(): ComponentType | null {
  if (typeof window === 'undefined' || !window.duotoneMini) return null;
  try {
    if (new URLSearchParams(window.location.search).get('janela') !== 'mini') return null;
  } catch {
    return null;
  }
  return RaizDoMini;
}
