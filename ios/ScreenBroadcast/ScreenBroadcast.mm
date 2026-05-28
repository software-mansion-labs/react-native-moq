#import "ScreenBroadcast.h"
#import <MoQ/MoQ-Swift.h>

@implementation ScreenBroadcast

RCT_EXPORT_MODULE(MoQScreenBroadcast)

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"screenBroadcastStateChanged" ];
}

- (void)startObserving {
  [ScreenBroadcastImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [ScreenBroadcastImpl shared].onEvent = nil;
}

- (void)configureScreenBroadcast:(NSString *)url optsJson:(NSString *)optsJson {
  [[ScreenBroadcastImpl shared] configureWithUrl:url optsJson:optsJson];
}

- (void)startScreenBroadcast:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject {
  // iOS only allows starting a system broadcast via user interaction on
  // RPSystemBroadcastPickerView. Programmatic start is not available.
  reject(@"screen_broadcast_unavailable",
         @"On iOS, screen broadcasting must be started by tapping <BroadcastPickerView/>.",
         nil);
}

- (void)stopScreenBroadcast {
  [[ScreenBroadcastImpl shared] stop];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQScreenBroadcastSpecJSI>(params);
}

@end
