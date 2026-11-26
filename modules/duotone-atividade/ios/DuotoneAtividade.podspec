Pod::Spec.new do |s|
  s.name           = 'DuotoneAtividade'
  s.version        = '1.0.0'
  s.summary        = 'A Live Activity do Duotone (Jam, temporizador, AutoMix)'
  s.description    = 'Começa, atualiza e acaba a Live Activity do Duotone pelo ActivityKit, sem App Group nem pedidos à rede.'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.weak_frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
