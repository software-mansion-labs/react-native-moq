#import "MoQ.h"
#import <MoQ/MoQ-Swift.h>

@implementation MoQ

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
  [MoQImpl shared].onEvent = ^(NSString *name, NSDictionary *body) {
    [self sendEventWithName:name body:body];
  };
}

- (void)stopObserving {
  [MoQImpl shared].onEvent = nil;
}

- (void)connect:(NSString *)url prefix:(NSString *)prefix targetLatencyMs:(double)targetLatencyMs {
  [[MoQImpl shared] connect:url prefix:prefix targetLatencyMs:(int)targetLatencyMs];
}

- (void)disconnect {
  [[MoQImpl shared] disconnect];
}

- (void)play:(NSString *)broadcastPath {
  [[MoQImpl shared] play:broadcastPath];
}

- (void)pause:(NSString *)broadcastPath {
  [[MoQImpl shared] pause:broadcastPath];
}

- (void)stopPlayer:(NSString *)broadcastPath {
  [[MoQImpl shared] stopPlayer:broadcastPath];
}

- (void)updateTargetLatency:(NSString *)broadcastPath ms:(double)ms {
  [[MoQImpl shared] updateTargetLatency:broadcastPath ms:(int)ms];
}

- (void)switchVideoTrack:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoQImpl shared] switchVideoTrack:broadcastPath trackName:trackName];
}

- (void)switchAudioTrack:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoQImpl shared] switchAudioTrack:broadcastPath trackName:trackName];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeMoQSpecJSI>(params);
}

@end
