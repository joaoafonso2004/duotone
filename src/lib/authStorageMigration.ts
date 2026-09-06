/**
 * Passa a sessão do armazenamento antigo para o cofre da plataforma, sem
 * arriscar que alguém tenha de voltar a entrar na conta.
 *
 * O que estava mal: os tokens de sessão viviam no AsyncStorage — em claro, e no
 * Windows dentro do localStorage do renderer. Quem copiasse o perfil levava a
 * sessão com ele.
 *
 * O que torna isto delicado é o modo de falha. O SecureStore tem limites de
 * tamanho e pode recusar um payload grande; se apagássemos o legado a contar
 * com uma escrita que não aconteceu, o utilizador abria a app deslogado, com a
 * biblioteca a pedir login e sem perceber porquê. Por isso a ordem é:
 *
 *   1. escrever no cofre;
 *   2. ler de volta e confirmar que ficou lá mesmo;
 *   3. só então apagar o legado.
 *
 * Se qualquer um destes passos falhar, ficamos no legado e a app continua a
 * funcionar exatamente como hoje. Segurança a mais nunca pode custar a sessão.
 *
 * Aviso de sentido único: uma versão anterior da app só sabe ler o legado. Quem
 * fizer downgrade depois da migração terá de entrar outra vez — é o preço de
 * tirar os tokens de um sítio em claro, e é recuperável.
 */

export interface Armazem {
  getItem(chave: string): Promise<string | null>;
  setItem(chave: string, valor: string): Promise<void>;
  removeItem(chave: string): Promise<void>;
}

export function criarStorageMigrado(cofre: Armazem, legado: Armazem): Armazem {
  /** O cofre pode não existir neste aparelho; a app não pode morrer por isso. */
  let cofreUtilizavel = true;

  const semCofre = (erro: unknown) => {
    cofreUtilizavel = false;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[authStorage] cofre indisponível, a usar o legado:', erro);
    }
  };

  return {
    async getItem(chave) {
      if (cofreUtilizavel) {
        try {
          const doCofre = await cofre.getItem(chave);
          if (doCofre !== null) return doCofre;
        } catch (erro) {
          semCofre(erro);
        }
      }

      // Ainda não migrado (ou o cofre falhou): o legado é a fonte.
      const doLegado = await legado.getItem(chave).catch(() => null);
      if (doLegado === null) return null;

      if (cofreUtilizavel) {
        // Aproveita a leitura para migrar. Se não der, fica como está e
        // tentamos outra vez para a próxima -- nunca se perde o valor.
        await guardarComSeguranca(chave, doLegado).catch(() => {});
      }
      return doLegado;
    },

    async setItem(chave, valor) {
      await guardarComSeguranca(chave, valor);
    },

    async removeItem(chave) {
      // Sair da conta tem de limpar os DOIS sítios, mesmo que um falhe.
      const resultados = await Promise.allSettled([
        cofreUtilizavel ? cofre.removeItem(chave) : Promise.resolve(),
        legado.removeItem(chave),
      ]);
      const falhou = resultados.find((r) => r.status === 'rejected');
      if (falhou) throw (falhou as PromiseRejectedResult).reason;
    },
  };

  async function guardarComSeguranca(chave: string, valor: string): Promise<void> {
    if (cofreUtilizavel) {
      try {
        await cofre.setItem(chave, valor);
        // Confirmar ANTES de apagar o legado: é isto que impede uma escrita
        // recusada em silêncio de custar a sessão ao utilizador.
        if ((await cofre.getItem(chave)) === valor) {
          await legado.removeItem(chave).catch(() => {});
          return;
        }
        semCofre(new Error('o cofre não devolveu o que lá foi escrito'));
      } catch (erro) {
        semCofre(erro);
      }
    }
    await legado.setItem(chave, valor);
  }
}
