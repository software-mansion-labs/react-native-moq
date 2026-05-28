#import "MoQCamera.h"
#import <MoQ/MoQ-Swift.h>

@implementation MoQCamera

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"cameraStateChanged" ];
}

- (void)startObserving {
  [MoQCameraImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MoQCameraImpl shared].onEvent = nil;
}

- (void)startCapture:(NSString *)position {
  [[MoQCameraImpl shared] startCaptureWithPosition:position];
}

- (void)stopCapture {
  [[MoQCameraImpl shared] stopCapture];
}

- (void)setPosition:(NSString *)position {
  [[MoQCameraImpl shared] setPosition:position];
}

- (NSArray<NSString *> *)getSupportedCodecs {
  return [[MoQCameraImpl shared] supportedCodecs];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQCameraSpecJSI>(params);
}

@end
