Pod::Spec.new do |s|
  s.name           = 'DuotoneAudio'
  s.version        = '1.0.0'
  s.summary        = 'Tom e equalizador por cima do AVPlayer do expo-video'
  s.description    = 'Poe audioTimePitchAlgorithm .varispeed e um MTAudioProcessingTap com dez biquads no item que o expo-video ja esta a tocar.'
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
