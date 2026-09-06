import ExpoModulesCore

/// O que a Siri (e, mais tarde, um botão de widget) pode pedir ao leitor.
enum ComandoDeIntent: String {
  case tocar
  case pausar
  case seguinte
  case anterior
}

/**
 * O sítio onde os atalhos e o leitor se encontram.
 *
 * Os App Intents correm no MESMO processo da app. Quando ela está viva, o
 * comando chega ao JS por aqui e não é preciso abrir nada -- dizer "faixa
 * seguinte" à Siri e ver a app saltar-te para a cara seria pior do que o
 * botão que já existe no Lock Screen.
 *
 * Quando não está viva não há leitor nenhum para receber o comando, e o
 * `enviar` devolve falso. É aí que o intent pede ao sistema para abrir a app,
 * em vez de falhar em silêncio.
 */
final class PonteDeIntents {
  static let partilhada = PonteDeIntents()
  private init() {}

  private var aoReceber: ((ComandoDeIntent) -> Void)?

  var ligado: Bool { aoReceber != nil }

  func ligar(_ handler: @escaping (ComandoDeIntent) -> Void) {
    aoReceber = handler
  }

  func desligar() {
    aoReceber = nil
  }

  /// Entrega o comando. Falso quando não há ninguém do outro lado.
  @discardableResult
  func enviar(_ comando: ComandoDeIntent) -> Bool {
    guard let handler = aoReceber else { return false }
    DispatchQueue.main.async { handler(comando) }
    return true
  }
}

public class DuotoneIntentsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneIntents")

    Events("onComandoDeIntent")

    OnCreate { [weak self] in
      PonteDeIntents.partilhada.ligar { [weak self] comando in
        self?.sendEvent("onComandoDeIntent", ["comando": comando.rawValue])
      }
    }

    OnDestroy {
      PonteDeIntents.partilhada.desligar()
    }
  }
}
