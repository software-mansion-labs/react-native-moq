#import "AudioSource.h"
#import <MoQ/MoQ-Swift.h>

@implementation AudioSource

RCT_EXPORT_MODULE(MoQAudioSource)

- (void)create:(NSString *)trackId sampleRate:(double)sampleRate channels:(double)channels {
  [[AudioSourceImpl shared] createWithTrackId:trackId sampleRate:sampleRate channels:channels];
}

- (void)destroy:(NSString *)trackId {
  [[AudioSourceImpl shared] destroyWithTrackId:trackId];
}

- (void)send:(NSString *)trackId base64Pcm:(NSString *)base64Pcm {
  [[AudioSourceImpl shared] sendWithTrackId:trackId base64Pcm:base64Pcm];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQAudioSourceSpecJSI>(params);
}

@end
