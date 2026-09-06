import AppIntents
// A ponte vive no pod; as frases têm de viver no alvo da app (ver o porquê
// no cabeçalho abaixo), por isso o módulo importa-se explicitamente.
//
// O nível de acesso é explícito porque tem de ser: o ExpoModulesProvider que o
// autolinking gera importa o mesmo módulo como `internal`, e sem o dizermos
// aqui o Swift recusa-se a adivinhar -- "ambiguous implicit access level".
internal import DuotoneIntents

/**
 * Os atalhos que a Siri conhece sem ninguém os configurar.
 *
 * ESTE FICHEIRO NÃO VIVE AQUI: é copiado para dentro do alvo principal da app
 * pelo `plugins/atalhos-da-siri.js`, a cada prebuild. O Xcode só extrai um
 * `AppShortcutsProvider` do alvo da app -- quando isto estava no pod, as
 * AÇÕES eram extraídas na mesma (apareciam nos Atalhos) mas o campo
 * `autoShortcuts` do bundle saía vazio, e a Siri respondia que não podia
 * fazer aquilo. Confirmado a ler o Metadata.appintents do .ipa da 1.11.1.
 *
 * Um `AppShortcutsProvider` publica-os na instalação: "Ei Siri, faixa seguinte
 * no Duotone" passa a funcionar sem a pessoa ir aos Atalhos criar seja o que
 * for. É a diferença entre uma funcionalidade que existe e uma que é usada.
 *
 * Só o "tocar" abre a app, e por uma razão simples: com a app fechada não há
 * nada a tocar, por isso pausar ou saltar não têm o que fazer -- e responder
 * "não está a tocar" é a resposta CERTA, não uma falha. Abrir a app para
 * descobrir isso seria interromper a pessoa para não fazer nada.
 */

@available(iOS 16.4, *)
struct TocarNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Tocar"
  static var description = IntentDescription("Retoma a música onde ficou.")
  /// Sem app não há leitor: esta é a única que precisa mesmo de a abrir.
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    // Se a app ainda estiver a arrancar, a ponte guarda o comando e entrega-o
    // assim que o leitor existir.
    PonteDeIntents.partilhada.enviar(.tocar, guardarSeFechado: true)
    return .result()
  }
}

@available(iOS 16.4, *)
struct PausarNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Pausar"
  static var description = IntentDescription("Pausa o que está a tocar.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult & ProvidesDialog {
    if PonteDeIntents.partilhada.enviar(.pausar) {
      return .result(dialog: "Pausado.")
    }
    return .result(dialog: "O Duotone não está a tocar.")
  }
}

@available(iOS 16.4, *)
struct FaixaSeguinteNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Faixa seguinte"
  static var description = IntentDescription("Salta para a faixa a seguir na fila.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult & ProvidesDialog {
    if PonteDeIntents.partilhada.enviar(.seguinte) {
      return .result(dialog: "Feito.")
    }
    return .result(dialog: "O Duotone não está a tocar.")
  }
}

@available(iOS 16.4, *)
struct FaixaAnteriorNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Faixa anterior"
  static var description = IntentDescription("Volta à faixa anterior.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult & ProvidesDialog {
    if PonteDeIntents.partilhada.enviar(.anterior) {
      return .result(dialog: "Feito.")
    }
    return .result(dialog: "O Duotone não está a tocar.")
  }
}

@available(iOS 16.4, *)
struct AtalhosDoDuotone: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    // As frases TÊM de conter o nome da aplicação -- é assim que a Siri sabe
    // a quem se dirige quando há mais do que um leitor no telemóvel.
    AppShortcut(
      intent: TocarNoDuotone(),
      phrases: [
        "Tocar no \(.applicationName)",
        "Retomar no \(.applicationName)",
        "Play no \(.applicationName)",
      ],
      shortTitle: "Tocar",
      systemImageName: "play.fill"
    )
    AppShortcut(
      intent: PausarNoDuotone(),
      phrases: [
        "Pausar no \(.applicationName)",
        "Parar o \(.applicationName)",
      ],
      shortTitle: "Pausar",
      systemImageName: "pause.fill"
    )
    AppShortcut(
      intent: FaixaSeguinteNoDuotone(),
      phrases: [
        "Faixa seguinte no \(.applicationName)",
        "Próxima música no \(.applicationName)",
      ],
      shortTitle: "Seguinte",
      systemImageName: "forward.fill"
    )
    AppShortcut(
      intent: FaixaAnteriorNoDuotone(),
      phrases: [
        "Faixa anterior no \(.applicationName)",
        "Música anterior no \(.applicationName)",
      ],
      shortTitle: "Anterior",
      systemImageName: "backward.fill"
    )
  }
}
