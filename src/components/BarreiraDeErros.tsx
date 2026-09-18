import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';
import { reportarErro } from '../state/saudeDaApp';

/**
 * Um ecrã que rebenta mostra "Reload", e não um ecrã em branco.
 *
 * Há uma por ecrã (o `screenLayout` dos navegadores no iPhone, a página no
 * PC): o leitor vive fora dos ecrãs, por isso a música continua a tocar
 * enquanto o ecrã que falhou é remontado. O erro vai para a analítica pela
 * `saudeDaApp`, sem conteúdo.
 *
 * `discreta` é para o que não tem ecrã próprio (o leitor): não desenha nada e
 * tenta outra vez sozinha, até três vezes. O leitor contém o motor; remontá-lo
 * retoma a faixa, e um aviso por cima da app não ajudaria ninguém.
 *
 * `chave`: quando muda (outra página no PC), a barreira esquece a falha.
 */
type Props = {
  onde: string;
  children: React.ReactNode;
  chave?: unknown;
  discreta?: boolean;
};

type Estado = { falhou: boolean; tentativas: number };

const TENTATIVAS_SOZINHA = 3;
const ESPERA_ANTES_DE_TENTAR_MS = 1500;

export class BarreiraDeErros extends React.Component<Props, Estado> {
  state: Estado = { falhou: false, tentativas: 0 };
  private relogio: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): Partial<Estado> {
    return { falhou: true };
  }

  componentDidCatch(erro: unknown): void {
    reportarErro(erro, this.props.onde);
    if (this.props.discreta && this.state.tentativas < TENTATIVAS_SOZINHA) {
      if (this.relogio) clearTimeout(this.relogio);
      this.relogio = setTimeout(this.recarregar, ESPERA_ANTES_DE_TENTAR_MS);
    }
  }

  componentDidUpdate(anterior: Props): void {
    if (this.state.falhou && anterior.chave !== this.props.chave) {
      this.setState({ falhou: false, tentativas: 0 });
    }
  }

  componentWillUnmount(): void {
    if (this.relogio) clearTimeout(this.relogio);
  }

  private recarregar = (): void => {
    this.relogio = null;
    this.setState((s) => ({ falhou: false, tentativas: s.tentativas + 1 }));
  };

  render(): React.ReactNode {
    if (!this.state.falhou) return this.props.children;
    if (this.props.discreta) return null;
    return (
      <View style={estilos.caixa} accessibilityRole="alert">
        <Text style={estilos.titulo}>Something went wrong on this screen</Text>
        <Text style={estilos.texto}>The music keeps playing. The problem was reported.</Text>
        <Pressable
          onPress={this.recarregar}
          accessibilityRole="button"
          style={({ pressed }) => [estilos.botao, pressed && estilos.botaoPremido]}
        >
          <Text style={estilos.botaoTexto}>Reload</Text>
        </Pressable>
      </View>
    );
  }
}

const estilos = StyleSheet.create({
  caixa: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  titulo: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  texto: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  botao: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 44,
    justifyContent: 'center',
  },
  botaoPremido: { backgroundColor: colors.surfacePressed },
  botaoTexto: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
