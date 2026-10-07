import React from 'react';

/**
 * Par web do `DissolverEmBaixo.tsx`: a máscara é a `mask-image` do CSS, num
 * `<div>` a sério (o MaskedView no browser só desenha os filhos).
 */
export function DissolverEmBaixo({ desde, children }: { desde: number; children: React.ReactNode }) {
  const mascara = `linear-gradient(180deg, #000 ${Math.round(desde * 100)}%, transparent 100%)`;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', WebkitMaskImage: mascara, maskImage: mascara }}>
      {children}
    </div>
  );
}
