// Compila os corpos reais de Swift com KVO Foundation e um transporte de teste.
// Confirma escritas, pausa e estados intermédios; não mede áudio num iPhone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { patchSpeedSetter } = require('../plugins/velocidade-expo-video.js');
const ler = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function bloco(fonte, marcador) {
  const inicio = fonte.indexOf(marcador);
  assert.ok(inicio >= 0, 'Swift mudou: ' + marcador);
  const abre = fonte.indexOf('{', inicio);
  let nivel = 0;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === '{') nivel++;
    if (fonte[i] === '}' && --nivel === 0) return fonte.slice(inicio, i + 1);
  }
  throw Error('Bloco Swift incompleto: ' + marcador);
}
const nativo = ler('modules/duotone-audio/ios/DuotoneAudioModule.swift');
const expo = patchSpeedSetter(ler('node_modules/expo-video/ios/VideoPlayer.swift'));
const aplicar = bloco(nativo, 'Function("aplicarVelocidade")');
const corpoAplicar = aplicar.slice(aplicar.indexOf(' -> Bool in') + ' -> Bool in'.length, -1);
const fixture = String.raw`
import Foundation
@objc enum Estado: Int { case paused, waitingToPlayAtSpecifiedRate, playing }
enum EstadoDoItem { case readyToPlay }
final class Item { var status = EstadoDoItem.readyToPlay; var isPlaybackBufferEmpty = false }
final class AVPlayer: NSObject {
  @objc dynamic var rate: Float = 1 { didSet { escritas += 1 } }
  @objc dynamic var timeControlStatus = Estado.playing
  var defaultRate: Float = 1
  var automaticallyWaitsToMinimizeStalling = true
  var currentItem: Item? = Item()
  var escritas = 0
  var simularEspera = false
  var desvioFloat: Float = 0
  func playImmediately(atRate nova: Float) {
    rate = nova + desvioFloat
    if simularEspera { timeControlStatus = .waitingToPlayAtSpecifiedRate }
  }
}
struct SharedRef<T> { let ref: T }
struct PlaybackRateChangedEventPayload { let playbackRate: Float; let oldPlaybackRate: Float }
final class Expo {
  let ref: AVPlayer
  var vigia: NSKeyValueObservation?
  init(_ p: AVPlayer) {
    ref = p
    vigia = p.observe(.rate, options: [.new, .old]) { [weak self] p, c in
      if let r = c.newValue, c.oldValue != r { self?.onRateChanged(player: p, oldRate: c.oldValue, newRate: r) }
    }
  }
  func safeEmit(event: String, payload: PlaybackRateChangedEventPayload) {}
  __SETTER__
  __KVO__
}
final class Nativo {
  private var esperasSuspensas: [ObjectIdentifier: NSKeyValueObservation] = [:]
  private let cadeadoDaVelocidade = NSLock()
  __SEM_ESPERAR__
  __REPOR__
  func aplicarVelocidade(_ referencia: SharedRef<AVPlayer>, velocidade: Double) -> Bool { __APLICAR__ }
}
func verificar(_ condicao: @autoclosure () -> Bool, _ nome: String) {
  if !condicao() { fatalError(nome) }
}
for comEspera in [false, true] {
 for desvio: Float in [0, 0.0000001] {
  let p = AVPlayer(), expo = Expo(p), nativo = Nativo()
  p.simularEspera = comEspera
  p.desvioFloat = desvio
  for v in [0.8, 1.25, 0.7, 2.0, 1.0] {
    p.timeControlStatus = .playing
    let antes = p.escritas
    verificar(nativo.aplicarVelocidade(SharedRef(ref: p), velocidade: v), "aplicação recusada")
    verificar(p.escritas == antes + 1, "mais de uma escrita por mudança: nativo + KVO")
    verificar(abs(p.rate - Float(v)) < 0.001 && abs(expo.playbackRate - Float(v)) < 0.001, "Expo e AVPlayer divergiram")
    verificar(!p.automaticallyWaitsToMinimizeStalling, "espera temporária voltou a ligar buffering")
    let igual = p.escritas
    verificar(nativo.aplicarVelocidade(SharedRef(ref: p), velocidade: v), "mesma taxa recusada")
    verificar(p.escritas == igual, "mesmo valor voltou a escrever a taxa")
  }
  p.rate = 0; p.timeControlStatus = .paused
  verificar(p.automaticallyWaitsToMinimizeStalling, "pausa não repôs a política do buffer")
  let antes = p.escritas
  verificar(nativo.aplicarVelocidade(SharedRef(ref: p), velocidade: 0.6), "taxa em pausa recusada")
  verificar(p.rate == 0 && p.escritas == antes, "mudar a velocidade retirou a pausa")
  verificar(p.defaultRate == 0.6, "velocidade escolhida em pausa não ficou preparada")
  p.rate = p.defaultRate; p.timeControlStatus = .playing
  verificar(expo.playbackRate == 0.6, "retoma não sincronizou a taxa do Expo")
  _ = nativo.aplicarVelocidade(SharedRef(ref: p), velocidade: 1.1)
  p.rate = 0; p.timeControlStatus = .paused
  verificar(p.rate == 0, "a pausa depois da mudança voltou a dar play")
 }
}
let externo = AVPlayer(), nativo = Nativo()
externo.automaticallyWaitsToMinimizeStalling = false
_ = nativo.aplicarVelocidade(SharedRef(ref: externo), velocidade: 0.8)
externo.rate = 0; externo.timeControlStatus = .paused
verificar(!externo.automaticallyWaitsToMinimizeStalling, "mudou uma política de buffering de outro dono")
print("Swift nativo: uma escrita por mudança, KVO sincronizado, esperas transitórias e pausa/retoma passaram.")
`
  .replace('__SETTER__', bloco(expo, 'var playbackRate: Float = 1.0'))
  .replace('__KVO__', bloco(expo, 'func onRateChanged('))
  .replace('__SEM_ESPERAR__', bloco(nativo, 'private func semEsperar('))
  .replace('__REPOR__', bloco(nativo, 'private func reporEspera('))
  .replace('__APLICAR__', corpoAplicar);
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'duotone-speed-'));
const fonte = path.join(pasta, 'velocidade.swift'), binario = path.join(pasta, 'velocidade');
fs.writeFileSync(fonte, fixture);
if (process.argv.includes('--generate-only')) { console.log(fonte); process.exit(0); }
assert.equal(process.platform, 'darwin', 'Este teste usa o KVO do macOS e corre na CI iOS');
const compilado = spawnSync('swiftc', ['-swift-version', '5', fonte, '-o', binario], { stdio: 'inherit' });
assert.equal(compilado.status, 0, 'O teste Swift não compilou');
assert.equal(spawnSync(binario, [], { stdio: 'inherit' }).status, 0, 'O transporte nativo da velocidade falhou');
