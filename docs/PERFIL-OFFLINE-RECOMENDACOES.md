# Perfil, offline e recomendações

Implementação das sugestões 3, 6 e 7, de 3 de setembro de 2026.

## Perfil — Windows e iOS

O editor permite escolher até três playlists em destaque e a música do momento.
As playlists aparecem primeiro, pela ordem escolhida, identificadas por uma
estrela. A música tem reprodução e o menu de ações habitual. As escolhas vazias
não acrescentam secções vazias ao perfil.

Só se podem destacar playlists próprias já marcadas como visíveis aos amigos.
Esconder ou apagar uma playlist retira-a dos destaques na próxima leitura.
A música escolhida é visível aos amigos aceites, tal como as estatísticas.
Nome, imagens, bio e destaques são gravados numa transação com controlo de versão:
se outra edição ganhar entretanto, é preciso reabrir o editor.

## Offline — apenas iOS

A deteção distingue ligação a Wi-Fi de acesso à internet; os dados móveis
também permitem usar a app normalmente. A biblioteca guarda a lista de gostos
no aparelho, separada por conta. Sem internet, Songs filtra essa lista pelos
ficheiros de áudio disponíveis, incluindo as filas dos botões Play e Shuffle.
Remover um download atualiza a lista. Operações que precisam do servidor ficam
indisponíveis, com indicação do motivo. As definições locais continuam acessíveis.

O arranque pode abrir a biblioteca local mesmo quando o token precisa de renovação.
A identidade local não contém credenciais e não autoriza pedidos ao servidor.
Sair da conta apaga essa identidade. As respostas anteriores ao logout não podem
repor a conta. A cache antiga de uma conta não aparece noutra.

Quando a internet regressa, a sessão, os ecrãs, a biblioteca, o Social e as
recomendações recuperam sem reiniciar. O leitor permanece montado. Pedidos de
rádio e shuffle inteligente em curso deixam de poder introduzir faixas quando
a app fica offline. A limpeza automática de áudio não corre no arranque offline.

Após instalar esta versão, é necessário abrir a app uma vez com internet para
guardar a lista de gostos. Só há reprodução offline de áudio YouTube presente
no aparelho; conteúdos remotos e Spotify continuam a precisar de rede.

## Recomendações — Windows e iOS

O menu de uma música inclui Recommendations. É possível deixar de sugerir a
faixa ou reduzir o artista. A primeira preferência exclui a chave da faixa
(`source:sourceId`) das sugestões. A segunda reduz o peso do artista a 25% na
escolha dos pontos de partida e limita-o a uma faixa por lote, depois das
alternativas. As regras abrangem prateleiras, daily flow, rádio e smart shuffle.

As preferências são privadas e guardadas no Supabase por conta; são carregadas
no arranque e na recuperação da ligação iOS. Settings → Recommendations permite
rever e repor cada escolha. A pesquisa manual, a biblioteca, as estatísticas e
a fila escolhida pelo utilizador mantêm as faixas. Falhar a gravação apresenta
um erro e conserva a escolha anterior.

## Aplicação e validação

No SQL Editor do Supabase, executar:

1. `supabase/profile-highlights.sql`, depois das migrações anteriores
   `social-presence.sql`, `social-profiles.sql`, `profile-media.sql` e
   `profile-playlists.sql`.
2. `supabase/recommendation-feedback.sql`.

As duas migrações podem ser repetidas. A instalação iOS requer uma nova build
nativa com `@react-native-community/netinfo`; exportar o bundle não instala esse
módulo num IPA antigo.

Testes automatizados cobrem RLS, limite e ordem dos destaques, rollback da edição,
ocultação/remoção de playlists, bibliotecas acima de mil faixas, cache por conta,
respostas atrasadas após unlike/logout, transições de conectividade e preferências.
A interface foi percorrida no browser com dados descartáveis, incluindo guardar
um perfil, ocultar uma sugestão e repô-la nas Definições.

Ainda é necessária validação no iPhone: abrir em modo avião, tocar várias músicas
descarregadas, remover um download, regressar de segundo plano e ligar novamente
Wi-Fi/dados móveis sem fechar a app. A compilação Windows não substitui este ensaio.
