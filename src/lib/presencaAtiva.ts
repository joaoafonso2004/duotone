/**
 * Quando é que a pessoa conta como "Online now" para os amigos.
 *
 * Com a app à frente, conta sempre -- é a regra de sempre, e a do
 * `supabase/presenca-online-so-em-primeiro-plano.sql`.
 *
 * No iPhone, música a tocar com a app em segundo plano NÃO conta: é o
 * telemóvel no bolso, e foi exatamente isso que deixava amigos acesos na
 * lista durante horas.
 *
 * No PC é outra coisa. Com a janela do Duotone tapada por outra app, ou
 * minimizada, o `document.visibilityState` passa a `hidden` (o Chromium deteta
 * a janela tapada no Windows) e a pessoa desaparecia do online a meio de uma
 * música -- sentada ao computador, a trabalhar noutra coisa. Queixa do João a
 * 18/9. Aí conta como online quem tem música a TOCAR e mexeu no rato ou no
 * teclado há menos de `INATIVO_NO_COMPUTADOR_S`: é isso que separa quem está a
 * usar o PC de quem deixou a rádio a tocar e foi dormir. Sem saber a
 * inatividade (browser sem ponte do Electron), fica-se do lado seguro: não.
 *
 * Puro de propósito, para se testar em Node (`scripts/test-presenca-ativa.ts`).
 */

/** Dez minutos sem rato nem teclado: a mesma ordem de grandeza do "ausente"
 * das apps de conversa. Mais curto apagava quem só está a ouvir e a ler. */
export const INATIVO_NO_COMPUTADOR_S = 10 * 60;

export function contaComoAtivo(o: {
  /** A janela (ou a app, no iPhone) está à frente da pessoa. */
  visivel: boolean;
  /** Há música a tocar agora. */
  aTocar: boolean;
  /** Corre no PC (Electron). */
  computador: boolean;
  /** Segundos desde o último toque no rato/teclado; `null` se não se sabe. */
  inativoS: number | null;
}): boolean {
  if (o.visivel) return true;
  if (!o.computador || !o.aTocar) return false;
  return o.inativoS !== null && Number.isFinite(o.inativoS) && o.inativoS >= 0
    && o.inativoS < INATIVO_NO_COMPUTADOR_S;
}
