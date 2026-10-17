Duotone para Windows 5.1.7 — menos pedidos ao servidor

Novo nesta versão:
- O PC deixa de fazer uma pergunta extra antes de cada pedido ao servidor (o "OPTIONS" do browser). Os pedidos passam pelo processo da app, que não precisa dela. Era cerca de 1 em cada 5 linhas de log do servidor.
- O "online" que os amigos veem renova-se de 10 em 10 minutos em vez de 3 (precisa do SQL `supabase/presenca-quinze-minutos.sql`). Voltar à janela, por exemplo ao sair de um jogo, já não volta a ler os teus outros aparelhos sem motivo. Numa conta com um só aparelho, a sessão do "Continue here" deixa de se gravar a cada música.
- Se a app fechar sem aviso a meio de uma música, os amigos deixam de te ver "a ouvir" quando essa música acabava.
- O relatório de reprodução (Settings → Save playback report) diz quantos pedidos a app fez ao servidor, e a quê.

Verificações recomendadas: https://github.com/joaoafonso2004/duotone/blob/win-v5.1.7/docs/VERIFICAR-5.1.7.md
Comparar com Windows 5.1.6: https://github.com/joaoafonso2004/duotone/compare/win-v5.1.6...win-v5.1.7
