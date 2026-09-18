Pod::Spec.new do |s|
  s.name           = 'DuotoneDiagnostico'
  s.version        = '1.0.0'
  s.summary        = 'Crashes e bloqueios contados pelo iOS'
  s.description    = 'Subscreve o MetricKit e guarda um resumo (sem conteudo) dos crashes e bloqueios, que o JS le na abertura seguinte.'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MetricKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
