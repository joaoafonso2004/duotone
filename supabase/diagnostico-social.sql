-- Apenas leitura: exportar o resultado em CSV para confirmar o esquema real.
-- Não consulta mensagens, contas, palavras-passe ou conteúdo das imagens.
select jsonb_build_object(
  'colunas', (select jsonb_agg(to_jsonb(c)) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name in
      ('profiles','friendships','shared_items','plays','user_play_counts','profile_preferences','chat_groups','chat_group_members')),
  'politicas', (select jsonb_agg(to_jsonb(p)) from pg_policies p
    where p.schemaname in ('public','storage')),
  'permissoes', (select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g
    where g.table_schema = 'public'),
  'indices', (select jsonb_agg(to_jsonb(i)) from pg_indexes i where i.schemaname = 'public'),
  'triggers', (select jsonb_agg(to_jsonb(t)) from information_schema.triggers t where t.trigger_schema = 'public'),
  'realtime', (select jsonb_agg(to_jsonb(r)) from pg_publication_tables r where r.pubname = 'supabase_realtime'),
  'buckets', (select jsonb_agg(jsonb_build_object('id', b.id, 'public', b.public,
    'file_size_limit', b.file_size_limit, 'allowed_mime_types', b.allowed_mime_types)) from storage.buckets b)
) as diagnostico;
