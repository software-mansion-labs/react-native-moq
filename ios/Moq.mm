#import "Moq.h"
#import <Moq/Moq-Swift.h>

@implementation Moq

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"sessionStateChanged",
    @"broadcastAvailable",
    @"broadcastUnavailable",
    @"playerEvent",
    @"playbackStatsUpdated",
  ];
}

- (void)startObserving {
  [MoqImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MoqImpl shared].onEvent = nil;
}

- (void)connect:(NSString *)url prefix:(NSString *)prefix {
  [[MoqImpl shared] connect:url prefix:prefix];
}

- (void)disconnect {
  [[MoqImpl shared] disconnect];
}

- (void)play {
  [[MoqImpl shared] play];
}

- (void)pause {
  [[MoqImpl shared] pause];
}

- (void)stopAll {
  [[MoqImpl shared] stopAll];
}

- (void)updateTargetLatency:(double)ms {
  [[MoqImpl shared] updateTargetLatencyMs:(int)ms];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeMoqSpecJSI>(params);
}

@end
