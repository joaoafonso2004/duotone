import ExpoModulesCore
import UIKit

/**
 * Os atalhos do icone da app (7/10): premir o icone mostra "Resume", "Daily mix"
 * e "Shuffle Liked Songs". Os atalhos sao estaticos (UIApplicationShortcutItems
 * no Info.plist, pelo app.json); aqui so se recebe o que se escolheu.
 *
 * O iOS entrega a escolha ao AppDelegate (`performActionFor`), muitas vezes
 * antes de o JS existir -- num arranque a frio. Por isso o `Centro` guarda-a
 * ate alguem a pedir (`tirarPendente`) ou, com o JS a ouvir, manda-a logo.
 */
final class DuotoneAtalhosCentro {
  static let shared = DuotoneAtalhosCentro()
  private let fila = DispatchQueue(label: "duotone.atalhos")
  private var pendente: String?
  private var ouvinte: ((String) -> Void)?

  func chegou(_ tipo: String) {
    var entregar: ((String) -> Void)?
    fila.sync {
      if let o = ouvinte { entregar = o } else { pendente = tipo }
    }
    entregar?(tipo)
  }

  func tirarPendente() -> String? {
    return fila.sync {
      let p = pendente
      pendente = nil
      return p
    }
  }

  func definirOuvinte(_ o: ((String) -> Void)?) {
    fila.sync { ouvinte = o }
  }
}

public class DuotoneAtalhosAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    DuotoneAtalhosCentro.shared.chegou(shortcutItem.type)
    completionHandler(true)
  }
}

public class DuotoneAtalhosModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneAtalhos")

    Events("onAtalho")

    OnStartObserving {
      DuotoneAtalhosCentro.shared.definirOuvinte { [weak self] tipo in
        self?.sendEvent("onAtalho", ["tipo": tipo])
      }
    }

    OnStopObserving {
      DuotoneAtalhosCentro.shared.definirOuvinte(nil)
    }

    /** O atalho que chegou antes de o JS ouvir (arranque a frio). Ler apaga-o. */
    Function("tirarPendente") { () -> String? in
      return DuotoneAtalhosCentro.shared.tirarPendente()
    }
  }
}
