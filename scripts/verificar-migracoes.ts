// Que ficheiros de supabase/ faltam na base de dados (29/9, src/lib/migracoes.ts).
//
// Correr no PC, na pasta do projeto:
//   node --experimental-strip-types scripts/verificar-migracoes.ts
//
// Usa o URL e a chave PÚBLICA do .env (a mesma que vai dentro da app). Só
// pergunta que objetos existem no esquema -- não lê dados de ninguém. Precisa
// que o supabase/estado-das-migracoes.sql tenha corrido uma vez.
import { readFileSync } from 'node:fs';
import { MIGRACOES, linhasDoEstado, migracoesEmFalta, type EstadoDasMigracoes } from '../src/lib/migracoes.ts';

function lerEnv(): Record<string, string> {
  try {
    const texto = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const env: Record<string, string> = {};
    for (const linha of texto.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
      if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

const env = { ...lerEnv(), ...process.env };
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const chave = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !chave) {
  console.error('Falta EXPO_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_ANON_KEY no .env.');
  process.exit(1);
}

let estado: EstadoDasMigracoes;
try {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/marcas_em_falta`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marcas: MIGRACOES.map((m) => m.marca) }),
  });
  const corpo = await res.json().catch(() => null);
  if (res.ok) estado = { tipo: 'ok', emFalta: migracoesEmFalta(Array.isArray(corpo) ? corpo : []) };
  else if (corpo?.code === 'PGRST202') estado = { tipo: 'sem-verificador' };
  else estado = { tipo: 'erro', mensagem: `HTTP ${res.status} ${corpo?.message ?? ''}`.trim() };
} catch (e: any) {
  estado = { tipo: 'erro', mensagem: e?.message ?? 'sem rede' };
}

for (const linha of linhasDoEstado(estado)) console.log(linha);
process.exitCode = estado.tipo === 'ok' && !estado.emFalta.length ? 0 : 1;
