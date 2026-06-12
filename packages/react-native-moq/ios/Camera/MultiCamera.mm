#import "MultiCamera.h"
#import <MoQ/MoQ-Swift.h>

@implementation MultiCamera

RCT_EXPORT_MODULE(MoQMultiCamera)

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"multiCameraStateChanged" ];
}

- (void)startObserving {
  [MultiCameraImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MultiCameraImpl shared].onEvent = nil;
}

- (void)isSupported:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject {
  resolve(@([[MultiCameraImpl shared] isSupported]));
}

- (void)startCapture:(double)width height:(double)height framerate:(double)framerate {
  [[MultiCameraImpl shared] startCaptureWithWidth:width height:height framerate:framerate];
}

- (void)stopCapture {
  [[MultiCameraImpl shared] stopCapture];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQMultiCameraSpecJSI>(params);
}

@end
