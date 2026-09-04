import ExpoModulesCore
import Foundation
import UIKit
import WidgetKit

/**
 * O estado que o widget lê.
 *
 * Um widget não corre dentro da app: é outro processo, com outra caixa de
 * areia, e não vê nada do que a app tem. O único chão comum é o App Group --
 * e é por isso que ele existe aqui. A app escreve, o widget lê, e ninguém
 * chama ninguém.
 *
 * Escreve-se JSON e não campos soltos de propósito: a forma do que o widget
 * mostra vai mudar, e uma chave por campo obrigava a mexer nos dois lados de
 * cada vez. Assim o contrato é um só, e está descrito no `index.ts`.
 *
 * O `reloadTimelines` é o que faz a diferença entre um widget vivo e um que
 * só acorda de meia em meia hora. Chama-se depois de escrever, e não antes:
 * o WidgetKit vai ler imediatamente.
 */
public class DuotoneWidgetModule: Module {
  /// O mesmo identificador do `targets/widget/expo-target.config.js`. Se os
  /// dois divergirem, a app escreve num sítio e o widget lê noutro -- e o
  /// sintoma é um widget eternamente vazio, sem erro nenhum.
  private static let grupo = "group.com.joao.duotone"
  private static let chave = "duotone.estado"
  private static let chaveURLDaCapa = "duotone.capa.url"
  private static let nomeDaCapa = "duotone-capa.jpg"

  private static func pastaPartilhada() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: grupo)
  }

  private static func ficheiroDaCapa() -> URL? {
    pastaPartilhada()?.appendingPathComponent(nomeDaCapa)
  }

  private static func urlDaCapa(no json: String) -> URL? {
    guard
      let dados = json.data(using: .utf8),
      let raiz = try? JSONSerialization.jsonObject(with: dados) as? [String: Any],
      let faixa = raiz["faixa"] as? [String: Any],
      let texto = faixa["capa"] as? String,
      let url = URL(string: texto),
      ["http", "https", "file"].contains(url.scheme?.lowercased() ?? "")
    else { return nil }
    return url
  }

  private static func recortar(_ imagem: UIImage) -> Data? {
    // O widget nunca precisa da imagem de 1280 px. Guardar uma miniatura
    // quadrada reduz o App Group e o trabalho de descodificação do WidgetKit.
    let lado: CGFloat = 384
    guard imagem.size.width > 0, imagem.size.height > 0 else { return nil }
    let escala = max(lado / imagem.size.width, lado / imagem.size.height)
    let tamanho = CGSize(width: imagem.size.width * escala, height: imagem.size.height * escala)
    let origem = CGPoint(x: (lado - tamanho.width) / 2, y: (lado - tamanho.height) / 2)
    return UIGraphicsImageRenderer(size: CGSize(width: lado, height: lado)).jpegData(withCompressionQuality: 0.82) {
      _ in imagem.draw(in: CGRect(origin: origem, size: tamanho))
    }
  }

  private static func removerCapa(_ defaults: UserDefaults) {
    if let ficheiro = ficheiroDaCapa() {
      try? FileManager.default.removeItem(at: ficheiro)
    }
    defaults.removeObject(forKey: chaveURLDaCapa)
  }

  private static func descarregarCapa(_ url: URL, defaults: UserDefaults) {
    guard let destino = ficheiroDaCapa() else { return }
    let texto = url.absoluteString

    // A mesma capa já está no grupo: não há rede nem novo redesenho.
    if defaults.string(forKey: chaveURLDaCapa) == texto,
       FileManager.default.fileExists(atPath: destino.path) { return }

    removerCapa(defaults)

    let terminar: (Data?) -> Void = { dados in
      guard
        let dados,
        dados.count <= 12 * 1024 * 1024,
        let imagem = UIImage(data: dados),
        let jpeg = recortar(imagem),
        // Uma resposta lenta da capa anterior não pode substituir a actual.
        let actual = UserDefaults(suiteName: grupo)?.string(forKey: chave),
        urlDaCapa(no: actual ?? "")?.absoluteString == texto
      else { return }
      do {
        try jpeg.write(to: destino, options: .atomic)
        defaults.set(texto, forKey: chaveURLDaCapa)
        WidgetCenter.shared.reloadTimelines(ofKind: "DuotoneWidget")
      } catch {
        // Sem capa continua a haver título e amigos; não derrubar a app.
      }
    }

    if url.isFileURL {
      DispatchQueue.global(qos: .utility).async {
        terminar(try? Data(contentsOf: url, options: .mappedIfSafe))
      }
    } else {
      var pedido = URLRequest(url: url)
      pedido.cachePolicy = .returnCacheDataElseLoad
      pedido.timeoutInterval = 15
      URLSession.shared.dataTask(with: pedido) { dados, resposta, _ in
        let http = resposta as? HTTPURLResponse
        terminar(http == nil || (200..<300).contains(http!.statusCode) ? dados : nil)
      }.resume()
    }
  }

  public func definition() -> ModuleDefinition {
    Name("DuotoneWidget")

    /// Guarda o estado e pede ao WidgetKit para redesenhar.
    Function("escrever") { (json: String) in
      guard let defaults = UserDefaults(suiteName: DuotoneWidgetModule.grupo) else { return false }
      defaults.set(json, forKey: DuotoneWidgetModule.chave)
      if let capa = DuotoneWidgetModule.urlDaCapa(no: json) {
        DuotoneWidgetModule.descarregarCapa(capa, defaults: defaults)
      } else {
        DuotoneWidgetModule.removerCapa(defaults)
      }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: "DuotoneWidget")
      }
      return true
    }

    /// Apaga o estado -- ao sair da conta, o widget não pode continuar a
    /// mostrar o que a pessoa estava a ouvir.
    Function("limpar") {
      guard let defaults = UserDefaults(suiteName: DuotoneWidgetModule.grupo) else { return false }
      defaults.removeObject(forKey: DuotoneWidgetModule.chave)
      DuotoneWidgetModule.removerCapa(defaults)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: "DuotoneWidget")
      }
      return true
    }

    /// Diz se o App Group está mesmo acessível.
    ///
    /// Não é diagnóstico ocioso: se o perfil de assinatura/sideload não
    /// conservar o entitlement, o contentor partilhado não existe. Sem isto,
    /// a app parecia escrever e o widget ficava vazio sem ninguém saber porquê.
    Function("disponivel") { () -> Bool in
      DuotoneWidgetModule.pastaPartilhada() != nil
    }
  }
}
