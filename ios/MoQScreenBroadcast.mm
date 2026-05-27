#import "MoQScreenBroadcast.h"
#import <MoQ/MoQ-Swift.h>

@implementation MoQScreenBroadcast

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"screenBroadcastStateChanged" ];
}

- (void)startObserving {
  [MoQScreenBroadcastImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MoQScreenBroadcastImpl shared].onEvent = nil;
}

- (void)configureScreenBroadcast:(NSString *)url optsJson:(NSString *)optsJson {
  [[MoQScreenBroadcastImpl shared] configureWithUrl:url optsJson:optsJson];
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
  [[MoQScreenBroadcastImpl shared] stop];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQScreenBroadcastSpecJSI>(params);
}

@end
