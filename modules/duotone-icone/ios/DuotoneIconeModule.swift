import ExpoModulesCore
import UIKit

/**
 * O ícone da app à escolha (26/11, item 9 do plano de melhorias): Customise › App
 * icon. Os ícones estão no catálogo da app (`plugins/icones-alternativos.js`, a
 * partir de `assets/icones/`); aqui só se pergunta qual está e se troca. O iOS
 * guarda a escolha e mostra o aviso dele ao trocar.
 */
public class DuotoneIconeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneIcone")

    // Para o JavaScript saber que o binário tem o módulo (modules/duotone-icone/index.ts).
    Constant("versao") {
      1
    }

    /** O nome do ícone em uso (`nil` = o de sempre), ou `false` se o iOS não deixar trocar. */
    AsyncFunction("atual") { () -> IconeAtual in
      var atual = IconeAtual()
      atual.pode = UIApplication.shared.supportsAlternateIcons
      atual.nome = UIApplication.shared.alternateIconName
      return atual
    }.runOnQueue(.main)

    /** Troca o ícone (`nil` = o de sempre). Rejeita se o iOS recusar. */
    AsyncFunction("mudar") { (nome: String?, promise: Promise) in
      guard UIApplication.shared.supportsAlternateIcons else {
        promise.reject("SEM_ICONES", "Este iPhone não troca o ícone.")
        return
      }
      if UIApplication.shared.alternateIconName == nome {
        promise.resolve(true)
        return
      }
      UIApplication.shared.setAlternateIconName(nome) { erro in
        if let erro {
          promise.reject("ICONE", erro.localizedDescription)
        } else {
          promise.resolve(true)
        }
      }
    }.runOnQueue(.main)
  }
}

/** O ícone em uso: se o iOS deixa trocar, e o nome (`nil` = o de sempre). */
struct IconeAtual: Record {
  @Field var pode: Bool = false
  @Field var nome: String? = nil
}
