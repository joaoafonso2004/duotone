import ActivityKit
import SwiftUI
import WidgetKit

/**
 * A Live Activity do Duotone (26/11, item 8 do plano de melhorias, a opção B da
 * maquete `docs/live-activity-maquete.html` e `docs/maquetes-da-lista-2026-11-25.html#m8`).
 *
 * O cartão do sistema fica como é. Este é o segundo, por baixo dele, e a presença na
 * Dynamic Island, só quando há algo que o sistema não mostra: a Jam (quem ouve, quem
 * juntou a música), o temporizador (a contagem desenhada pelo próprio iOS, sem gastar
 * bateria) e a passagem do AutoMix (as duas capas em eclipse, pelas cores delas).
 *
 * Não lê nada da app: tudo vem no estado (`DuotoneAtividadeAttributes`), já escrito e
 * traduzido pelo JavaScript. Tocar abre a app.
 */
struct AtividadeDoDuotone: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DuotoneAtividadeAttributes.self) { contexto in
      CartaoDoDuotone(estado: contexto.state)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .activityBackgroundTint(Color(red: 0.11, green: 0.11, blue: 0.13).opacity(0.78))
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: "duotone://"))
    } dynamicIsland: { contexto in
      let estado = contexto.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          IconeDoMomento(estado: estado).padding(.leading, 2)
        }
        DynamicIslandExpandedRegion(.trailing) {
          DireitaDoMomento(estado: estado, grande: true).padding(.trailing, 2)
        }
        DynamicIslandExpandedRegion(.center) {
          TextosDoMomento(estado: estado)
        }
      } compactLeading: {
        SimboloDoDuotone(lado: 16)
      } compactTrailing: {
        DireitaDoMomento(estado: estado, grande: false)
      } minimal: {
        SimboloDoDuotone(lado: 16)
      }
      .widgetURL(URL(string: "duotone://"))
    }
  }
}

// MARK: - O cartão do ecrã bloqueado

/** Uma linha por cada coisa que há: a passagem primeiro, depois o temporizador e a Jam. */
private struct CartaoDoDuotone: View {
  let estado: DuotoneAtividadeAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let titulo = estado.misturaTitulo {
        HStack(spacing: 10) {
          EclipseDasCapas(cores: estado.misturaCores, lado: 34)
          Textos(titulo: titulo, linha: estado.misturaLinha)
          Spacer(minLength: 0)
        }
      }
      if let titulo = estado.temporizadorTitulo {
        HStack(spacing: 12) {
          AnelDoTemporizador(estado: estado, lado: 36)
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
              Text(titulo).font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
              if let intervalo = intervaloDoTemporizador(estado) {
                Text(timerInterval: intervalo, countsDown: true)
                  .font(.system(size: 13.5, weight: .semibold)).monospacedDigit()
              }
            }
            if let linha = estado.temporizadorLinha {
              Text(linha).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
            }
          }
          Spacer(minLength: 0)
        }
      }
      if let titulo = estado.jamTitulo {
        HStack(spacing: 10) {
          CarasDaJam(caras: estado.jamCaras, lado: 26)
          Textos(titulo: titulo, linha: estado.jamLinha)
          Spacer(minLength: 0)
          if let ouvintes = estado.jamOuvintes {
            Text(ouvintes).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.7))
          }
        }
      }
    }
    .foregroundStyle(.white)
  }
}

private struct Textos: View {
  let titulo: String
  let linha: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(titulo).font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
      if let linha {
        Text(linha).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
      }
    }
  }
}

// MARK: - A Dynamic Island

/** O que manda na ilha: a passagem (dura segundos), o temporizador, a Jam. */
private enum Momento { case mistura, temporizador, jam, nada }

private func momento(_ e: DuotoneAtividadeAttributes.ContentState) -> Momento {
  if e.misturaTitulo != nil { return .mistura }
  if e.temporizadorTitulo != nil { return .temporizador }
  if e.jamTitulo != nil { return .jam }
  return .nada
}

private struct IconeDoMomento: View {
  let estado: DuotoneAtividadeAttributes.ContentState

  var body: some View {
    switch momento(estado) {
    case .mistura: EclipseDasCapas(cores: estado.misturaCores, lado: 30)
    case .temporizador: AnelDoTemporizador(estado: estado, lado: 30)
    case .jam: CarasDaJam(caras: estado.jamCaras, lado: 24)
    case .nada: SimboloDoDuotone(lado: 24)
    }
  }
}

private struct TextosDoMomento: View {
  let estado: DuotoneAtividadeAttributes.ContentState

  var body: some View {
    Group {
      switch momento(estado) {
      case .mistura: Textos(titulo: estado.misturaTitulo ?? "", linha: estado.misturaLinha)
      case .temporizador: Textos(titulo: estado.temporizadorTitulo ?? "", linha: estado.temporizadorLinha)
      case .jam: Textos(titulo: estado.jamTitulo ?? "", linha: estado.jamLinha)
      case .nada: EmptyView()
      }
    }
    .foregroundStyle(.white)
  }
}

/** À direita: os BPM da passagem, a contagem do temporizador, ou as caras da Jam. */
private struct DireitaDoMomento: View {
  let estado: DuotoneAtividadeAttributes.ContentState
  let grande: Bool

  var body: some View {
    switch momento(estado) {
    case .mistura:
      Text(estado.misturaCurta ?? "")
        .font(.system(size: grande ? 13 : 12, weight: .semibold)).monospacedDigit()
        .foregroundStyle(.white)
    case .temporizador:
      if let intervalo = intervaloDoTemporizador(estado) {
        Text(timerInterval: intervalo, countsDown: true)
          .font(.system(size: grande ? 22 : 12, weight: grande ? .light : .semibold)).monospacedDigit()
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: grande ? 90 : 44)
          .foregroundStyle(.white)
      } else {
        Image(systemName: "moon.zzz.fill").foregroundStyle(.white)
      }
    case .jam:
      if grande, let ouvintes = estado.jamOuvintes {
        Text(ouvintes).font(.system(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.7))
      } else {
        CarasDaJam(caras: Array(estado.jamCaras.prefix(2)), lado: 16)
      }
    case .nada:
      EmptyView()
    }
  }
}

// MARK: - As peças

private func intervaloDoTemporizador(_ e: DuotoneAtividadeAttributes.ContentState) -> ClosedRange<Date>? {
  guard let fim = e.temporizadorFim else { return nil }
  let fimEm = Date(timeIntervalSince1970: fim)
  let inicioEm = Date(timeIntervalSince1970: min(e.temporizadorInicio ?? fim, fim))
  return inicioEm...fimEm
}

/** O anel que se esvazia até ao fim do temporizador (o iOS desenha-o, sem a app). */
private struct AnelDoTemporizador: View {
  let estado: DuotoneAtividadeAttributes.ContentState
  let lado: CGFloat

  var body: some View {
    if let intervalo = intervaloDoTemporizador(estado) {
      ProgressView(timerInterval: intervalo, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
        .progressViewStyle(.circular)
        .tint(.white)
        .frame(width: lado, height: lado)
    } else {
      Image(systemName: "moon.zzz.fill")
        .font(.system(size: lado * 0.5))
        .foregroundStyle(.white)
        .frame(width: lado, height: lado)
    }
  }
}

/** As duas capas em eclipse, pelas cores delas: a que sai atrás, a que entra à frente. */
private struct EclipseDasCapas: View {
  let cores: [String]
  let lado: CGFloat

  var body: some View {
    let sai = Color(hexDoDuotone: cores.first) ?? Color(white: 0.3)
    let entra = Color(hexDoDuotone: cores.dropFirst().first) ?? Color(white: 0.55)
    ZStack {
      Circle().fill(sai).frame(width: lado * 0.78, height: lado * 0.78).offset(x: -lado * 0.14)
      Circle().fill(entra).frame(width: lado * 0.78, height: lado * 0.78).offset(x: lado * 0.14)
        .overlay(Circle().stroke(Color.black.opacity(0.35), lineWidth: 1).frame(width: lado * 0.78, height: lado * 0.78).offset(x: lado * 0.14))
    }
    .frame(width: lado, height: lado)
  }
}

/** As caras da Jam: a inicial num círculo da cor da pessoa ("A#c08a5a"), umas por cima das outras. */
private struct CarasDaJam: View {
  let caras: [String]
  let lado: CGFloat

  var body: some View {
    HStack(spacing: -lado * 0.32) {
      ForEach(Array(caras.prefix(3).enumerated()), id: \.offset) { _, cara in
        let partes = cara.split(separator: "#", maxSplits: 1).map(String.init)
        ZStack {
          Circle().fill(Color(hexDoDuotone: partes.count > 1 ? "#" + partes[1] : nil) ?? Color(white: 0.4))
          Text(partes.first ?? "").font(.system(size: lado * 0.46, weight: .semibold)).foregroundStyle(.white)
        }
        .frame(width: lado, height: lado)
        .overlay(Circle().stroke(Color.black.opacity(0.6), lineWidth: 1.5))
      }
    }
  }
}

/** O símbolo do Duotone: os dois discos, um claro e um escuro por cima. */
private struct SimboloDoDuotone: View {
  let lado: CGFloat

  var body: some View {
    ZStack {
      Circle().fill(Color(white: 0.82)).frame(width: lado * 0.8, height: lado * 0.8).offset(x: -lado * 0.1)
      Circle().fill(Color(white: 0.16)).frame(width: lado * 0.8, height: lado * 0.8).offset(x: lado * 0.1)
        .overlay(Circle().stroke(Color(white: 0.6), lineWidth: 0.8).frame(width: lado * 0.8, height: lado * 0.8).offset(x: lado * 0.1))
    }
    .frame(width: lado, height: lado)
  }
}

private extension Color {
  /** "#rrggbb"; `nil` se não for isso. */
  init?(hexDoDuotone texto: String?) {
    guard let texto, texto.hasPrefix("#"), texto.count == 7, let v = Int(texto.dropFirst(), radix: 16) else { return nil }
    self.init(
      red: Double((v >> 16) & 0xff) / 255,
      green: Double((v >> 8) & 0xff) / 255,
      blue: Double(v & 0xff) / 255
    )
  }
}
