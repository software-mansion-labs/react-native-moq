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

- (NSNumber *)createPlayer:(NSString *)broadcastPath {
  return @([[MoQImpl shared] createPlayer:broadcastPath]);
}

- (void)releasePlayer:(double)handleId {
  [[MoQImpl shared] releasePlayer:(int)handleId];
}

- (void)play:(double)handleId {
  [[MoQImpl shared] play:(int)handleId];
}

- (void)pause:(double)handleId {
  [[MoQImpl shared] pause:(int)handleId];
}

- (void)updateTargetLatency:(double)handleId ms:(double)ms {
  [[MoQImpl shared] updateTargetLatency:(int)handleId ms:(int)ms];
}

- (void)switchVideoTrack:(double)handleId trackName:(NSString *)trackName {
  [[MoQImpl shared] switchVideoTrack:(int)handleId trackName:trackName];
}

- (void)switchAudioTrack:(double)handleId trackName:(NSString *)trackName {
  [[MoQImpl shared] switchAudioTrack:(int)handleId trackName:trackName];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeMoQSpecJSI>(params);
}

@end
