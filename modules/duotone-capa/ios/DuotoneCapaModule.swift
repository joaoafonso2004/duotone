import ExpoModulesCore
import QuartzCore
import UIKit

/**
 * O "Recuo subtil" do skip no Core Animation (15/11).
 *
 * As animações do React Native, mesmo com `useNativeDriver`, avançam fotograma
 * a fotograma na thread principal da app. No skip essa thread tem trabalho (o
 * React a aplicar a faixa nova, o AVPlayer a trocar de item, o Now Playing), e
 * a caixa parava com ela: o "trava sempre" do João. Uma animação do Core
 * Animation, depois de entregue, corre no servidor de desenho do iOS e não
 * espera pela app.
 *
 * Os números chegam prontos do JavaScript (src/lib/recuoNoEcra.ts, com teste):
 * para cada instante, a escala e a deslocação da caixa inteira. Aqui só se
 * montam as matrizes e se entrega a animação.
 */
public class DuotoneCapaModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneCapa")

    // Para o JavaScript saber que o binário tem a vista (modules/duotone-capa/index.ts).
    Constant("versao") {
      1
    }

    // A primeira vista é a de omissão do módulo (o recuo); a sonda vai por nome.
    View(DuotoneRecuoView.self) {
      Prop("salto") { (view: DuotoneRecuoView, salto: SaltoDaCapa?) in
        view.aplicar(salto)
      }
    }

    /**
     * Onde a vista está NO ECRÃ (16/11). Dentro da fila, que é uma folha nativa,
     * o `measureInWindow` e o toque do React Native contam a partir do topo da
     * folha, e os menus (que abrem por cima de tudo) nasciam ~1000 px acima do
     * botão. O UIKit sabe a posição verdadeira.
     */
    View(DuotoneSondaView.self) {
      AsyncFunction("noEcra") { (view: DuotoneSondaView) -> [Double] in
        guard view.window != nil else { return [] }
        let r = view.convert(view.bounds, to: nil)
        return [Double(r.origin.x), Double(r.origin.y), Double(r.size.width), Double(r.size.height)]
      }.runOnQueue(.main)
    }
  }
}

/** Uma vista vazia que só existe para ser medida (ver `noEcra`). */
final class DuotoneSondaView: ExpoView {}

/** O pedido de um skip: ver `SaltoDaCapa` em src/lib/recuoNoEcra.ts. */
struct SaltoDaCapa: Record {
  @Field var id: Double = 0
  @Field var em: Double = 0
  @Field var duracaoMs: Double = 0
  @Field var tempos: [Double] = []
  @Field var escala: [Double] = []
  @Field var x: [Double] = []
  @Field var y: [Double] = []
  @Field var largar: [Double] = []
}

/**
 * A vista à volta do cubo da capa. Os filhos do React ficam dentro dela, e é a
 * camada dela que recua: a caixa inteira, face, laterais e verso.
 */
final class DuotoneRecuoView: ExpoView {
  private static let chave = "duotone.recuo"
  private var ultimo: Double = 0

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
  }

  /** Chamado na thread principal, quando o React aplica a faixa nova. */
  func aplicar(_ salto: SaltoDaCapa?) {
    guard let salto = salto, salto.id > 0, salto.id != ultimo else { return }
    ultimo = salto.id
    let n = salto.tempos.count
    guard n >= 2,
          salto.escala.count == n, salto.x.count == n, salto.y.count == n, salto.largar.count == n,
          salto.duracaoMs > 0 else { return }
    // Uma vista que só montou depois do skip já não o mostra.
    if salto.em > 0, Date().timeIntervalSince1970 * 1000 - salto.em > salto.duracaoMs { return }

    // Skips seguidos: a caixa parte de onde está agora, e o que sobrava do
    // recuo anterior sai durante a ida deste (o `largar`), sem saltar.
    var sobraEscala: CGFloat = 0
    var sobraX: CGFloat = 0
    var sobraY: CGFloat = 0
    if layer.animation(forKey: Self.chave) != nil, let atual = layer.presentation()?.transform {
      sobraEscala = atual.m11 - 1
      sobraX = atual.m41
      sobraY = atual.m42
    }

    var valores: [NSValue] = []
    valores.reserveCapacity(n)
    for i in 0..<n {
      let l = CGFloat(salto.largar[i])
      let escala = CGFloat(salto.escala[i]) + l * sobraEscala
      let x = CGFloat(salto.x[i]) + l * sobraX
      let y = CGFloat(salto.y[i]) + l * sobraY
      // Escala à volta do centro (a âncora da camada), e depois a deslocação.
      let matriz = CATransform3DScale(CATransform3DMakeTranslation(x, y, 0), escala, escala, 1)
      valores.append(NSValue(caTransform3D: matriz))
    }

    let animacao = CAKeyframeAnimation(keyPath: "transform")
    animacao.values = valores
    animacao.keyTimes = salto.tempos.map { NSNumber(value: $0) }
    animacao.duration = salto.duracaoMs / 1000
    animacao.calculationMode = .linear
    animacao.isRemovedOnCompletion = true
    if #available(iOS 15.0, *) {
      animacao.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
    }
    // A mesma chave substitui um recuo a meio: o novo já parte de onde ele ia.
    layer.add(animacao, forKey: Self.chave)
  }
}
