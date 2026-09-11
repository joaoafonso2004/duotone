import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePessoasDaSessao } from '../hooks/usePessoasDaSessao';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { estadoDaSessao, presentes } from '../lib/sessaoViva';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';

/**
 * A faixa que diz que não estás a ouvir sozinho.
 *
 * Vive por cima do leitor pequeno e só existe enquanto a sessão existir. Duas
 * coisas, e a segunda é a que ninguém se lembra de pôr:
 *
 *  - quem está;
 *  - **quem ainda não consegue ouvir**.
 *
 * No Duotone tocar uma faixa é descarregá-la primeiro, e um amigo em 3G mau
 * pode ficar meio minuto em silêncio enquanto os outros já vão a meio. Sem esta
 * linha, isso lê-se como avaria -- a app dele parece partida e ninguém percebe
 * porquê. Com ela, é só espera, e a espera vê-se.
 */
export function BarraDaSessao({ aoAbrir, encostada = true, soAvisos = false }: {
  aoAbrir?: () => void;
  /**
   * Encostada ao leitor mini (o caso normal) ou solta.
   *
   * Encostada, os cantos de baixo ficam direitos e a borda de baixo
   * desaparece, para as duas se lerem como uma peca so. Solta -- no leitor
   * grande, onde nao ha mini nenhum por baixo -- fica um cartao inteiro.
   */
  encostada?: boolean;
  /**
   * Só aparece quando o Jam tem alguma coisa a dizer.
   *
   * Por cima do leitor pequeno a barra saiu (11/9/2026, a pedido do João): o
   * botão do Jam dentro do leitor grande chega para saber quem está. Ficaram
   * os avisos -- "Added · música", "Session ended", um erro --, porque sem
   * eles um toque que junta à fila em vez de tocar lê-se como um toque que não
   * fez nada. Aparecem, dizem, e vão-se.
   */
  soAvisos?: boolean;
}) {
  const tema = useTheme((s) => s.theme);
  const sessao = useOuvirJuntos((s) => s.sessao);
  // NUNCA chamar uma funcao dentro do selector: devolveria um array novo a
  // cada leitura, e o zustand le a store pelo `useSyncExternalStore`, que
  // exige um valor ESTAVEL. Com um valor novo de cada vez o React 18 atira
  // "The result of getSnapshot should be cached to avoid an infinite loop"
  // -- erro fatal, na montagem, antes de haver ecra. Filtra-se aqui fora.
  const todos = useOuvirJuntos((s) => s.membros);
  const membros = presentes(todos, Date.now());
  const { euId, nomeDe, avatarDe } = usePessoasDaSessao();
  const acabouSemAviso = useOuvirJuntos((s) => s.acabouSemAviso);
  const limparAviso = useOuvirJuntos((s) => s.limparAviso);
  // TODOS os hooks antes do primeiro `return`. Este estava lá em baixo, depois
  // do caminho sem sessão -- sem sessão eram sete hooks, com sessão oito, e o
  // React atira "Rendered more hooks than during the previous render" no
  // instante em que a sessão abre. Fatal, e nenhum tipo o apanha.
  const aviso = useOuvirJuntos((s) => s.aviso);

  // A sessão fechou por baixo -- normalmente o anfitrião a sair. A barra some,
  // e sem uma palavra isso lê-se como a app ter estoirado. Fica um aviso que
  // se apaga sozinho.
  React.useEffect(() => {
    if (!acabouSemAviso) return;
    const t = setTimeout(limparAviso, 6000);
    return () => clearTimeout(t);
  }, [acabouSemAviso, limparAviso]);

  // Os avisos de erro não tinham quem os apagasse: "Could not change the aux"
  // ficava na barra até outro aviso o substituir. Os de sucesso já se apagavam
  // sozinhos na store; este apanha os outros.
  React.useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => {
      if (useOuvirJuntos.getState().aviso === aviso) useOuvirJuntos.setState({ aviso: null });
    }, 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (!sessao) {
    if (!acabouSemAviso) return null;
    return (
      <Toque
        escala={ESCALA.cartao}
        onPress={limparAviso}
        accessibilityLabel="Session ended"
        style={[styles.barra, styles.acabou]}
      >
        <Ionicons name="headset-outline" size={15} color={colors.textSecondary} />
        <Text style={[styles.titulo, { color: colors.textSecondary }]}>
          Session ended
        </Text>
      </Toque>
    );
  }

  // Por cima do leitor pequeno, sem nada para dizer, não há barra.
  if (soAvisos && !aviso) return null;

  // A frase vive no `lib/sessaoViva.ts`: qual das verdades mostrar quando há
  // várias é uma decisão, e as decisões testam-se.
  const estadoNormal = estadoDaSessao({
    outros: membros
      .filter((m) => m.userId !== euId)
      .map((m) => ({ ...m, nome: nomeDe(m.userId) })),
    agora: Date.now(),
  });
  // O aviso ganha ao estado: acabou de acontecer uma coisa por causa de um
  // toque, e é isso que a pessoa está à espera de ver confirmado.
  const estado = aviso ?? estadoNormal;

  return (
    <Toque
      escala={ESCALA.cartao}
      onPress={aoAbrir}
      disabled={!aoAbrir}
      accessibilityLabel={estado}
      // Cores do TEMA e não um roxo escrito à mão: o accent é escolhido pelo
      // utilizador, e uma barra roxa fixa numa app com o tema branco lê-se como
      // uma peça de outra aplicação.
      style={[
        styles.barra,
        { backgroundColor: tema.soft, borderColor: tema.color },
        encostada && !soAvisos ? styles.encostada : styles.solta,
      ]}
    >
      <View style={styles.pilha}>
        {membros.slice(0, 3).map((m, i) => (
          <View key={m.userId} style={[styles.naPilha, i > 0 && { marginLeft: -9 }]}>
            <FriendAvatar avatarUrl={avatarDe(m.userId)} name={nomeDe(m.userId)} size={22} />
          </View>
        ))}
      </View>
      {/* Uma linha e nao duas. A segunda tinha o titulo da faixa -- cru do
          YouTube, em maiusculas e cortado -- e o leitor mini logo por baixo ja
          diz o mesmo, limpo e com a capa. Repetir era gastar altura para
          mostrar pior. */}
      <Text numberOfLines={1} style={[styles.titulo, { flex: 1 }]}>{estado}</Text>
      {aoAbrir ? (
        <Ionicons name="chevron-up" size={15} color={colors.textSecondary} />
      ) : null}
    </Toque>
  );
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
  },
  encostada: {
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    borderBottomWidth: 0,
  },
  solta: { borderRadius: radii.md },
  acabou: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  pilha: { flexDirection: 'row' },
  // A borda da cor do fundo é o que separa os avatares quando se sobrepõem --
  // sem ela ficam colados e lê-se como uma mancha só.
  naPilha: {
    borderWidth: 2,
    borderColor: colors.bg,
    borderRadius: 999,
  },
  titulo: { ...type.micro, color: colors.text, fontWeight: '600' },
});
