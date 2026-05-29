#import "Camera.h"
#import <MoQ/MoQ-Swift.h>

@implementation Camera

RCT_EXPORT_MODULE(MoQCamera)

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"cameraStateChanged" ];
}

- (void)startObserving {
  [CameraImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [CameraImpl shared].onEvent = nil;
}

- (void)startCapture:(NSString *)position {
  [[CameraImpl shared] startCaptureWithPosition:position];
}

- (void)stopCapture {
  [[CameraImpl shared] stopCapture];
}

- (void)setPosition:(NSString *)position {
  [[CameraImpl shared] setPosition:position];
}

- (NSArray<NSString *> *)getSupportedCodecs {
  return [[CameraImpl shared] supportedCodecs];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQCameraSpecJSI>(params);
}

@end
