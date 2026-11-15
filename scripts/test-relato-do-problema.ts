/**
 * "Report a problem" (15/11): os limites (lib/relatoDoProblema.ts) e a ligação
 * nas Definições das duas plataformas.
 *
 * Correr: node --experimental-strip-types scripts/test-relato-do-problema.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAXIMO_DO_RELATORIO, podeEnviarRelato, relatorioParaEnviar,
} from '../src/lib/relatoDoProblema.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Sem descrição não se manda: um relato vazio não ajuda ninguém.
assert.equal(podeEnviarRelato(''), false);
assert.equal(podeEnviarRelato('  a  '), false);
assert.equal(podeEnviarRelato('the song stops at 0:29'), true);

// O relatório vai inteiro até ao limite; acima, o princípio e uma marca.
assert.equal(relatorioParaEnviar(null), null);
assert.equal(relatorioParaEnviar(''), null);
assert.equal(relatorioParaEnviar('curto'), 'curto');
const longo = relatorioParaEnviar('r'.repeat(MAXIMO_DO_RELATORIO + 5000))!;
assert.equal(longo.length, MAXIMO_DO_RELATORIO);
assert.ok(longo.startsWith('rrrr') && longo.endsWith('the report was longer]'));

// Os limites são os do servidor.
const sql = ler('supabase/relatar-problema.sql');
assert.match(sql, /left\(p_relatorio, 60000\)/);
assert.match(sql, /left\(comentario, 2000\)/);

// A folha manda pela função, com o relatório só se a pessoa quiser.
const folha = ler('src/components/RelatarProblema.tsx');
assert.match(folha, /relatarProblema\(\{/);
assert.match(folha, /comRelatorio \? relatorioParaEnviar\(await textoDoRelatorioDeReproducao\(\)/);

// As duas Definições têm a linha, com o mesmo nome, e abrem a mesma folha.
for (const f of ['src/screens/SettingsScreen.tsx', 'src/desktop/paginas/SettingsPage.web.tsx']) {
  const t = ler(f);
  assert.match(t, /ROTULOS\.relatarProblema/, f);
  assert.match(t, /<RelatarProblema visible=\{relatoAberto\}/, f);
}

// O texto do relatório é o mesmo que se guarda/partilha, nas duas plataformas.
assert.match(ler('src/lib/relatorioDeReproducao.ts'), /export async function textoDoRelatorioDeReproducao/);
assert.match(ler('src/lib/relatorioDeReproducao.web.ts'), /export async function textoDoRelatorioDeReproducao/);
assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /await partilharRelatorioDeReproducao\(\)/);

console.log('test-relato-do-problema: tudo certo');
