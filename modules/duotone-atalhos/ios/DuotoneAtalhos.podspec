Pod::Spec.new do |s|
  s.name           = 'DuotoneAtalhos'
  s.version        = '1.0.0'
  s.summary        = 'Atalhos no icone da app (premir o icone)'
  s.description    = 'Recebe a acao rapida escolhida no icone (UIApplicationShortcutItem) e passa-a ao JS.'
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
