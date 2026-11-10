/**
 * O que se diz do perfil de quem não é amigo (10/11, supabase/perfil-limitado.sql):
 * desde quando usa a app, quanto ouviu, e quando ouviu pela última vez. Só
 * números; o que ouve continua só para amigos.
 *
 * Puro, sem imports: `scripts/test-perfil-limitado.ts`.
 */
export type NumerosDoPerfil = { memberSince: string; totalPlays: number; uniqueTracks: number; lastPlayedOn: string | null };

const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DIA_MS = 24 * 60 * 60 * 1000;

/** "2026-11-10" (um dia do servidor, em UTC) para a meia-noite UTC desse dia. */
function dia(texto: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto ?? '');
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const milhares = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, um: string, varios: string) => `${milhares(n)} ${n === 1 ? um : varios}`;

/** "Joined Nov 2026". */
export function desdeQuando(n: NumerosDoPerfil): string | null {
  const d = dia(n.memberSince);
  if (d == null) return null;
  const data = new Date(d);
  return `Joined ${MESES[data.getUTCMonth()]} ${data.getUTCFullYear()}`;
}

/** "1,240 plays · 310 songs", ou que ainda não ouviu nada. */
export function quantoOuviu(n: NumerosDoPerfil): string {
  if (!n.totalPlays) return 'No songs played yet';
  return `${plural(n.totalPlays, 'play', 'plays')} · ${plural(n.uniqueTracks, 'song', 'songs')}`;
}

/** "Listened today", "yesterday", "3 days ago", "on 2 Oct", ou nada. */
export function ultimaEscuta(n: NumerosDoPerfil, agora: number): string | null {
  const d = n.lastPlayedOn ? dia(n.lastPlayedOn) : null;
  if (d == null || !n.totalPlays) return null;
  const hoje = Date.UTC(new Date(agora).getUTCFullYear(), new Date(agora).getUTCMonth(), new Date(agora).getUTCDate());
  const dias = Math.round((hoje - d) / DIA_MS);
  if (dias <= 0) return 'Listened today';
  if (dias === 1) return 'Listened yesterday';
  if (dias < 7) return `Listened ${dias} days ago`;
  const data = new Date(d);
  return `Last listened on ${data.getUTCDate()} ${MESES[data.getUTCMonth()]}`;
}
