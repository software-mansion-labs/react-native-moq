#import "Microphone.h"
#import <MoQ/MoQ-Swift.h>

@implementation Microphone

RCT_EXPORT_MODULE(MoQMicrophone)

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"micStateChanged" ];
}

- (void)startObserving {
  [MicrophoneImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MicrophoneImpl shared].onEvent = nil;
}

- (void)startCapture:(double)sampleRate {
  [[MicrophoneImpl shared] startCaptureWithSampleRate:sampleRate];
}

- (void)stopCapture {
  [[MicrophoneImpl shared] stopCapture];
}

- (NSArray<NSString *> *)getSupportedCodecs {
  return [[MicrophoneImpl shared] supportedCodecs];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQMicrophoneSpecJSI>(params);
}

@end
