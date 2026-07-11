import ExpoModulesCore
import MediaPlayer

/**
 * Comandos remotos de faixa (Lock Screen / Control Center / auscultadores).
 *
 * O expo-video publica o Now Playing e trata play/pause/seek, mas NÃO regista
 * nextTrackCommand/previousTrackCommand — para o iOS cada música é um item
 * isolado, não uma fila. Este módulo regista esses dois comandos no
 * MPRemoteCommandCenter e reencaminha-os para o JS (store do player), que
 * conhece a fila. Aditivo ao expo-video: não toca nos comandos que ele gere.
 */
public class DuotoneRemoteCommandsModule: Module {
  private var nextTarget: Any?
  private var prevTarget: Any?

  public func definition() -> ModuleDefinition {
    Name("DuotoneRemoteCommands")

    Events("onNextTrack", "onPreviousTrack")

    Function("setCommandsEnabled") { (next: Bool, previous: Bool) in
      DispatchQueue.main.async { [weak self] in
        self?.apply(next: next, previous: previous)
      }
    }

    OnDestroy {
      DispatchQueue.main.async { [weak self] in
        self?.apply(next: false, previous: false)
      }
    }
  }

  private func apply(next: Bool, previous: Bool) {
    let center = MPRemoteCommandCenter.shared()

    if let t = nextTarget {
      center.nextTrackCommand.removeTarget(t)
      nextTarget = nil
    }
    if let t = prevTarget {
      center.previousTrackCommand.removeTarget(t)
      prevTarget = nil
    }

    center.nextTrackCommand.isEnabled = next
    if next {
      nextTarget = center.nextTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onNextTrack")
        return .success
      }
    }

    center.previousTrackCommand.isEnabled = previous
    if previous {
      prevTarget = center.previousTrackCommand.addTarget { [weak self] _ in
        self?.sendEvent("onPreviousTrack")
        return .success
      }
    }
  }
}
