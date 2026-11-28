import ExpoModulesCore
import UIKit

/**
 * A barra de separadores do sistema (28/11, pedido do João com três capturas de
 * uma barra do iOS 26: parada, a segurar e a arrastar).
 *
 * A lente de vidro que se agarra e arrasta de separador para separador, com a
 * refração e as bordas de cor, é do UIKit e não tem API pública: só a têm a
 * `UITabBar`, os segmented controls, os sliders e os switches. Uma imitação em
 * JavaScript não chega lá (a 7.3.0 tentou). Por isso a barra é a verdadeira: uma
 * `UITabBar` sozinha, sem `UITabBarController` (a app continua com o pager do
 * React Navigation, e o deslizar entre separadores fica). Sem controlador não há o
 * "encolher ao rolar", que é dele.
 *
 * O JavaScript dá os botões (`itens`), o escolhido (`escolhido`, -1 para nenhum:
 * o Social, que não tem botão), as cores e a opacidade; recebe `onEscolher` (o
 * botão carregado, também o que já estava escolhido: leva ao topo da página) e
 * `onAltura` (a altura da barra, com o fundo do ecrã incluído).
 */
public class DuotoneSeparadoresModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneSeparadores")

    // Para o JavaScript saber que o binário tem a barra (modules/duotone-separadores/index.ts).
    Constant("versao") {
      1
    }

    View(DuotoneSeparadoresView.self) {
      Events("onEscolher", "onAltura")

      Prop("itens") { (view: DuotoneSeparadoresView, itens: [ItemDoSeparador]) in
        view.definirItens(itens)
      }
      Prop("escolhido") { (view: DuotoneSeparadoresView, indice: Int) in
        view.definirEscolhido(indice)
      }
      Prop("comNomes") { (view: DuotoneSeparadoresView, comNomes: Bool) in
        view.definirComNomes(comNomes)
      }
      Prop("corEscolhida") { (view: DuotoneSeparadoresView, cor: UIColor?) in
        view.definirCorEscolhida(cor)
      }
      Prop("corOutros") { (view: DuotoneSeparadoresView, cor: UIColor?) in
        view.definirCorOutros(cor)
      }
      Prop("opacidade") { (view: DuotoneSeparadoresView, opacidade: Double) in
        view.definirOpacidade(opacidade)
      }
    }
  }
}

/** Um botão da barra: ver `ItemDoSeparador` em modules/duotone-separadores/index.ts. */
struct ItemDoSeparador: Record {
  @Field var titulo: String = ""
  @Field var simbolo: String = ""
  @Field var simboloEscolhido: String = ""
  @Field var ponto: Bool = false
}

final class DuotoneSeparadoresView: ExpoView, UITabBarDelegate, UIGestureRecognizerDelegate {
  let onEscolher = EventDispatcher()
  let onAltura = EventDispatcher()

  private let barra = UITabBar(frame: .zero)
  /**
   * A opacidade da Customise: um fundo escuro com a forma da cápsula, POR BAIXO da
   * barra. O vidro dela mostra-o, com o rebordo e a lente por cima.
   */
  private let fundo = UIView()

  private var itens: [ItemDoSeparador] = []
  private var comNomes = true
  private var escolhido = -1
  private var opacidade: CGFloat = 0
  /** Os botões que estão na barra (títulos, símbolos e nomes): só se refazem quando mudam. */
  private var formaDosBotoes = ""
  /**
   * O botão escolhido a levantar o dedo, antes do UIKit (-1: nenhum). No iOS 26 o
   * `didSelect` só chega quando a lente acaba de pousar; a página muda já no toque,
   * e o `didSelect` desse botão não se repete.
   */
  private var cedo = -1
  private var alturaAvisada: CGFloat = -1
  private var porAplicar = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    clipsToBounds = false

    fundo.isUserInteractionEnabled = false
    fundo.backgroundColor = UIColor(red: 6 / 255, green: 6 / 255, blue: 8 / 255, alpha: 1)
    fundo.alpha = 0
    fundo.isHidden = true
    fundo.layer.cornerCurve = .continuous
    addSubview(fundo)

    barra.delegate = self
    // A app é escura: a barra também, seja qual for o modo do iPhone.
    barra.overrideUserInterfaceStyle = .dark
    addSubview(barra)

    // Só para saber o botão quando o dedo levanta: não trava os gestos da barra.
    let toque = UILongPressGestureRecognizer(target: self, action: #selector(aoTocar(_:)))
    toque.minimumPressDuration = 0
    toque.allowableMovement = .greatestFiniteMagnitude
    toque.cancelsTouchesInView = false
    toque.delaysTouchesBegan = false
    toque.delaysTouchesEnded = false
    toque.delegate = self
    barra.addGestureRecognizer(toque)
  }

  // MARK: - As props (o React aplica-as uma a uma; a barra muda uma vez no fim)

  func definirItens(_ novos: [ItemDoSeparador]) { itens = novos; marcar() }
  func definirEscolhido(_ indice: Int) { escolhido = indice; marcar() }
  func definirComNomes(_ valor: Bool) { comNomes = valor; marcar() }
  func definirCorEscolhida(_ cor: UIColor?) { barra.tintColor = cor }
  func definirCorOutros(_ cor: UIColor?) { barra.unselectedItemTintColor = cor }
  func definirOpacidade(_ valor: Double) {
    opacidade = CGFloat(max(0, min(1, valor)))
    fundo.alpha = opacidade
    colocarFundo()
  }

  private func marcar() {
    guard !porAplicar else { return }
    porAplicar = true
    DispatchQueue.main.async { [weak self] in self?.aplicar() }
  }

  private func aplicar() {
    porAplicar = false
    let forma = itens.map { "\($0.titulo)|\($0.simbolo)|\($0.simboloEscolhido)" }.joined(separator: "#") + "|\(comNomes)"
    if forma != formaDosBotoes {
      formaDosBotoes = forma
      let botoes = itens.enumerated().map { (i, item) -> UITabBarItem in
        let escolhida = item.simboloEscolhido.isEmpty ? item.simbolo : item.simboloEscolhido
        let botao = UITabBarItem(
          title: comNomes ? item.titulo : nil,
          image: UIImage(systemName: item.simbolo),
          selectedImage: UIImage(systemName: escolhida)
        )
        botao.tag = i
        // Também sem nomes: é por ele que o VoiceOver o lê e que o toque o encontra.
        botao.accessibilityLabel = item.titulo
        return botao
      }
      barra.setItems(botoes, animated: false)
      cedo = -1
    }
    // O ponto das mensagens por ler, sem refazer os botões.
    for (i, botao) in (barra.items ?? []).enumerated() where i < itens.count {
      let ponto = itens[i].ponto
      if ponto && botao.badgeValue == nil {
        botao.badgeValue = ""
        botao.badgeColor = UIColor(red: 1, green: 69 / 255, blue: 58 / 255, alpha: 1)
      } else if !ponto && botao.badgeValue != nil {
        botao.badgeValue = nil
      }
    }
    escolher()
    setNeedsLayout()
  }

  /** Põe na barra o escolhido do JavaScript (o pager a deslizar, ou um toque). */
  private func escolher() {
    guard let botoes = barra.items else { return }
    if escolhido >= 0 && escolhido < botoes.count {
      // A lente ainda a pousar neste: o UIKit escolhe-o no fim, e mexer-lhe agora cortava a animação.
      if escolhido == cedo { return }
      if barra.selectedItem !== botoes[escolhido] { barra.selectedItem = botoes[escolhido] }
    } else if barra.selectedItem != nil {
      barra.selectedItem = nil
    }
  }

  // MARK: - Os toques

  @objc private func aoTocar(_ gesto: UILongPressGestureRecognizer) {
    guard gesto.state == .ended, let i = botaoEm(gesto.location(in: barra)) else { return }
    cedo = i
    onEscolher(["indice": i])
    // Se o UIKit não chegar a escolher este (a lente largada noutro sítio), larga-se.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
      guard let self, self.cedo == i else { return }
      self.cedo = -1
      self.escolher()
    }
  }

  func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
    let jaAvisado = cedo
    cedo = -1
    if item.tag == jaAvisado { return }
    onEscolher(["indice": item.tag])
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                         shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    true
  }

  /** O botão debaixo do dedo: a vista da barra com o nome dele (os nomes são únicos). */
  private func botaoEm(_ ponto: CGPoint) -> Int? {
    guard barra.bounds.contains(ponto) else { return nil }
    var achado: Int?
    func procurar(_ vista: UIView) {
      for filha in vista.subviews where achado == nil {
        if let nome = filha.accessibilityLabel, !nome.isEmpty,
           let i = itens.firstIndex(where: { $0.titulo == nome }),
           filha.convert(filha.bounds, to: barra).contains(ponto) {
          achado = i
          return
        }
        procurar(filha)
      }
    }
    procurar(barra)
    return achado
  }

  /** O que não é a barra deixa passar o toque para a página por baixo. */
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let vista = super.hitTest(point, with: event)
    return vista === self ? nil : vista
  }

  // MARK: - O tamanho

  override func layoutSubviews() {
    super.layoutSubviews()
    // A barra sabe a altura dela, com o fundo do ecrã (o indicador de casa) incluído.
    let cabe = barra.sizeThatFits(bounds.size)
    barra.frame = CGRect(x: 0, y: bounds.height - cabe.height, width: bounds.width, height: cabe.height)
    barra.layoutIfNeeded()
    if abs(cabe.height - alturaAvisada) > 0.5 {
      alturaAvisada = cabe.height
      onAltura(["altura": Double(cabe.height)])
    }
    colocarFundo()
    // A cápsula do vidro arruma-se dentro da barra depois disto: volta-se a medir.
    DispatchQueue.main.async { [weak self] in self?.colocarFundo() }
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsLayout()
  }

  /**
   * O fundo da opacidade na forma da cápsula da barra: a maior vista de efeito lá
   * dentro (a cápsula de vidro; a lente é mais pequena). Sem ela, não há fundo.
   */
  private func colocarFundo() {
    guard opacidade > 0, let capsula = maiorVidro(em: barra) else {
      fundo.isHidden = true
      return
    }
    let r = capsula.convert(capsula.bounds, to: self)
    guard r.width > 0, r.height > 0 else {
      fundo.isHidden = true
      return
    }
    fundo.isHidden = false
    fundo.frame = r
    fundo.layer.cornerRadius = min(r.width, r.height) / 2
  }

  private func maiorVidro(em raiz: UIView) -> UIView? {
    var melhor: UIView?
    var area: CGFloat = 0
    func procurar(_ vista: UIView) {
      for filha in vista.subviews {
        if filha is UIVisualEffectView {
          let a = filha.bounds.width * filha.bounds.height
          if a > area {
            area = a
            melhor = filha
          }
        }
        procurar(filha)
      }
    }
    procurar(raiz)
    return melhor
  }
}
