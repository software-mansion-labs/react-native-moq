#import "Publisher.h"
#import <MoQ/MoQ-Swift.h>

@implementation Publisher

RCT_EXPORT_MODULE(MoQPublisher)

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"publisherStateChanged",
    @"publisherTrackStateChanged",
  ];
}

- (void)startObserving {
  [PublisherImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [PublisherImpl shared].onEvent = nil;
}

- (void)publish:(NSString *)sessionId path:(NSString *)path tracksJson:(NSString *)tracksJson {
  [[PublisherImpl shared] publishWithSessionId:sessionId path:path tracksJson:tracksJson];
}

- (void)stop:(NSString *)sessionId {
  [[PublisherImpl shared] stopWithSessionId:sessionId];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQPublisherSpecJSI>(params);
}

@end
