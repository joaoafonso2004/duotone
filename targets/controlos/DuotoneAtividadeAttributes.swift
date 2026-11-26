import ActivityKit
import Foundation

/**
 * O que a Live Activity do Duotone mostra (26/11, item 8 do plano, a opção B).
 *
 * IGUAL, campo a campo, a `modules/duotone-atividade/ios/DuotoneAtividadeAttributes.swift`: o
 * iOS liga a atividade que a app começa à vista do alvo pelo nome do tipo e pela
 * forma do estado. Sem App Group (o widget de 1/10 partiu aí): tudo o que a vista
 * desenha vem aqui dentro, já escrito pelo JavaScript (`src/lib/atividadeAoVivo.ts`),
 * na língua da app. As capas vão como cores, porque a extensão não lê os ficheiros
 * da app.
 */
struct DuotoneAtividadeAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /** A Jam: "Jam with Ana and Rui", "Rui added this song", "3 listening", e as caras ("A#c08a5a"). */
    var jamTitulo: String?
    var jamLinha: String?
    var jamOuvintes: String?
    var jamCaras: [String]
    /** O temporizador: o título, a linha, e o intervalo (segundos desde 1970). Sem fim = no fim da música. */
    var temporizadorTitulo: String?
    var temporizadorLinha: String?
    var temporizadorInicio: Double?
    var temporizadorFim: Double?
    /** A passagem do AutoMix: "Mixing into Low Orbit", "124 → 128 BPM · 8A → 9A", "124→128" e as duas cores. */
    var misturaTitulo: String?
    var misturaLinha: String?
    var misturaCurta: String?
    var misturaCores: [String]
  }

  /** Fixo: o nome que o iOS mostra nas definições das atividades. */
  var nome: String
}
