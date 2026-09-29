// Que SQL já correu (src/lib/migracoes.ts, 29/9): a lista cobre todos os
// ficheiros de supabase/, e cada marca está mesmo no ficheiro dela -- uma marca
// errada diria "falta" para sempre, ou pior, "está" sem estar.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { FORA_DA_LISTA, MIGRACOES, linhasDoEstado, migracoesEmFalta, textoDasMigracoes } from '../src/lib/migracoes.ts';

const pasta = new URL('../supabase/', import.meta.url);
const ficheiros = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort();
const listados = new Set(MIGRACOES.map((m) => m.ficheiro));

for (const f of ficheiros) {
  assert.ok(listados.has(f) || f in FORA_DA_LISTA,
    `supabase/${f} não está no src/lib/migracoes.ts: dá-lhe uma marca (ou põe-no em FORA_DA_LISTA com a razão)`);
}
for (const m of MIGRACOES) assert.ok(ficheiros.includes(m.ficheiro), `${m.ficheiro} não existe em supabase/`);
assert.equal(listados.size, MIGRACOES.length, 'cada ficheiro aparece uma vez');
assert.equal(new Set(MIGRACOES.map((m) => m.marca)).size, MIGRACOES.length, 'duas migrações com a mesma marca não se distinguem');
assert.ok(MIGRACOES.length <= 200, 'o marcas_em_falta aceita até 200');

// A marca está no ficheiro dela.
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const m of MIGRACOES) {
  const sql = readFileSync(new URL(m.ficheiro, pasta), 'utf8');
  const [tipo, ...resto] = m.marca.split(':');
  const valor = resto.join(':');
  const onde = `${m.ficheiro} (${m.marca})`;
  if (tipo === 'fn') {
    const nome = valor.split('(')[0]!;
    assert.match(sql, new RegExp(`function\\s+(public\\.)?${esc(nome)}\\s*\\(`, 'i'), `${onde}: a função não é criada aqui`);
  } else if (tipo === 'tab') {
    assert.match(sql, new RegExp(`create table\\s+(if not exists\\s+)?(public\\.)?${esc(valor)}\\b`, 'i'), `${onde}: a tabela não é criada aqui`);
  } else if (tipo === 'col') {
    const [tabela, coluna] = valor.split('.');
    assert.match(sql, new RegExp(`add column if not exists\\s+${esc(coluna!)}\\b`, 'i'), `${onde}: a coluna não é acrescentada aqui`);
    assert.ok(sql.includes(tabela!), `${onde}: a tabela não aparece`);
  } else if (tipo === 'pol') {
    const politica = valor.slice(valor.indexOf(':') + 1);
    assert.ok(sql.includes(`create policy "${politica}"`), `${onde}: a política não é criada aqui`);
  } else if (tipo === 'con') {
    const [nome, texto] = valor.split('~');
    assert.ok(sql.includes(nome!.split('.')[1]!) && sql.includes(texto!), `${onde}: a restrição ou o texto não estão aqui`);
  } else if (tipo === 'txt') {
    const [funcao, texto] = valor.split('~');
    assert.match(sql, new RegExp(`function\\s+(public\\.)?${esc(funcao!)}\\s*\\(`, 'i'), `${onde}: a função não é redefinida aqui`);
    assert.ok(sql.includes(texto!), `${onde}: o texto não está aqui`);
  } else if (tipo === 'pub') {
    assert.ok(sql.includes('supabase_realtime') && sql.includes(`'${valor}'`), `${onde}: a tabela não entra no Realtime aqui`);
  } else if (tipo === 'rev') {
    const [tabela, privilegio] = valor.split(':');
    assert.match(sql, new RegExp(`revoke[^;]*${esc(privilegio!.toLowerCase())}[^;]*on public\\.${esc(tabela!)}\\b`, 'i'), `${onde}: o privilégio não é retirado aqui`);
  } else {
    assert.fail(`${onde}: forma de marca desconhecida`);
  }
}

// O que o relatório diz.
assert.deepEqual(migracoesEmFalta(['fn:passar_ou_fechar_sessao', 'tab:nao_existe']).map((m) => m.ficheiro), ['jam-passa-o-anfitriao.sql']);
assert.match(linhasDoEstado({ tipo: 'ok', emFalta: [] })[0]!, /All \d+ SQL files are applied/);
const falta = linhasDoEstado({ tipo: 'ok', emFalta: migracoesEmFalta(['fn:passar_ou_fechar_sessao']) });
assert.match(falta[0]!, /1 of \d+ SQL files are missing/);
assert.match(falta[1]!, /supabase\/jam-passa-o-anfitriao\.sql \(Jam continues when the host leaves\)/);
assert.match(linhasDoEstado({ tipo: 'sem-verificador' })[0]!, /estado-das-migracoes\.sql/);
assert.match(textoDasMigracoes({ tipo: 'ok', emFalta: [] }), /^== server updates/);

// Ligado nos dois relatórios.
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
assert.match(ler('src/lib/relatorioDeReproducao.ts'), /textoDasMigracoes\(await verificarMigracoes\(\)\)/, 'iPhone');
assert.match(ler('src/desktop/paginas/SettingsPage.web.tsx'), /textoDasMigracoes\(migracoes\)/, 'PC');

console.log(`Migrações: ${MIGRACOES.length} ficheiros com marca, todas no sítio -- passou.`);
