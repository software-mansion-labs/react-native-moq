#import "MoQMicrophone.h"
#import <MoQ/MoQ-Swift.h>

@implementation MoQMicrophone

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"micStateChanged" ];
}

- (void)startObserving {
  [MoQMicrophoneImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MoQMicrophoneImpl shared].onEvent = nil;
}

- (void)startCapture:(double)sampleRate {
  [[MoQMicrophoneImpl shared] startCaptureWithSampleRate:sampleRate];
}

- (void)stopCapture {
  [[MoQMicrophoneImpl shared] stopCapture];
}

- (NSArray<NSString *> *)getSupportedCodecs {
  return [[MoQMicrophoneImpl shared] supportedCodecs];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQMicrophoneSpecJSI>(params);
}

@end
