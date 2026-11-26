import ExpoModulesCore
import ObjectiveC
import UIKit

/**
 * Voltar a deslizar, a encolher para o cartão (26/11, item 7 do plano de melhorias).
 *
 * A pilha nativa (UINavigationController) tira da janela a página de trás depois de
 * empurrar a nova, e só a devolve durante uma transição. Para a página da frente
 * encolher com o dedo e deixar ver a de trás, é preciso um pop interativo. O
 * react-native-screens já o tem (`startScreenTransition` e `finishScreenTransition:`
 * da `RNSScreenStackView`, as das transições do Reanimated): com elas a pilha faz
 * o pop SEM animação própria (`animateWithNoAnimation`), a de trás fica por baixo
 * da da frente, e quem desenha é o JavaScript (`PaginaDoQuadrado`). A ponte deles
 * para o JavaScript (`RNScreensTurboModule`) só se compila com a bridge antiga, que
 * esta app não tem: daí este módulo, que as chama pelo runtime do Objective-C.
 *
 * Sem estes métodos (uma versão do react-native-screens que os mude), `comecar`
 * devolve `false` e o JavaScript encolhe na mesma, sem a página de trás.
 */
public class DuotoneVoltaModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneVolta")

    // Para o JavaScript saber que o binário tem a vista (modules/duotone-volta/index.ts).
    Constant("versao") {
      1
    }

    View(DuotoneVoltaView.self) {
      /** Começa o pop interativo da pilha desta página. `false` se não deu. */
      AsyncFunction("comecar") { (view: DuotoneVoltaView) -> Bool in
        return view.comecar()
      }.runOnQueue(.main)

      /** Acaba-o: `cancelada` deixa a página onde está, senão ela sai. */
      AsyncFunction("acabar") { (view: DuotoneVoltaView, cancelada: Bool) -> Bool in
        return view.acabar(cancelada: cancelada)
      }.runOnQueue(.main)
    }
  }
}

/**
 * Uma vista vazia dentro da página: dela chega-se à página (o view controller cujo
 * pai é a pilha) e à pilha (o delegado dela, a `RNSScreenStackView`).
 */
final class DuotoneVoltaView: ExpoView {
  private static let comecarSel = NSSelectorFromString("startScreenTransition")
  private static let acabarSel = NSSelectorFromString("finishScreenTransition:")

  /** A pilha com um pop interativo a meio, começado por esta vista. */
  private weak var pilha: NSObject?
  /** Se o JavaScript nunca disser como acabou, a página fica (ao fim de 10 s). */
  private var seguranca: DispatchWorkItem?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
  }

  func comecar() -> Bool {
    guard pilha == nil, window != nil else { return false }
    guard let par = paginaNaPilha() else { return false }
    let (pagina, nav) = par
    guard nav.topViewController === pagina,
          nav.viewControllers.count > 1,
          nav.transitionCoordinator == nil,
          let stack = pilhaDe(nav) else { return false }

    // A de trás sem resto de um recuo antigo (o mesmo que o RNSModule faz).
    nav.viewControllers[nav.viewControllers.count - 2].view.transform = .identity
    _ = stack.perform(Self.comecarSel)
    pilha = stack

    let item = DispatchWorkItem { [weak self] in _ = self?.acabar(cancelada: true) }
    seguranca = item
    DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: item)
    return true
  }

  func acabar(cancelada: Bool) -> Bool {
    seguranca?.cancel()
    seguranca = nil
    guard let stack = pilha else { return false }
    pilha = nil
    guard let metodo = class_getInstanceMethod(type(of: stack), Self.acabarSel) else { return false }
    typealias Acabar = @convention(c) (AnyObject, Selector, Bool) -> Void
    let f = unsafeBitCast(method_getImplementation(metodo), to: Acabar.self)
    f(stack, Self.acabarSel, cancelada)
    return true
  }

  /** O view controller desta página (o filho direto da pilha) e a pilha. */
  private func paginaNaPilha() -> (UIViewController, UINavigationController)? {
    var r: UIResponder? = next
    while let atual = r {
      if let vc = atual as? UIViewController, let nav = vc.parent as? UINavigationController {
        return (vc, nav)
      }
      r = atual.next
    }
    return nil
  }

  /** A `RNSScreenStackView` da pilha: é o delegado dela (e a vista onde ela vive). */
  private func pilhaDe(_ nav: UINavigationController) -> NSObject? {
    let serve = { (o: NSObject) in o.responds(to: Self.comecarSel) && o.responds(to: Self.acabarSel) }
    if let d = nav.delegate as? NSObject, serve(d) { return d }
    var v: UIView? = nav.view.superview
    while let atual = v {
      if serve(atual) { return atual }
      v = atual.superview
    }
    return nil
  }
}
