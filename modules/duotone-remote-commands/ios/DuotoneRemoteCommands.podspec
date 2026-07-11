Pod::Spec.new do |s|
  s.name           = 'DuotoneRemoteCommands'
  s.version        = '1.0.0'
  s.summary        = 'Botoes de faixa seguinte/anterior no Lock Screen'
  s.description    = 'Regista next/previousTrackCommand no MPRemoteCommandCenter e emite eventos para o JS.'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
