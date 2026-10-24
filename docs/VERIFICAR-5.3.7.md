# O que verificar no Duotone 5.3.7 (Windows; no iPhone é igual à 5.3.6)

Passaram os 267 testes, também numa cópia com os finais de linha do Windows. Os menus novos foram vistos num ensaio isolado, ainda não na app a sério.

## Um amigo (PC)

- **Social:** botão direito num amigo da lista abre o menu dele, o mesmo da lateral.
  - Num grupo, ou numa conversa com alguém que já não é teu amigo, não aparece nada.
  - "Send message" abre a conversa. "View profile" abre o perfil.
- **Perfil de um amigo:** botão direito no topo (a foto e o nome) abre o mesmo menu. No teu perfil não aparece nada.
- **Jam:** abre a janela da Jam e faz botão direito num participante que seja teu amigo.
  - Não há "Listen along" nem "Invite to your Jam" (ele já está nela).
  - Em ti próprio, ou em quem não é teu amigo, não aparece nada.
- **Remove friend** pede confirmação antes de remover, em todos estes sítios.

## Uma mensagem (PC)

- **Botão direito numa mensagem**, numa conversa a dois e num grupo:
  - em cima, as seis reações; a que já é tua fica acesa, e escolhê-la outra vez tira-a;
  - por baixo, Reply (fica a responder a essa mensagem) e Copy text (diz "Copied." e o texto fica na área de transferência).
- **Numa música partilhada:** também Play now, Add to queue, Add to Liked Songs (ou Remove) e "Add to playlist ›", o mesmo painel do menu de uma música.
- **Com texto selecionado** dentro da mensagem, o botão direito mostra o Copy do Windows e copia só o que selecionaste.
- Os dois botões que aparecem ao passar o rato (responder e reagir) continuam lá.

## Avisos no PC

- Os avisos do Social passaram a aparecer no PC. Experimenta convidar um amigo para ouvir contigo: deve aparecer "Invited … to listen".

## Ainda da 5.3.6, se não verificaste

- Os menus da 5.3.6 estão todos em [VERIFICAR-5.3.6.md](VERIFICAR-5.3.6.md): o Add to playlist ao lado do menu, e o botão direito em artistas, discos, misturas, Liked Songs, na música que toca e nos campos de texto.
- **Do teu lado, por fazer desde a 5.3.5:**
  - correr `supabase/radio-tipo-no-jam.sql` à mão no Supabase;
  - mandar o "Server requests" do relatório do PC, com "realtime: connected" e menos de 100 pedidos por hora.

Releases: [iOS 5.3.7](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.3.7) · [Windows 5.3.7](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.3.7).
