import AppIntents

/**
 * Os atalhos que a Siri conhece sem ninguém os configurar.
 *
 * Um `AppShortcutsProvider` publica-os na instalação: "Ei Siri, faixa seguinte
 * no Duotone" passa a funcionar sem a pessoa ir aos Atalhos criar seja o que
 * for. É a diferença entre uma funcionalidade que existe e uma que é usada.
 *
 * Todos partilham a mesma regra: se a app estiver viva, o comando chega ao
 * leitor sem abrir nada; se não estiver, pede-se ao sistema para a abrir. Ver
 * a `PonteDeIntents`.
 */

@available(iOS 16.4, *)
private func entregar(_ comando: ComandoDeIntent, _ intent: any AppIntent) throws {
  if PonteDeIntents.partilhada.enviar(comando) { return }
  // Sem app não há leitor. Isto abre-a em vez de a Siri dizer "pronto" sobre
  // uma coisa que não aconteceu.
  throw intent.needsToContinueInForegroundError()
}

@available(iOS 16.4, *)
struct TocarNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Tocar"
  static var description = IntentDescription("Retoma a música onde ficou.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    try entregar(.tocar, self)
    return .result()
  }
}

@available(iOS 16.4, *)
struct PausarNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Pausar"
  static var description = IntentDescription("Pausa o que está a tocar.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    try entregar(.pausar, self)
    return .result()
  }
}

@available(iOS 16.4, *)
struct FaixaSeguinteNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Faixa seguinte"
  static var description = IntentDescription("Salta para a faixa a seguir na fila.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    try entregar(.seguinte, self)
    return .result()
  }
}

@available(iOS 16.4, *)
struct FaixaAnteriorNoDuotone: AppIntent {
  static var title: LocalizedStringResource = "Faixa anterior"
  static var description = IntentDescription("Volta à faixa anterior.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    try entregar(.anterior, self)
    return .result()
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
