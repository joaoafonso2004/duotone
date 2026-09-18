Pod::Spec.new do |s|
  s.name           = 'DuotoneStream'
  s.version        = '1.0.0'
  s.summary        = 'Tocar enquanto descarrega'
  s.description    = 'Serve ao AVPlayer do expo-video um ficheiro que ainda esta a ser escrito, por um AVAssetResourceLoaderDelegate registado no transporte do expo-video.'
  s.author         = 'Duotone'
  s.homepage       = 'https://github.com/duotone/duotone'
  s.license        = { :type => 'MIT' }
  # O do expo-video, de quem isto depende.
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # O VideoAssetTransportRegistry (publico) e o sitio por onde se entra no
  # carregamento dos assets do expo-video sem lhe mexer no codigo.
  s.dependency 'ExpoVideo'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
