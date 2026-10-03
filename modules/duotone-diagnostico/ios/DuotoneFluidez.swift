import Foundation
import ObjectiveC
import QuartzCore

/**
 * Os 120 Hz das animações do React Native (3/10).
 *
 * O `Info.plist` tem o `CADisableMinimumFrameDurationOnPhone`, mas isso só
 * DEIXA passar dos 60 Hz: num iPhone, um `CADisplayLink` sem
 * `preferredFrameRateRange` fica nos 60. E é num desses que o React Native
 * corre todas as animações com `useNativeDriver` (o
 * `RCTNativeAnimatedNodesManager`, seletor `stepAnimations:`), sem pedir taxa
 * nenhuma -- por isso abrir o leitor, uma folha ou o EQ andava a 60 (João, 3/10).
 *
 * Troca-se o criador do relógio (`+displayLinkWithTarget:selector:`) e só se
 * mexe no das animações. A taxa alta é PEDIDA pelo JavaScript
 * (`src/state/fluidez.ts`) durante as transições e os gestos: com ela sempre
 * ligada, as animações que não param (a capa a flutuar, a barra a avançar)
 * passavam a gastar o dobro, com o telemóvel já a aquecer. Em repouso, o
 * relógio fica como estava.
 */
enum DuotoneFluidez {
  /** O relógio das animações em curso; o React Native cria outro quando volta a haver animações. */
  static weak var relogio: CADisplayLink?
  static var alta = false
  private static var instalado = false

  static func instalar() {
    guard !instalado else { return }
    instalado = true
    let original = NSSelectorFromString("displayLinkWithTarget:selector:")
    let nova = #selector(CADisplayLink.duotone_displayLink(withTarget:selector:))
    guard let m1 = class_getClassMethod(CADisplayLink.self, original),
          let m2 = class_getClassMethod(CADisplayLink.self, nova) else { return }
    method_exchangeImplementations(m1, m2)
  }

  static func aplicar(_ link: CADisplayLink) {
    if #available(iOS 15.0, *) {
      link.preferredFrameRateRange = alta
        ? CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
        : CAFrameRateRange.default
    }
  }

  /** Chamado na thread principal (é lá que o relógio vive). */
  static func definir(alta nova: Bool) {
    alta = nova
    if let link = relogio { aplicar(link) }
  }
}

extension CADisplayLink {
  /// Depois da troca, chamar este nome é chamar o ORIGINAL.
  @objc class func duotone_displayLink(withTarget target: Any, selector sel: Selector) -> CADisplayLink {
    let link = duotone_displayLink(withTarget: target, selector: sel)
    if NSStringFromSelector(sel) == "stepAnimations:" {
      DuotoneFluidez.relogio = link
      DuotoneFluidez.aplicar(link)
    }
    return link
  }
}
