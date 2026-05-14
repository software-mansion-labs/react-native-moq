#import "MoQPublisher.h"
#import <MoQ/MoQ-Swift.h>

@implementation MoQPublisher

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"publisherStateChanged",
    @"publisherTrackStateChanged",
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

- (void)startPreview:(NSString *)cameraPosition {
  [[MoQPublisherImpl shared] startPreview:cameraPosition];
}

- (void)stopPreview {
  [[MoQPublisherImpl shared] stopPreview];
}

- (void)flipCamera {
  [[MoQPublisherImpl shared] flipCamera];
}

- (void)publish:(NSString *)url path:(NSString *)path optsJson:(NSString *)optsJson {
  [[MoQPublisherImpl shared] publish:url path:path optsJson:optsJson];
}

- (void)stop {
  [[MoQPublisherImpl shared] stop];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQPublisherSpecJSI>(params);
}

@end
