#import "MoQPublisher.h"
#import <MoQ/MoQ-Swift.h>

@implementation MoQPublisher

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"publisherStateChanged",
    @"publisherTrackStateChanged",
    @"screenBroadcastStateChanged",
  ];
}

- (void)startObserving {
  [MoQPublisherImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MoQPublisherImpl shared].onEvent = nil;
}

- (void)publish:(NSString *)sessionId path:(NSString *)path tracksJson:(NSString *)tracksJson {
  [[MoQPublisherImpl shared] publishWithSessionId:sessionId path:path tracksJson:tracksJson];
}

- (void)stop:(NSString *)sessionId {
  [[MoQPublisherImpl shared] stopWithSessionId:sessionId];
}

- (void)configureScreenBroadcast:(NSString *)url optsJson:(NSString *)optsJson {
  [[MoQPublisherImpl shared] configureScreenBroadcast:url optsJson:optsJson];
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
  [[MoQPublisherImpl shared] stopScreenBroadcast];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQPublisherSpecJSI>(params);
}

@end
