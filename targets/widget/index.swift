import SwiftUI
import WidgetKit

/**
 * O widget do Duotone.
 *
 * Um widget de play/pause com a capa é o que toda a gente tem. Este mostra
 * duas coisas que mais nenhum mostra: a faixa tingida pela cor da própria
 * capa, e por baixo quem dos teus amigos está a ouvir o quê neste momento.
 *
 * Não toca em rede nenhuma. Tudo o que desenha veio do App Group, escrito
 * pela app -- um widget que faz pedidos seus gasta bateria de fundo e
 * duplicaria a sessão que a app já tem.
 */

struct Entrada: TimelineEntry {
  let date: Date
  let estado: EstadoDoWidget
}

struct Fornecedor: TimelineProvider {
  /// O que a galeria de widgets mostra antes de o adicionarem.
  func placeholder(in context: Context) -> Entrada {
    Entrada(date: Date(), estado: .vazio)
  }

  func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
    completion(Entrada(date: Date(), estado: EstadoDoWidget.lido()))
  }

  /**
   * Uma entrada só, sem futuro planeado.
   *
   * Não se inventam entradas para daqui a x minutos: o que o widget mostra
   * muda quando a app muda de música ou a presença dos amigos se actualiza, e
   * é a app que manda redesenhar nesse momento. Uma timeline a adivinhar
   * gastava bateria para mostrar o mesmo.
   *
   * O `.after` é só uma rede de segurança: ao fim de meia hora o widget relê
   * o App Group caso um pedido de redesenho se tenha perdido.
   */
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
    let agora = Date()
    completion(Timeline(
      entries: [Entrada(date: agora, estado: EstadoDoWidget.lido())],
      policy: .after(agora.addingTimeInterval(30 * 60))
    ))
  }
}

/// A faixa a tocar, ou o convite a tocar alguma coisa.
struct AFaixa: View {
  let estado: EstadoDoWidget
  var cor: Color { Color(hexadecimal: estado.cor) ?? STEEL }

  var body: some View {
    if let faixa = estado.faixa {
      VStack(alignment: .leading, spacing: 2) {
        Text("NOW PLAYING")
          .font(.system(size: 9, weight: .bold))
          .tracking(0.8)
          .foregroundStyle(cor)
        Text(faixa.titulo)
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
        Text(faixa.artista)
          .font(.system(size: 12))
          .foregroundStyle(.white.opacity(0.6))
          .lineLimit(1)
      }
    } else {
      VStack(alignment: .leading, spacing: 2) {
        Text("DUOTONE")
          .font(.system(size: 9, weight: .bold))
          .tracking(0.8)
          .foregroundStyle(STEEL)
        Text("Nothing playing")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.white.opacity(0.75))
      }
    }
  }
}

/// A capa vem do App Group; se não chegou, fica um fallback com identidade.
struct ACapa: View {
  let cor: Color

  var body: some View {
    Group {
      if let imagem = capaPartilhada() {
        Image(uiImage: imagem)
          .resizable()
          .scaledToFill()
      } else {
        ZStack {
          LinearGradient(
            colors: [cor.opacity(0.42), FUNDO],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
          Image(systemName: "waveform")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white.opacity(0.8))
        }
      }
    }
    .frame(width: 48, height: 48)
    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

/// Quem está a ouvir o quê. É a parte que mais nenhum widget tem.
struct OsAmigos: View {
  let amigos: [AmigoAOuvir]
  let cor: Color

  var body: some View {
    if amigos.isEmpty {
      Text("No friends listening right now")
        .font(.system(size: 11))
        .foregroundStyle(.white.opacity(0.4))
        .lineLimit(1)
    } else {
      VStack(alignment: .leading, spacing: 5) {
        ForEach(amigos) { amigo in
          // Tocar num amigo abre a conversa dele. O `scheme` é o mesmo que a
          // app declara no app.json.
          Link(destination: conversa(amigo.id)) {
            HStack(spacing: 6) {
              Circle().fill(cor).frame(width: 5, height: 5)
              Text(amigo.nome)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
              Text(amigo.titulo)
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.5))
                .lineLimit(1)
            }
          }
        }
      }
    }
  }

  private func conversa(_ id: String) -> URL {
    var partes = URLComponents()
    partes.scheme = "duotone"
    partes.host = "social"
    partes.queryItems = [URLQueryItem(name: "openChatWithFriendId", value: id)]
    return partes.url!
  }
}

struct VistaDoWidget: View {
  var entrada: Entrada
  var cor: Color { Color(hexadecimal: entrada.estado.cor) ?? STEEL }

  private var conteudo: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(spacing: 10) {
        ACapa(cor: cor)
        AFaixa(estado: entrada.estado)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      Divider().overlay(cor.opacity(0.25))
      OsAmigos(amigos: entrada.estado.amigos, cor: cor)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var fundo: some View {
    // O tom da capa não pinta o fundo, tinge-o: por cima do preto da app,
    // com pouca opacidade. Um widget inteiro da cor da capa competia com o
    // resto do ecrã inicial e deixava de se ler.
    ZStack {
      FUNDO
      LinearGradient(
        colors: [cor.opacity(0.22), .clear],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    }
  }

  @ViewBuilder
  var body: some View {
    if #available(iOSApplicationExtension 17.0, *) {
      conteudo.containerBackground(for: .widget) {
        fundo
      }
    } else {
      // `containerBackground` só existe no iOS 17. O fundo clássico mantém o
      // widget funcional no iOS 16.4, que é o alvo mínimo desta extensão.
      conteudo.background(fundo)
    }
  }
}

struct DuotoneWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "DuotoneWidget", provider: Fornecedor()) { entrada in
      VistaDoWidget(entrada: entrada)
    }
    .configurationDisplayName("Duotone")
    .description("What you're playing, and what your friends are listening to.")
    .supportedFamilies([.systemMedium])
  }
}

@main
struct DuotoneWidgetBundle: WidgetBundle {
  var body: some Widget {
    DuotoneWidget()
  }
}
