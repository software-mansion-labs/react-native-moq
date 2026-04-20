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

- (void)connect:(NSString *)url prefix:(NSString *)prefix targetLatencyMs:(double)targetLatencyMs {
  [[MoqImpl shared] connect:url prefix:prefix targetLatencyMs:(int)targetLatencyMs];
}

- (void)disconnect {
  [[MoqImpl shared] disconnect];
}

- (void)play:(NSString *)broadcastPath {
  [[MoqImpl shared] play:broadcastPath];
}

- (void)pause:(NSString *)broadcastPath {
  [[MoqImpl shared] pause:broadcastPath];
}

- (void)stopPlayer:(NSString *)broadcastPath {
  [[MoqImpl shared] stopPlayer:broadcastPath];
}

- (void)updateTargetLatency:(NSString *)broadcastPath ms:(double)ms {
  [[MoqImpl shared] updateTargetLatency:broadcastPath ms:(int)ms];
}

- (void)switchVideoTrack:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoqImpl shared] switchVideoTrack:broadcastPath trackName:trackName];
}

- (void)switchAudioTrack:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoqImpl shared] switchAudioTrack:broadcastPath trackName:trackName];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeMoqSpecJSI>(params);
}

@end
