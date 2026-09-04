import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const raiz=new URL('../supabase/',import.meta.url);
const ler=n=>fs.readFileSync(new URL(n,raiz),'utf8');
const db=new PGlite();
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const como=async n=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const q=(sql,args=[])=>db.query(sql,args);
try {
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated,anon;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
create function storage.foldername(name text) returns text[] language sql as $$select string_to_array(name,'/')$$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
`);
for(const f of ['schema.sql','listening-stats.sql','funcoes-existentes.sql','social-setup.sql','group-chats.sql','track-adjustments.sql'])await db.exec(ler(f).replace('create extension if not exists "pgcrypto";',''));
await db.exec(`alter table profiles add column if not exists avatar_url text;alter table profiles add column if not exists username text;
alter table friendships add column if not exists requester_id uuid;
grant all on all tables in schema public to authenticated;
create policy "diagnóstico: perfis públicos" on profiles for select to authenticated using(true);`);
for(let i=0;i<2;i++)for(const f of ['social-presence.sql','social-profiles.sql','profile-media.sql'])await db.exec(ler(f));
// Falha cedo se os destaques forem aplicados antes das playlists.
await assert.rejects(db.exec(ler('profile-highlights.sql')),/Aplica primeiro/);
await db.exec('rollback');
assert.equal((await q("select 1 from information_schema.columns where table_name='profile_appearance' and column_name='pinned_playlist_ids'")).rows.length,0);
// Depois do social-presence: e ele que cria o social_can_view, de que este depende.
await db.exec(ler('profile-playlists.sql'));
await db.exec(ler('profile-playlists.sql'));
await q(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'um@example.test','{"name":"Um"}'),($2,'dois@example.test','{"name":"Dois"}'),($3,'tres@example.test','{"name":"Tres"}')`,[uid(1),uid(2),uid(3)]);
await como(1);
await q(`insert into friendships(user_id_1,user_id_2,status,requester_id) values($1,$2,'pending',$1)`,[uid(1),uid(2)]);
assert.equal((await q(`update friendships set status='accepted' returning *`)).rows.length,0);
await como(2);
assert.equal((await q(`update friendships set status='accepted' returning *`)).rows.length,1);
assert.equal((await q('select * from profiles')).rows.length,1);
assert.equal((await q('select * from get_public_profiles($1)',[[uid(1),uid(2)]])).rows.length,2);
assert.ok(!('email' in (await q('select * from get_public_profiles($1)',[[uid(1)]])).rows[0]));
await q(`insert into shared_items(sender_id,recipient_id,item_type,message,created_at) select $1::uuid,$2::uuid,'track',n::text,'2026-09-01T12:00:00Z'::timestamptz from generate_series(1,101)n`,[uid(2),uid(1)]);
const page=(await q('select * from get_social_messages($1)',[uid(1)])).rows;
assert.equal(page.length,100);
const last=page.at(-1);
assert.equal((await q('select * from get_social_messages($1,null,$2,$3)',[uid(1),last.created_at,last.id])).rows.length,1);
assert.equal((await q('select * from get_social_conversations()')).rows[0].id,uid(1));
await como(3);
assert.equal((await q('select * from get_social_messages($1)',[uid(1)])).rows.length,0);
assert.equal((await q('select * from get_social_conversations()')).rows.length,0);
await db.exec('reset role');
await q(`insert into tracks(id,source,source_id,title,artist,duration_seconds) values($1,'youtube','abc','Teste','Artista',180)`,[uid(10)]);
await q(`insert into user_play_counts(user_id,source,source_id,title,artist,play_count,last_played) values($1,'youtube','abc','Teste','Artista',8,now())`,[uid(1)]);
await q(`insert into plays(user_id,track_id) values($1,$2)`,[uid(1),uid(10)]);
await como(2);
assert.equal((await q('select * from get_social_profile_tracks($1)',[uid(1)])).rows[0].title,'Teste');
assert.equal((await q('select * from get_social_profile_plays($1)',[uid(1)])).rows.length,1);
assert.equal((await q('select get_social_profile($1) as p',[uid(1)])).rows[0].p.stats.totalPlays,8);
await como(3);
await assert.rejects(q('select * from get_social_profile_tracks($1)',[uid(1)]),/Perfil privado/);
assert.equal((await q('select get_social_profile($1) as p',[uid(1)])).rows[0].p.stats,null);
await como(1);
const track={source:'youtube',sourceId:'abc',title:'Teste',artist:'Artista',queue:['privado']};
const publish=(device,session,seq,active,playing,end=false)=>q('select publish_social_presence($1,$2,$3,$4,$5,$6)',[device,uid(session),seq,active,playing,end]);
await publish('ios',101,1,true,track);
await publish('windows',102,1,true,null);
await publish('windows',102,2,false,null,true);
let p=(await q('select * from social_presence')).rows[0];
assert.equal(p.currently_playing.title,'Teste');assert.ok(!p.currently_playing.queue);
await publish('ios',101,3,true,null);
await publish('ios',101,2,true,track);
assert.equal((await q('select * from social_presence')).rows[0].currently_playing,null);
await publish('ios',103,1,true,track);
await publish('ios',101,4,false,null,true);
assert.equal((await q('select * from social_presence')).rows[0].currently_playing.title,'Teste');
await assert.rejects(q('select * from social_presence_sessions'),/permission denied/);
await como(2);assert.equal((await q('select * from social_presence')).rows.length,1);
await como(3);assert.equal((await q('select * from social_presence')).rows.length,0);
await como(1);
const path=uid(1)+'/avatar/teste.jpg',cover=uid(1)+'/cover/teste.jpg';
await q(`insert into storage.objects(bucket_id,name) values('profile-avatars',$1),('profile-covers',$2)`,[path,cover]);
await q('select save_profile_appearance($1,0,$2)',[{avatar_path:path,cover_path:cover,bio:'Olá'},'Nome novo']);
await assert.rejects(q('select save_profile_appearance($1,0,$2)',[{avatar_path:path},'Nome outro']),/noutro dispositivo/);
await como(2);assert.equal((await q('select * from storage.objects')).rows.length,2);
await assert.rejects(q(`insert into storage.objects(bucket_id,name) values('profile-avatars',$1)`,[uid(1)+'/avatar/ataque.jpg']),/row-level security/);
await assert.rejects(q('select save_profile_appearance($1,0,$2)',[{avatar_path:path},'Intruso']),/Fotografia inválida/);
await como(3);assert.equal((await q('select * from storage.objects')).rows.length,1);
await como(2);await q('delete from friendships');
assert.equal((await q('select * from get_social_conversations()')).rows[0].id,uid(1));
assert.equal((await q('select * from get_social_messages($1)',[uid(1)])).rows.length,100);
assert.equal((await q('select * from social_presence')).rows.length,0);
assert.equal((await q('select * from storage.objects')).rows.length,1);
await assert.rejects(q('select * from get_social_profile_plays($1)',[uid(1)]),/Perfil privado/);
// ---------------------------------------------------------------------------
// Grupos: criar um grupo e pôr lá gente.
//
// Porque e que isto existe: a politica de leitura da chat_groups foi escrita
// como "so ve quem e membro". So que quem CRIA o grupo ainda nao e membro de
// nada -- e o cliente faz `insert ... returning id`, que precisa de ler a
// linha nova. Resultado: o Postgres recusava a insercao inteira e a app dizia
// "nao foi possivel criar o grupo" sem dizer porque. Isto prende a correcao.
await como(1);
const grupo=(await q(`insert into chat_groups(name,created_by) values($1,$2) returning id`,['Os do costume',uid(1)])).rows[0];
assert.ok(grupo?.id,'quem cria o grupo tem de conseguir ler a linha que acabou de criar');
await q(`insert into chat_group_members(group_id,user_id) values($1,$2),($1,$3)`,[grupo.id,uid(1),uid(2)]);
assert.equal((await q('select * from chat_group_members')).rows.length,2);
// Quem esta dentro le a conversa; quem nao esta nao a ve sequer.
await q(`insert into shared_items(sender_id,group_id,item_type,message) values($1,$2,'track','ouve isto')`,[uid(1),grupo.id]);
await como(2);assert.equal((await q('select * from shared_items where group_id is not null')).rows.length,1);
await como(3);assert.equal((await q('select * from shared_items where group_id is not null')).rows.length,0);
// E quem esta de fora nao consegue escrever no grupo dos outros.
await assert.rejects(q(`insert into shared_items(sender_id,group_id,item_type,message) values($1,$2,'track','intruso')`,[uid(3),grupo.id]),/row-level security/);
await como(1);await q('delete from shared_items where group_id is not null');await q('delete from chat_group_members');await q('delete from chat_groups');

// ---------------------------------------------------------------------------
// Ajustes por faixa: sao privados, e a tabela recusa lixo.
//
// O equalizador e a velocidade de cada musica passaram a viver tambem no
// servidor, para o PC e o telemovel deixarem de ter memorias separadas das
// MESMAS faixas. Ao contrario das estatisticas, isto nao aparece em perfil
// nenhum: e so de quem o escreveu.
await como(1);
await q(`insert into user_track_adjustments(user_id,source,source_id,rate,gains) values($1,'youtube','abc',1.25,null)`,[uid(1)]);
await q(`insert into user_track_adjustments(user_id,source,source_id,rate,gains) values($1,'youtube','def',null,$2)`,[uid(1),[3,0,0,0,0,0,0,0,0,-2]]);
assert.equal((await q('select * from user_track_adjustments')).rows.length,2);
// Outra pessoa nao os ve nem lhes toca.
await como(2);
assert.equal((await q('select * from user_track_adjustments')).rows.length,0);
await assert.rejects(q(`insert into user_track_adjustments(user_id,source,source_id,rate) values($1,'youtube','xyz',2)`,[uid(1)]),/row-level security/);
await como(1);
// Uma linha sem nada fora do normal nao existe: voltar tudo ao normal apaga.
await assert.rejects(q(`insert into user_track_adjustments(user_id,source,source_id) values($1,'youtube','vazio')`,[uid(1)]),/tem_alguma_coisa/);
// Os ganhos sao dez, nem nove nem onze -- uma linha dessas nao sabe tocar.
await assert.rejects(q(`insert into user_track_adjustments(user_id,source,source_id,gains) values($1,'youtube','curto',$2)`,[uid(1),[1,2,3]]),/gains/);
// E a velocidade fica dentro do que a interface oferece.
await assert.rejects(q(`insert into user_track_adjustments(user_id,source,source_id,rate) values($1,'youtube','rapido',9)`,[uid(1),]),/rate/);
// Mexer outra vez na mesma faixa substitui, nao duplica.
await q(`insert into user_track_adjustments(user_id,source,source_id,rate) values($1,'youtube','abc',0.75)
  on conflict (user_id,source,source_id) do update set rate=excluded.rate,seen_at=now()`,[uid(1)]);
assert.equal((await q(`select rate from user_track_adjustments where source_id='abc'`)).rows[0].rate,0.75);
assert.equal((await q('select * from user_track_adjustments')).rows.length,2);
// O ficheiro promete ser seguro a segunda passagem. Prova-se.
await db.exec('reset role');await db.exec(ler('track-adjustments.sql'));await como(1);
assert.equal((await q('select * from user_track_adjustments')).rows.length,2,'a segunda aplicacao nao pode apagar o que la esta');
// A escrita usada pela app: inserir sem substituir e atualizar apenas se mais recente.
await q(`update user_track_adjustments set rate=1,gains=$1,seen_at='2026-09-03T12:00:00Z' where source_id='abc'`,[Array(10).fill(0)]);
await q(`insert into user_track_adjustments(user_id,source,source_id,rate,seen_at) values($1,'youtube','abc',0.7,'2026-09-03T11:00:00Z') on conflict(user_id,source,source_id) do nothing`,[uid(1)]);
await q(`update user_track_adjustments set rate=0.7,seen_at='2026-09-03T11:00:00Z' where source_id='abc' and seen_at<'2026-09-03T11:00:00Z'`);
assert.equal((await q(`select rate from user_track_adjustments where source_id='abc'`)).rows[0].rate,1,'um envio atrasado não anula a reposição Flat/1×');
await q(`update user_track_adjustments set rate=1.4,seen_at='2026-09-03T13:00:00Z' where source_id='abc' and seen_at<'2026-09-03T13:00:00Z'`);
assert.equal((await q(`select rate from user_track_adjustments where source_id='abc'`)).rows[0].rate,1.4,'a edição mais recente atravessa RLS');
await q('delete from user_track_adjustments');
// ---------------------------------------------------------------------------
// Playlists no perfil: privadas por omissao, visiveis so quando se marca.
//
// Ate aqui uma playlist de outra pessoa so era legivel se tivesse sido
// mandada numa conversa. Agora ha um interruptor por playlist -- e o que
// importa provar e que ele comeca DESLIGADO e que ligar so abre a porta a
// amigos, nao a toda a gente.
// O uid(1) e o uid(2) sao amigos aceites; o uid(3) nao e amigo de ninguem.
// A amizade e reposta aqui porque um teste acima apaga-as todas, e sem ela
// o social_can_view diz que nao a toda a gente -- o que faria este bloco
// passar pelas razoes erradas.
await db.exec('reset role');
await q(`insert into friendships(user_id_1,user_id_2,status,requester_id) values($1,$2,'accepted',$1)
  on conflict (user_id_1,user_id_2) do update set status='accepted'`,[uid(1),uid(2)]);
await como(1);
const pl=(await q(`insert into playlists(owner_id,name) values($1,'So minha') returning id, visible_on_profile`,[uid(1)])).rows[0];
assert.equal(pl.visible_on_profile,false,'uma playlist nova nasce privada');
const faixaPlaylist=(await q(`select * from upsert_catalog_tracks($1)`,[[{source:'youtube',sourceId:'plx',title:'Faixa',artist:'Artista',durationSeconds:200}]])).rows[0];
await q(`insert into playlist_tracks(playlist_id,track_id,position) values($1,$2,0)`,[pl.id,faixaPlaylist.id]);

// Enquanto esta privada, nem o amigo a ve.
await como(2);
assert.equal((await q('select * from playlists where id=$1',[pl.id])).rows.length,0);
assert.equal((await q('select * from playlist_tracks where playlist_id=$1',[pl.id])).rows.length,0);
await assert.rejects(q('select set_profile_playlist_copy($1,true)',[pl.id]),/no longer available/);

// O dono liga o interruptor.
await como(1);
await q('update playlists set visible_on_profile=true where id=$1',[pl.id]);

// O amigo passa a ver a playlist E as faixas dela.
await como(2);
assert.equal((await q('select * from playlists where id=$1',[pl.id])).rows.length,1);
assert.equal((await q('select * from playlist_tracks where playlist_id=$1',[pl.id])).rows.length,1);
// Mas ver nao e mexer: continua a ser do dono.
await assert.rejects(q(`update playlists set name='Roubada' where id=$1 returning id`,[pl.id]).then(r=>{if(!r.rows.length)throw new Error('row-level security');return r;}),/row-level security/);

// Quem nao e amigo nao ve, marcada ou nao.
await como(3);
assert.equal((await q('select * from playlists where id=$1',[pl.id])).rows.length,0);
assert.equal((await q('select * from playlist_tracks where playlist_id=$1',[pl.id])).rows.length,0);
await assert.rejects(q('select set_profile_playlist_copy($1,true)',[pl.id]),/no longer available/);

// A cópia inclui mais de 1000 faixas; copiar no cliente cortava a lista.
await como(1);
const faixasGrandes=Array.from({length:1005},(_,i)=>({source:'youtube',sourceId:`copy-${i+1}`,title:`Faixa ${i+1}`}));
await q('select * from upsert_catalog_tracks($1)',[faixasGrandes.slice(0,500)]);
await q('select * from upsert_catalog_tracks($1)',[faixasGrandes.slice(500,1000)]);
await q('select * from upsert_catalog_tracks($1)',[faixasGrandes.slice(1000)]);
await q(`insert into playlist_tracks(playlist_id,track_id,position) select $1,id,substring(source_id from 6)::int from tracks where source_id like 'copy-%'`,[pl.id]);
await assert.rejects(q('select set_profile_playlist_copy($1,true)',[pl.id]),/no longer available/);
await como(2);
const copia=(await q(`select set_profile_playlist_copy($1,true) as id`,[pl.id])).rows[0];
assert.equal((await q(`select set_profile_playlist_copy($1,true) as id`,[pl.id])).rows[0].id,copia.id,'repetir o pedido não duplica a cópia');
assert.equal((await q('select copied_from from playlists where id=$1',[copia.id])).rows[0].copied_from,pl.id);
assert.equal((await q('select * from playlist_tracks where playlist_id=$1',[copia.id])).rows.length,1006);
assert.equal((await q('select visible_on_profile from playlists where id=$1',[copia.id])).rows[0].visible_on_profile,false);
await como(1);
await q(`update playlists set name='Original alterada',visible_on_profile=false where id=$1`,[pl.id]);
await q(`delete from playlist_tracks where playlist_id=$1 and position=0`,[pl.id]);
await q('select set_profile_playlist_copy($1,false)',[pl.id]);
await como(2);
assert.equal((await q('select name from playlists where id=$1',[copia.id])).rows[0].name,'So minha (Shared)');
assert.equal((await q('select * from playlist_tracks where playlist_id=$1',[copia.id])).rows.length,1006);
await q('select set_profile_playlist_copy($1,false)',[pl.id]);
await q('select set_profile_playlist_copy($1,false)',[pl.id]);
assert.equal((await q('select * from playlists where id=$1',[copia.id])).rows.length,0);
await assert.rejects(q('select set_profile_playlist_copy($1,true)',[pl.id]),/no longer available/);
// Uma falha durante a inserção das faixas não deixa uma playlist vazia.
await como(1);await q('update playlists set visible_on_profile=true where id=$1',[pl.id]);
await db.exec(`reset role;create function public.qa_fail_copy() returns trigger language plpgsql as $$begin if current_setting('qa.fail_copy',true)='1' then raise exception 'Falha simulada';end if;return new;end;$$;
create trigger qa_fail_copy before insert on playlist_tracks for each row execute function qa_fail_copy();
select set_config('qa.fail_copy','1',false);`);
await como(2);
await assert.rejects(q('select set_profile_playlist_copy($1,true)',[pl.id]),/Falha simulada/);
assert.equal((await q('select * from playlists where copied_from=$1',[pl.id])).rows.length,0);
await db.exec(`select set_config('qa.fail_copy','0',false)`);
copia.id=(await q('select set_profile_playlist_copy($1,true) as id',[pl.id])).rows[0].id;
// Se o dono original apagar a dele, a copia FICA -- e minha. Perde so a ligacao.
await como(1);await q('delete from playlists where id=$1',[pl.id]);
await como(2);
const sobrou=(await q('select copied_from from playlists where id=$1',[copia.id])).rows;
assert.equal(sobrou.length,1,'a copia nao pode desaparecer com o original');
assert.equal(sobrou[0].copied_from,null);
await q('delete from playlists where id=$1',[copia.id]);
// Destaques: autorização, limite, ordem, gravação atómica e privacidade.
await db.exec('reset role');
for(let i=0;i<2;i++)for(const file of ['profile-highlights.sql','recommendation-feedback.sql'])await db.exec(ler(file));
await como(1);
const featured=[];
for(let i=0;i<4;i++)featured.push((await q(`insert into playlists(owner_id,name,visible_on_profile) values($1,$2,true) returning id`,[uid(1),`Destaque ${i}`])).rows[0].id);
const version=async()=>Number((await q('select get_social_profile($1) as p',[uid(1)])).rows[0].p.appearance.version);
const oldVersion=await version();
await q('select save_profile_customization($1,$2,$3,$4,$5)',[{bio:'Personalizado'},oldVersion,'Personalizado',featured.slice(0,3),uid(10)]);
const readHighlights=async(id=uid(1))=>(await q('select get_profile_highlights($1) as h',[id])).rows[0].h;
assert.deepEqual((await readHighlights()).playlistIds,featured.slice(0,3));
assert.equal((await readHighlights()).moment.sourceId,'abc');
const before=await version();
const invalidSave=(ids)=>q('select save_profile_customization($1,$2,$3,$4,null)',[{bio:'Não gravar'},before,'Não gravar',ids]);
await assert.rejects(invalidSave(featured),/até três/);
await assert.rejects(invalidSave([featured[0],featured[0]]),/diferentes/);
assert.equal(await version(),before,'falhar os destaques não pode gravar o resto do perfil');
assert.equal((await q('select get_social_profile($1) as p',[uid(1)])).rows[0].p.profile.name,'Personalizado');
await como(2);
assert.equal((await readHighlights()).playlistIds.length,3);
const appearance=(await q('select get_social_profile($1) as p',[uid(1)])).rows[0].p.appearance;
assert.ok(!('pinned_playlist_ids' in appearance),'a aparência não contorna a leitura filtrada');
await assert.rejects(q('select save_profile_customization($1,0,$2,$3,null)',[{},'Outro perfil',[featured[0]]]),/tuas visíveis/);
await como(3);await assert.rejects(readHighlights(),/Perfil privado/);
await como(1);await q('update playlists set visible_on_profile=false where id=$1',[featured[0]]);
await assert.rejects(invalidSave([featured[0]]),/tuas visíveis/);
await q('delete from playlists where id=$1',[featured[1]]);
await como(2);assert.deepEqual((await readHighlights()).playlistIds,[featured[2]]);
// As preferências não são legíveis nem alteráveis por amigos.
await como(1);
await q(`insert into recommendation_feedback values($1,'track','youtube:abc','Teste')`,[uid(1)]);
await como(2);assert.equal((await q('select * from recommendation_feedback')).rows.length,0);
await assert.rejects(q(`insert into recommendation_feedback values($1,'artist','artista','Artista')`,[uid(1)]),/row-level security/);
assert.equal((await q(`delete from recommendation_feedback where user_id=$1 returning *`,[uid(1)])).rows.length,0);
await como(1);assert.equal((await q('select * from recommendation_feedback')).rows.length,1);
await q('delete from recommendation_feedback');
// A edição básica de uma app com destaques indisponíveis mantém os IDs.
await como(1);
const pinsBefore=(await readHighlights()).playlistIds;
const appearanceBefore=(await q('select get_social_profile($1) as p',[uid(1)])).rows[0].p.appearance;
await q('select save_profile_appearance($1,$2,$3)',[{...appearanceBefore,bio:'Bio atualizada'},appearanceBefore.version,'Um']);
assert.deepEqual((await readHighlights()).playlistIds,pinsBefore);
console.log('Destaques: limite, visibilidade, gravação atómica e isolamento das preferências passaram.');
// --- Marca de leitura das conversas, partilhada entre PC e telemóvel ---
// Duas vezes: as migrações correm à mão e a segunda aplicação tem de passar.
await db.exec('reset role;');await db.exec(ler('chat-reads.sql'));await db.exec(ler('chat-reads.sql'));await db.exec('grant all on all tables in schema public to authenticated;');
await como(1);
await q(`insert into chat_reads(user_id,conversation,last_read_at) values($1,$2,now())`,[uid(1),uid(2)]);
await q(`insert into chat_reads(user_id,conversation,last_read_at) values($1,'group:abc',now())`,[uid(1)]);
assert.equal((await q('select * from chat_reads')).rows.length,2);
// A marca é do leitor: ninguém mais a vê nem a escreve por ele.
await como(2);
assert.equal((await q('select * from chat_reads')).rows.length,0);
await assert.rejects(q(`insert into chat_reads(user_id,conversation,last_read_at) values($1,$2,now())`,[uid(1),uid(3)]));
assert.equal((await q(`update chat_reads set last_read_at=now() returning *`)).rows.length,0);
assert.equal((await q(`delete from chat_reads returning *`)).rows.length,0);
// O dono continua a poder avançar a sua própria marca.
await como(1);
assert.equal((await q(`update chat_reads set last_read_at=now() where conversation=$1 returning *`,[uid(2)])).rows.length,1);
console.log('Marca de leitura: por conta, isolada entre utilizadores e idempotente na dupla aplicação.');
console.log('SQL Social: dupla aplicação, aceitação, privacidade, estatísticas, dispositivos, ordem de eventos, grupos, ajustes por faixa, playlists no perfil e Storage passaram.');
}finally{await db.close();}
