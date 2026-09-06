Pod::Spec.new do |s|
  s.name           = 'DuotoneIntents'
  s.version        = '1.0.0'
  s.summary        = 'Atalhos da Siri para o leitor'
  s.description    = 'App Intents de tocar/pausar/seguinte/anterior, entregues ao JS quando a app esta viva.'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  # 16.4 e nao 15.1: o AppShortcutsProvider precisa disso, e e o mesmo
  # deploymentTarget que o widget ja usa.
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
