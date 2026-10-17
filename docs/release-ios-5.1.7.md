Duotone iOS 5.1.7 — menos pedidos ao servidor

Novo nesta versão:
- A app faz bem menos pedidos ao servidor, para não passar os limites do plano gratuito. O "online" que os amigos veem renova-se de 10 em 10 minutos em vez de 3 (precisa do SQL `supabase/presenca-quinze-minutos.sql`). Numa conta com um só aparelho, a sessão do "Continue here" deixa de se gravar a cada música, porque não há outro aparelho que a leia.
- Se a app fechar sem aviso a meio de uma música (por exemplo, fechada no seletor de apps), os amigos deixam de te ver "a ouvir" quando essa música acabava.
- O relatório de reprodução diz quantos pedidos a app fez ao servidor, e a quê.

Verificações recomendadas: https://github.com/joaoafonso2004/duotone/blob/ios-v5.1.7/docs/VERIFICAR-5.1.7.md
Comparar com iOS 5.1.6: https://github.com/joaoafonso2004/duotone/compare/ios-v5.1.6...ios-v5.1.7
