import ActivityKit
import ExpoModulesCore
import Foundation

/**
 * A Live Activity do Duotone (26/11, item 8 do plano de melhorias, a opção B): um
 * segundo cartão no ecrã bloqueado, por baixo do do sistema, e a presença na Dynamic
 * Island, só quando há algo que o sistema não mostra (uma Jam, o temporizador, a
 * passagem do AutoMix). Quem decide o que mostrar é o JavaScript
 * (`src/hooks/useAtividadeAoVivo.ts`); aqui só se começa, atualiza e acaba.
 *
 * Sem App Group e sem pedidos: tudo vai no estado da atividade. Começar uma só se
 * pode com a app à frente (o iOS recusa com ela escondida); atualizar e acabar,
 * sempre. Por isso `mostrar` devolve `false` quando não deu, e o JavaScript sabe.
 */
public class DuotoneAtividadeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DuotoneAtividade")

    // Para o JavaScript saber que o binário tem o módulo (modules/duotone-atividade/index.ts).
    Constant("versao") {
      1
    }

    /** O iOS deixa (o utilizador pode desligar as Live Activities da app nas Definições). */
    Function("permitida") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /** Começa a atividade, ou atualiza a que já há. `false` se não houve como. */
    // O pod é do iOS 16.4, como a app: o ActivityContent (16.2) está sempre lá.
    AsyncFunction("mostrar") { (estado: EstadoDaAtividade) async -> Bool in
      let conteudo = ActivityContent(state: estado.paraOEstado(), staleDate: estado.velhaEm())
      let abertas = Activity<DuotoneAtividadeAttributes>.activities
      if let atual = abertas.first {
        await atual.update(conteudo)
        // Uma que ficou de uma vez anterior (a app fechada à bruta) sai.
        for outra in abertas.dropFirst() { await outra.end(nil, dismissalPolicy: .immediate) }
        return true
      }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
      do {
        _ = try Activity.request(
          attributes: DuotoneAtividadeAttributes(nome: "Duotone"),
          content: conteudo,
          pushType: nil
        )
        return true
      } catch {
        return false
      }
    }

    /** Acaba todas as atividades do Duotone, já. */
    AsyncFunction("acabar") { () async in
      for atividade in Activity<DuotoneAtividadeAttributes>.activities {
        await atividade.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}

/** O estado como chega do JavaScript (`EstadoDaAtividade` em src/lib/atividadeAoVivo.ts). */
struct EstadoDaAtividade: Record {
  @Field var jamTitulo: String?
  @Field var jamLinha: String?
  @Field var jamOuvintes: String?
  @Field var jamCaras: [String] = []
  @Field var temporizadorTitulo: String?
  @Field var temporizadorLinha: String?
  @Field var temporizadorInicio: Double?
  @Field var temporizadorFim: Double?
  @Field var misturaTitulo: String?
  @Field var misturaLinha: String?
  @Field var misturaCurta: String?
  @Field var misturaCores: [String] = []
  /** Quando o que se mostra deixa de ser verdade (segundos desde 1970): o fim do temporizador ou da passagem. */
  @Field var velhaEmS: Double?

  func paraOEstado() -> DuotoneAtividadeAttributes.ContentState {
    DuotoneAtividadeAttributes.ContentState(
      jamTitulo: jamTitulo, jamLinha: jamLinha, jamOuvintes: jamOuvintes, jamCaras: jamCaras,
      temporizadorTitulo: temporizadorTitulo, temporizadorLinha: temporizadorLinha,
      temporizadorInicio: temporizadorInicio, temporizadorFim: temporizadorFim,
      misturaTitulo: misturaTitulo, misturaLinha: misturaLinha, misturaCurta: misturaCurta, misturaCores: misturaCores
    )
  }

  func velhaEm() -> Date? {
    guard let s = velhaEmS, s > 0 else { return nil }
    return Date(timeIntervalSince1970: s)
  }
}
