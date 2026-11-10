import AppIntents
import SwiftUI
import WidgetKit

/**
 * Os botões do Duotone para o ecrã bloqueado e o Centro de Controlo (10/11,
 * pedido do João: "personalizar mais o locked screen").
 *
 * No iOS 18, ao editar o ecrã bloqueado, os dois botões de baixo (a lanterna e
 * a câmara) trocam-se por qualquer destes; também se juntam ao Centro de
 * Controlo. São os mesmos três das ações rápidas do ícone da app.
 *
 * Cada um só ABRE um link `duotone://controlo/…`: quem toca é a app, pelo mesmo
 * caminho das ações rápidas (`src/hooks/useAtalhosDoIcone.ts`). Não há App Group
 * nem dados partilhados -- o widget de 1/10 partiu exatamente aí.
 */
@main
struct ControlosDoDuotone: WidgetBundle {
  var body: some Widget {
    if #available(iOS 18.0, *) {
      ControloContinuar()
      ControloMisturaDoDia()
      ControloBaralharGostadas()
    }
  }
}

@available(iOS 18.0, *)
private func abrir(_ acao: String) -> OpenURLIntent {
  // O link é fixo e válido: se o URL falhasse, o botão abria só a app.
  OpenURLIntent(URL(string: "duotone://controlo/\(acao)") ?? URL(string: "duotone://")!)
}

@available(iOS 18.0, *)
struct ControloContinuar: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.joao.duotone.controlo.continuar") {
      ControlWidgetButton(action: abrir("continuar")) {
        Label("Resume", systemImage: "play.fill")
      }
    }
    .displayName("Resume")
    .description("Opens Duotone and plays where you left off.")
  }
}

@available(iOS 18.0, *)
struct ControloMisturaDoDia: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.joao.duotone.controlo.mistura-do-dia") {
      ControlWidgetButton(action: abrir("mistura-do-dia")) {
        Label("Daily mix", systemImage: "sparkles")
      }
    }
    .displayName("Daily mix")
    .description("Opens Duotone and plays today's mix.")
  }
}

@available(iOS 18.0, *)
struct ControloBaralharGostadas: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.joao.duotone.controlo.baralhar-gostadas") {
      ControlWidgetButton(action: abrir("baralhar-gostadas")) {
        Label("Shuffle Liked Songs", systemImage: "shuffle")
      }
    }
    .displayName("Shuffle Liked Songs")
    .description("Opens Duotone and shuffles your Liked Songs.")
  }
}
