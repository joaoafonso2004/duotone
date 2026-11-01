import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { duracaoDasLuas, LUAS, luaNoInstante, passagemAindaVale, TROCA_DO_CROSSFADE } from '../lib/duasLuas';
import { curvaDoPc } from '../lib/molasEmCss';
import { comCatalogo } from '../state/catalogoDeFaixas';
import { esquecerPassagem, marcarLuasNoEcra, usePassagemAVista, type PassagemAVista } from '../state/passagemAVista';
import { usePlayer } from '../state/player';
import { COR, RAIO } from './tokens.web';
import { useCapaGrande } from './useCapaGrande.web';

const menosMovimento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** A pose de uma lua no instante `t`, para os keyframes. */
const poseDaLua = (qual: 'sai' | 'entra', t: number) => {
  const l = luaNoInstante(qual, t);
  return { transform: `translateX(${l.x * 100}%) scale(${l.escala})` };
};

/**
 * As Duas luas no Now Playing do PC (C9, `lib/duasLuas.ts`). Só o crossfade: o PC não
 * tem AutoMix, por isso não há batida, graves nem legenda. O cubo da capa fica por
 * baixo, escondido, e o glitch dele continua. Tudo em Web Animations, no compositor.
 */
export function DuasLuas({ lado, capaDaQueSai, ligada, aoEsconderCubo }: {
  lado: number;
  capaDaQueSai: string | null;
  /** Falso com a letra à frente: não há capa para as luas. */
  ligada: boolean;
  aoEsconderCubo: (v: boolean) => void;
}) {
  const anunciada = usePassagemAVista();
  const [emCena, setEmCena] = useState<PassagemAVista | null>(null);
  // Só a passagem em cena acaba a cena: a animação de uma que foi substituída ainda chama.
  const cena = useRef(emCena);
  cena.current = emCena;
  const acabar = useCallback((id: number) => {
    if (cena.current?.id !== id) return;
    setEmCena(null);
    aoEsconderCubo(false);
  }, [aoEsconderCubo]);
  useEffect(() => {
    if (!ligada || document.hidden) { setEmCena(null); aoEsconderCubo(false); return; }
    if (anunciada && passagemAindaVale(anunciada, Date.now())) setEmCena(anunciada);
  }, [anunciada, ligada, aoEsconderCubo]);
  if (!emCena) return null;
  return <Luas key={emCena.id} p={emCena} desfeita={anunciada?.id !== emCena.id} lado={lado} capaDaQueSai={capaDaQueSai}
    aoEsconderCubo={aoEsconderCubo} aoAcabar={acabar} />;
}

function Luas({ p, desfeita, lado, capaDaQueSai, aoEsconderCubo, aoAcabar }: {
  p: PassagemAVista;
  desfeita: boolean;
  lado: number;
  capaDaQueSai: string | null;
  aoEsconderCubo: (v: boolean) => void;
  aoAcabar: (id: number) => void;
}) {
  const aTocar = usePlayer((s) => s.isPlaying);
  const atual = usePlayer((s) => s.current?.sourceId ?? null);
  const capaDaQueEntra = useCapaGrande(comCatalogo(p.para));
  // Presa ao começar: a capa à vista muda quando a fila avança, e a da que sai tem de ficar.
  const capaSai = useRef(capaDaQueSai).current;
  const duracao = duracaoDasLuas(p.duracaoMs);
  const camada = useRef<HTMLDivElement>(null);
  const sai = useRef<HTMLDivElement>(null);
  const entra = useRef<HTMLDivElement>(null);
  const sombraSai = useRef<HTMLDivElement>(null);
  const sombraEntra = useRef<HTMLDivElement>(null);
  const animacoes = useRef<Animation[]>([]);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passou = useRef(false);
  const aApagar = useRef(false);
  const [aEntregar, setAEntregar] = useState(false);

  const acabarAPassagem = () => {
    if (passou.current) return;
    passou.current = true;
    if (relogio.current) clearTimeout(relogio.current);
    if (!menosMovimento()) {
      const fim = luaNoInstante('sai', 1);
      const saida = sai.current?.animate?.([
        { transform: `translateX(${fim.x * 100}%) scale(${fim.escala})`, opacity: 1 },
        { transform: `translateX(${-LUAS.saida.deslocacao * 100}%) scale(${LUAS.saida.escala})`, opacity: 0 },
      ], { duration: LUAS.saida.ms, easing: curvaDoPc('sair'), fill: 'forwards' });
      if (saida) animacoes.current.push(saida);
    }
    setAEntregar(true);
  };
  // Com a janela escondida o Chromium não dá o `finish`: o relógio acaba à hora.
  const armar = (ms: number) => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(acabarAPassagem, Math.max(0, ms) + 100);
  };

  useLayoutEffect(() => {
    const a = sai.current, b = entra.current, sa = sombraSai.current, sb = sombraEntra.current;
    if (!a?.animate || !b || !sa || !sb) return;
    marcarLuasNoEcra(true);
    const decorrido = Math.max(0, Date.now() - p.comecaEm);
    const linear = { duration: duracao, easing: 'linear', fill: 'both' } as const;
    const lista = menosMovimento()
      // Com menos movimento as capas cruzam por opacidade, e não saem do sítio.
      ? [b.animate([{ opacity: 0 }, { opacity: 1 }], linear)]
      : [
        a.animate([poseDaLua('sai', 0), poseDaLua('sai', 1)], linear),
        b.animate([poseDaLua('entra', 0), poseDaLua('entra', 1)], linear),
        b.animate([{ opacity: 0 }, { opacity: 1, offset: LUAS.nascer }, { opacity: 1 }], linear),
        sa.animate([{ opacity: 0 }, { opacity: LUAS.sombra }], linear),
        sb.animate([{ opacity: LUAS.sombra }, { opacity: 0 }], linear),
        // A meio a que entra passa à frente: é um degrau, e anda com a passagem (também na pausa).
        a.animate([{ zIndex: 2 }, { zIndex: 2, offset: TROCA_DO_CROSSFADE }, { zIndex: 1, offset: TROCA_DO_CROSSFADE }, { zIndex: 1 }], linear),
        b.animate([{ zIndex: 1 }, { zIndex: 1, offset: TROCA_DO_CROSSFADE }, { zIndex: 2, offset: TROCA_DO_CROSSFADE }, { zIndex: 2 }], linear),
      ];
    lista.forEach((x) => { x.currentTime = decorrido; });
    lista[0].onfinish = acabarAPassagem;
    animacoes.current = lista;
    armar(duracao - decorrido);
    // A da frente cruza com a capa do cubo, e ele esconde-se. Aberta a meio, já está lá.
    let esconder: ReturnType<typeof setTimeout> | null = null;
    if (decorrido < LUAS.entregaMs) {
      a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: LUAS.cruzarMs, easing: 'linear', fill: 'backwards' });
      esconder = setTimeout(() => aoEsconderCubo(true), LUAS.cruzarMs);
    } else aoEsconderCubo(true);
    return () => {
      if (esconder) clearTimeout(esconder);
      if (relogio.current) clearTimeout(relogio.current);
      animacoes.current.forEach((x) => x.cancel());
      marcarLuasNoEcra(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Uma pausa suspende a passagem no motor do PC, e as luas ficam à espera com ela.
  useEffect(() => {
    const lista = animacoes.current;
    if (!lista.length || passou.current) return;
    if (aTocar) {
      lista.forEach((x) => x.play());
      armar(duracao - Number(lista[0].currentTime ?? 0));
    } else {
      lista.forEach((x) => x.pause());
      if (relogio.current) clearTimeout(relogio.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aTocar]);

  const apagar = () => {
    if (aApagar.current) return;
    aApagar.current = true;
    aoEsconderCubo(false);
    let feito = false;
    const sair = () => {
      if (feito) return;
      feito = true;
      esquecerPassagem(p.id);
      aoAcabar(p.id);
    };
    const a = camada.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: LUAS.apagarMs, easing: 'linear', fill: 'forwards' });
    if (a) a.onfinish = sair;
    setTimeout(sair, LUAS.apagarMs + 100);
  };

  // A música mudou antes de a passagem acabar (um "seguinte" a meio): as luas não ficam a fingir.
  const filaAvancou = atual !== p.de;
  useEffect(() => {
    if (!filaAvancou || passou.current) return;
    if (Date.now() < p.comecaEm + p.duracaoMs - 500) {
      animacoes.current.forEach((x) => x.finish());
      acabarAPassagem();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filaAvancou]);

  // A nova devolve o lugar ao cubo quando a capa dele já trocou por baixo.
  useEffect(() => {
    if (!aEntregar) return;
    const id = setTimeout(apagar, filaAvancou ? LUAS.entregaMs : LUAS.esperaPelaFilaMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aEntregar, filaAvancou]);

  // Desfeita: a capa de sempre volta a ver-se por baixo.
  useEffect(() => { if (desfeita) apagar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [desfeita]);

  const lua: React.CSSProperties = {
    position: 'absolute', inset: 0, borderRadius: RAIO.superficie, overflow: 'hidden',
    backgroundColor: COR.fundo, boxShadow: '0 30px 60px rgba(0,0,0,.55)',
  };
  const imagem: React.CSSProperties = { position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
  const sombra: React.CSSProperties = { position: 'absolute', inset: 0, backgroundColor: COR.fundo };
  return (
    <div ref={camada} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: lado, height: lado, zIndex: 4, pointerEvents: 'none' }}>
      <div ref={sai} style={{ ...lua, zIndex: 2 }}>
        {capaSai ? <img src={capaSai} alt="" referrerPolicy="no-referrer" draggable={false} style={imagem} /> : null}
        <div ref={sombraSai} style={{ ...sombra, opacity: 0 }} />
      </div>
      <div ref={entra} style={{ ...lua, zIndex: 1, opacity: 0 }}>
        {capaDaQueEntra ? <img src={capaDaQueEntra} alt="" referrerPolicy="no-referrer" draggable={false} style={imagem} /> : null}
        <div ref={sombraEntra} style={{ ...sombra, opacity: 0 }} />
      </div>
    </div>
  );
}
