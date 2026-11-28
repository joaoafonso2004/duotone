/**
 * Partilhar presets da Customise pelo chat (28/11): o que vai na `shared_items`
 * (lib/presetPartilhado.ts), guardar e usar o que chega, e a ligação (lida como
 * texto). O servidor está em test-partilhar-presets-sql.mjs.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-partilhar-presets.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerAparencia, PADRAO } from '../src/lib/aparencia.ts';
import { legendaDoPreset, LIMITE_DO_PRESET, nomeLivre, presetParaPartilhar, presetPartilhado } from '../src/lib/presetPartilhado.ts';
import { previaDaConversa } from '../src/lib/previaDaConversa.ts';
import { excertoDaMensagem } from '../src/lib/respostas.ts';
import { resumoDaMensagem } from '../src/lib/inAppNotifications.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const aspeto = { ...PADRAO, fundoApp: 'oled' as const, titulos: 'serif' as const, vidro: true };

caso('o preset vai com o nome em title (o que a lista das conversas lê) e volta igual', () => {
  const dados = presetParaPartilhar({ nome: '  Night   drive ', aparencia: aspeto, capa: 'full' });
  assert.ok(dados);
  assert.equal(dados!.title, 'Night drive');
  assert.equal(dados!.kind, 'preset');
  assert.ok(JSON.stringify(dados).length < LIMITE_DO_PRESET, 'cabe no limite do servidor');
  const volta = presetPartilhado(JSON.parse(JSON.stringify(dados)));
  assert.deepEqual(volta, { nome: 'Night drive', aparencia: lerAparencia(aspeto), capa: 'full' });
});

caso('sem nome não se manda; uma capa que não existe passa à de origem', () => {
  assert.equal(presetParaPartilhar({ nome: '   ', aparencia: aspeto, capa: 'full' }), null);
  assert.equal(presetPartilhado(presetParaPartilhar({ nome: 'X', aparencia: aspeto, capa: 'vinil' }))?.capa, 'floating');
});

caso('o que chega da rede é validado: lixo não entra, opções desconhecidas passam às de origem', () => {
  assert.equal(presetPartilhado(null), null);
  assert.equal(presetPartilhado({ title: 'X', kind: 'album', aparencia: {} }), null, 'um álbum não é um preset');
  assert.equal(presetPartilhado({ title: 'X', kind: 'preset' }), null, 'sem aspeto');
  assert.equal(presetPartilhado({ title: '', kind: 'preset', aparencia: {} }), null, 'sem nome');
  const estranho = presetPartilhado({ title: 'X', kind: 'preset', capa: 'full', aparencia: { fundoApp: 'roxo', titulos: 'serif', lixo: 1 } });
  assert.equal(estranho?.aparencia.fundoApp, PADRAO.fundoApp);
  assert.equal(estranho?.aparencia.titulos, 'serif');
  assert.ok(!('lixo' in (estranho?.aparencia ?? {})));
});

caso('a legenda diz o estilo da capa e o que mais se vê', () => {
  const p = presetPartilhado(presetParaPartilhar({ nome: 'N', aparencia: aspeto, capa: 'full' }))!;
  assert.equal(legendaDoPreset(p), 'Full · OLED · Serif · Liquid Glass');
});

caso('guardar um que veio dá-lhe um nome que ainda não há, sem passar das 24 letras', () => {
  assert.equal(nomeLivre('Night', ['Day']), 'Night');
  assert.equal(nomeLivre('Night', ['night']), 'Night 2');
  assert.equal(nomeLivre('Night', ['Night', 'Night 2']), 'Night 3');
  assert.equal(nomeLivre('x'.repeat(24), ['x'.repeat(24)]).length, 24);
});

caso('nas conversas diz-se preset, e não se lê como uma música', () => {
  assert.deepEqual(previaDaConversa({ itemType: 'preset', message: null, trackTitle: 'Night', senderId: 'b' } as any, 'a').musica, false);
  assert.match(previaDaConversa({ itemType: 'preset', message: null, trackTitle: 'Night', senderId: 'a' } as any, 'a').texto, /You shared a preset/);
  assert.equal(excertoDaMensagem({ itemType: 'preset', message: null, playlistId: null, preset: { nome: 'Night' } }), 'Preset · Night');
  assert.equal(resumoDaMensagem({ itemType: 'preset', message: null, trackData: null, preset: { nome: 'Night' } as any }), 'Sent you the Night preset');
});

caso('ligado: o menu do preset manda, o chat mostra, o iPhone abre a folha, o PC diz onde se usa', () => {
  const personalizar = ler('src/screens/PersonalizarScreen.tsx');
  assert.match(personalizar, /label: 'Send to friends'[\s\S]*setAPartilhar\(p\)/);
  assert.match(personalizar, /<ShareFriendSheet visible=\{!!aPartilhar\} itemType="preset"/);
  const social = ler('src/api/social.ts');
  assert.match(social, /itemType === 'preset'\) \{\n\s*comum\.track_data = dadosDoPreset\(item\)/);
  assert.match(social, /itemType === 'preset'\) payload\.track_data = dadosDoPreset\(item\)/);
  assert.equal((social.match(/presetPartilhado\(r\.track_data\)/g) ?? []).length, 3, 'os três sítios que leem mensagens');
  assert.match(ler('src/components/SocialHub.tsx'), /m\.preset&&<SharedPresetCard semFundo preset=\{m\.preset\}/);
  assert.match(ler('src/components/GroupChat.tsx'), /m\.preset&&<SharedPresetCard preset=\{m\.preset\}/);
  assert.match(ler('src/navigation/RootNavigator.tsx'), /<FolhaDoPresetPartilhado \/>/);
  const aberto = ler('src/state/presetPartilhadoAberto.ts');
  assert.match(aberto, /Platform\.OS === 'web'[\s\S]*avisarInfo/);
  assert.match(ler('src/components/FolhaDoPresetPartilhado.tsx'), /<PreviaAoVivo ap=\{preset\.aparencia\} capa=\{preset\.capa\}/);
  assert.match(ler('src/lib/migracoes.ts'), /partilhar-presets\.sql', marca: 'fn:shared_preset_valid'/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nPartilhar presets: tudo certo.');
