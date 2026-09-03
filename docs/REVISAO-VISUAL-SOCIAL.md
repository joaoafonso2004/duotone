# Coerência visual do Social e do Perfil

Esta revisão aplica as correções de aparência e navegação da auditoria. As sugestões de novas funcionalidades ficam adiadas.

- O Windows usa as fontes, superfícies, margens e cantos dos restantes ecrãs. O iOS mantém os seus tokens e o tema escolhido.
- Em janelas largas, a lista de conversas e o chat aparecem lado a lado; em áreas estreitas, alternam com um botão de voltar. O leitor do Windows continua acessível.
- No iOS, a conversa ocupa o ecrã inteiro, com tratamento do teclado. Os restantes diálogos sociais aparecem como folhas inferiores.
- Os separadores indicam a opção selecionada. Os botões distinguem ações principais, secundárias e destrutivas, com feedback e áreas de toque de 44 pontos.
- O perfil apresenta a identidade, as playlists e depois as estatísticas. A capa conserva o recorte 8:3; sem capa, não se reserva um bloco vazio.
- As playlists usam as capas existentes e mostram o estado de visibilidade ou de cópia guardada. Guardar continua a criar uma cópia independente.
- As estatísticas completas são acessíveis nos perfis de amigos autorizados. No próprio perfil iOS, o acesso às conversas mostra a contagem de mensagens por ler.
- O editor usa duas colunas no Windows quando há espaço e uma coluna no telemóvel. O upload e o recorte mantêm o mesmo funcionamento.
- A reserva inferior do conteúdo considera a área segura, as tabs e o mini-player no iOS; o Windows tem o leitor fora da área de scroll.

## Validação

TypeScript, a suite `npm test`, a exportação web de produção e a exportação do bundle iOS passaram. No browser, com dados descartáveis: lista/conversa, envio de mensagem, seleção dos separadores, abrir perfil, guardar/remover uma cópia, estatísticas do amigo, editor e capa 8:3.

A exportação iOS não é uma compilação IPA nem um ensaio num dispositivo. Teclado, transições e VoiceOver precisam de confirmação num iPhone. Não foi aplicada nenhuma alteração ao Supabase nesta revisão.
