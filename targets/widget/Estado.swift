import SwiftUI
import UIKit

/**
 * O lado do widget do contrato com a app.
 *
 * Espelha o `EstadoDoWidget` do `modules/duotone-widget/index.ts`. Não há
 * compilador que ligue os dois: se um mudar sem o outro, isto falha a
 * descodificar e o widget mostra o estado vazio -- que é feio, mas é melhor do
 * que rebentar no ecrã inicial de alguém.
 */

struct AmigoAOuvir: Codable, Identifiable {
  let id: String
  let nome: String
  let titulo: String
  let artista: String
}

struct FaixaDoWidget: Codable {
  let titulo: String
  let artista: String
  let capa: String?
}

struct EstadoDoWidget: Codable {
  let faixa: FaixaDoWidget?
  let cor: String?
  let amigos: [AmigoAOuvir]
  let quando: Double

  static let vazio = EstadoDoWidget(faixa: nil, cor: nil, amigos: [], quando: 0)

  /// O que a app deixou no App Group, ou o estado vazio.
  ///
  /// Nada aqui lança: um widget que rebenta é um widget que o iOS deixa de
  /// mostrar, e sem app aberta ninguém percebe porquê.
  static func lido() -> EstadoDoWidget {
    guard
      let defaults = UserDefaults(suiteName: "group.com.joao.duotone"),
      let json = defaults.string(forKey: "duotone.estado"),
      let dados = json.data(using: .utf8),
      let estado = try? JSONDecoder().decode(EstadoDoWidget.self, from: dados)
    else { return .vazio }
    return estado
  }
}

extension Color {
  /// Lê "#RRGGBB". Devolve nil para o que não perceber, e aí manda o steel.
  init?(hexadecimal: String?) {
    guard var texto = hexadecimal else { return nil }
    if texto.hasPrefix("#") { texto.removeFirst() }
    guard texto.count == 6, let valor = Int(texto, radix: 16) else { return nil }
    self.init(
      .sRGB,
      red: Double((valor >> 16) & 0xFF) / 255,
      green: Double((valor >> 8) & 0xFF) / 255,
      blue: Double(valor & 0xFF) / 255
    )
  }
}

/// O metal do símbolo. É o recurso quando a capa não tem cor para dar.
let STEEL = Color(red: 233.0 / 255, green: 234.0 / 255, blue: 238.0 / 255)
/// O fundo da app, para o widget não parecer de outra aplicação.
let FUNDO = Color(red: 10.0 / 255, green: 10.0 / 255, blue: 15.0 / 255)

/// A capa já reduzida que a app deixou no App Group. O widget não faz rede.
func capaPartilhada() -> UIImage? {
  guard
    let pasta = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "group.com.joao.duotone"
    ),
    let imagem = UIImage(contentsOfFile: pasta.appendingPathComponent("duotone-capa.jpg").path)
  else { return nil }
  return imagem
}
