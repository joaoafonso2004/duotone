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
      Events("onEscolher", "onAltura", "onDiagnostico")

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
  /** Uma vez por arranque: como a barra está montada neste iPhone (para o João ler nos eventos). */
  let onDiagnostico = EventDispatcher()

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
  /** O vidro transparente que se pôs na cápsula da barra (UIGlassEffect no iOS 26). */
  private var efeitoLimpo: AnyObject?
  private var diagnosticoFeito = false

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
    if !diagnosticoFeito, window != nil, !(barra.items ?? []).isEmpty, bounds.width > 0 {
      diagnosticoFeito = true
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.mandarDiagnostico() }
    }
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsLayout()
  }

  /**
   * O vidro da cápsula e o escurecimento por trás dela (28/11, depois da 7.3.2: "a
   * opacidade não muda, continua baço").
   *
   * Baço porque era escuro: no iOS 26 o vidro em modo escuro sai cinzento e
   * lamacento no aparelho (um relato nos fóruns da Apple, reproduzido pela Apple), e
   * a app força o escuro. A cápsula passa ao vidro transparente (`clear`) em modo
   * claro, como as outras peças de vidro da app. O quanto se vê através é a
   * opacidade da Customise: um fundo escuro POR TRÁS da cápsula, a camada que a
   * Apple recomenda por baixo do vidro transparente. A barra em si (os nomes, os
   * ícones, a lente) fica no escuro.
   *
   * Sem desfocado por baixo (28/11, depois da 7.3.4): o material do sistema que lá
   * esteve desfocava muito e metia cinzento ("ainda assim não está transparente"). O
   * baço de antes era o "Reduzir transparência" do iPhone do João, que torna fosco
   * todo o vidro.
   */
  private func colocarFundo() {
    let capsula = acharCapsula()
    if let capsula { limparCapsula(capsula) }
    let moldura = capsula.map { $0.convert($0.bounds, to: self) } ?? molduraDosBotoes()
    guard opacidade > 0, let r = moldura, r.width > 0, r.height > 0 else {
      fundo.isHidden = true
      return
    }
    fundo.isHidden = false
    fundo.frame = r
    fundo.layer.cornerRadius = min(r.width, r.height) / 2
  }

  /**
   * A cápsula de vidro da barra: a maior vista de efeito lá dentro que não é o
   * fundo da barra inteira (mais baixa do que a barra e mais larga do que metade
   * dela; a lente é mais pequena).
   */
  private func acharCapsula() -> UIVisualEffectView? {
    let alto = barra.bounds.height
    let largo = barra.bounds.width
    guard alto > 0, largo > 0 else { return nil }
    var melhor: UIVisualEffectView?
    var area: CGFloat = 0
    func procurar(_ vista: UIView) {
      for filha in vista.subviews {
        if let efeito = filha as? UIVisualEffectView {
          let r = efeito.convert(efeito.bounds, to: barra)
          if r.height < alto - 1, r.width > largo / 2, r.width * r.height > area {
            area = r.width * r.height
            melhor = efeito
          }
        }
        procurar(filha)
      }
    }
    procurar(barra)
    return melhor
  }

  /** O vidro da cápsula: transparente e em modo claro. Só se troca vidro por vidro. */
  private func limparCapsula(_ capsula: UIVisualEffectView) {
    if capsula.overrideUserInterfaceStyle != .light { capsula.overrideUserInterfaceStyle = .light }
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      if capsula.effect is UIGlassEffect, capsula.effect !== efeitoLimpo {
        let limpo = UIGlassEffect(style: .clear)
        efeitoLimpo = limpo
        capsula.effect = limpo
      }
    }
    #endif
  }

  /** Sem cápsula à vista: o fundo na forma dos botões (os que têm o nome de um separador). */
  private func molduraDosBotoes() -> CGRect? {
    var uniao: CGRect?
    func procurar(_ vista: UIView) {
      for filha in vista.subviews {
        if filha is UIControl, let nome = filha.accessibilityLabel, itens.contains(where: { $0.titulo == nome }) {
          let r = filha.convert(filha.bounds, to: self)
          uniao = uniao.map { $0.union(r) } ?? r
        } else {
          procurar(filha)
        }
      }
    }
    procurar(barra)
    return uniao?.insetBy(dx: -5, dy: -5)
  }

  /**
   * As vistas da barra, com a classe, o efeito e o sítio de cada uma: o que o UIKit
   * monta muda de uma versão do iOS para a outra, e sem isto só se adivinha. Vai
   * uma vez por arranque para os eventos (`barra_do_sistema`, só os do João saem do
   * aparelho).
   */
  private func mandarDiagnostico() {
    var linhas: [String] = []
    func andar(_ vista: UIView, _ nivel: Int) {
      guard nivel <= 7, linhas.count < 80 else { return }
      let r = vista.convert(vista.bounds, to: barra)
      var nome = String(describing: type(of: vista))
      if let efeito = (vista as? UIVisualEffectView)?.effect { nome += "[" + String(describing: type(of: efeito)) + "]" }
      if vista.isHidden { nome += "(oculta)" }
      linhas.append("\(nivel):\(nome)@\(Int(r.minX)),\(Int(r.minY)),\(Int(r.width))x\(Int(r.height))")
      for filha in vista.subviews { andar(filha, nivel + 1) }
    }
    andar(barra, 0)
    let capsula = acharCapsula()
    onDiagnostico([
      "arvore": linhas.joined(separator: " "),
      "capsula": capsula.map { String(describing: type(of: $0)) } ?? "nenhuma",
      "limpa": capsula?.effect === efeitoLimpo && efeitoLimpo != nil,
      "altura": Double(barra.bounds.height),
    ])
  }
}
