#import "MoQ.h"
#import "PlayerHostObject.h"
#import <MoQ/MoQ-Swift.h>

// TurboModule subclass adding the `getPlayer` JSI method; other methods fall
// through to NativeMoQSpecJSI.
namespace {

class MoQJSIModule : public facebook::react::NativeMoQSpecJSI {
 public:
  using NativeMoQSpecJSI::NativeMoQSpecJSI;

  facebook::jsi::Value get(facebook::jsi::Runtime& rt,
                            const facebook::jsi::PropNameID& name) override {
    if (name.utf8(rt) == "getPlayer") {
      return facebook::jsi::Function::createFromHostFunction(
          rt, name, 2,
          [](facebook::jsi::Runtime& rt, const facebook::jsi::Value&,
             const facebook::jsi::Value* args, size_t) -> facebook::jsi::Value {
            NSString* sessionId = [NSString
                stringWithUTF8String:args[0].asString(rt).utf8(rt).c_str()];
            NSString* path = [NSString
                stringWithUTF8String:args[1].asString(rt).utf8(rt).c_str()];
            PlayerRef* ref =
                [[MoQImpl shared] playerRefForSessionId:sessionId broadcastPath:path];
            if (!ref) return facebook::jsi::Value::undefined();
            auto hostObj = std::make_shared<moq::PlayerHostObject>(ref);
            return facebook::jsi::Object::createFromHostObject(rt, hostObj);
          });
    }
    return NativeMoQSpecJSI::get(rt, name);
  }
};

}  // namespace

@implementation MoQ

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[
    @"sessionStateChanged",
    @"broadcastAvailable",
    @"broadcastUnavailable",
    @"playerEvent",
    @"playbackStatsUpdated",
    @"trackObject",
    @"audioData",
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

- (void)connect:(NSString *)sessionId url:(NSString *)url targetLatencyMs:(double)targetLatencyMs {
  [[MoQImpl shared] connectWithSessionId:sessionId url:url targetLatencyMs:(int)targetLatencyMs];
}

- (void)disconnect:(NSString *)sessionId {
  [[MoQImpl shared] disconnectWithSessionId:sessionId];
}

- (void)subscribe:(NSString *)sessionId prefix:(NSString *)prefix {
  [[MoQImpl shared] subscribeWithSessionId:sessionId prefix:prefix];
}

- (void)unsubscribe:(NSString *)sessionId prefix:(NSString *)prefix {
  [[MoQImpl shared] unsubscribeWithSessionId:sessionId prefix:prefix];
}

- (void)play:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath {
  [[MoQImpl shared] playWithSessionId:sessionId broadcastPath:broadcastPath];
}

- (void)pause:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath {
  [[MoQImpl shared] pauseWithSessionId:sessionId broadcastPath:broadcastPath];
}

- (void)stopPlayer:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath {
  [[MoQImpl shared] stopPlayerWithSessionId:sessionId broadcastPath:broadcastPath];
}

- (void)updateTargetLatency:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath ms:(double)ms {
  [[MoQImpl shared] updateTargetLatencyWithSessionId:sessionId broadcastPath:broadcastPath ms:(int)ms];
}

- (void)switchVideoTrack:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoQImpl shared] switchVideoTrackWithSessionId:sessionId broadcastPath:broadcastPath trackName:trackName];
}

- (void)switchAudioTrack:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoQImpl shared] switchAudioTrackWithSessionId:sessionId broadcastPath:broadcastPath trackName:trackName];
}

- (void)setVolume:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath volume:(double)volume {
  [[MoQImpl shared] setVolumeWithSessionId:sessionId broadcastPath:broadcastPath volume:(float)volume];
}

- (void)createAudioOnlyPlayer:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath {
  [[MoQImpl shared] createAudioOnlyPlayerWithSessionId:sessionId broadcastPath:broadcastPath];
}

- (void)subscribeTrackObjects:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoQImpl shared] subscribeTrackObjectsWithSessionId:sessionId broadcastPath:broadcastPath trackName:trackName];
}

- (void)unsubscribeTrackObjects:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath trackName:(NSString *)trackName {
  [[MoQImpl shared] unsubscribeTrackObjectsWithSessionId:sessionId broadcastPath:broadcastPath trackName:trackName];
}

- (void)subscribeAudioData:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath trackName:(NSString *)trackName sampleFormat:(NSString *)sampleFormat {
  [[MoQImpl shared] subscribeAudioDataWithSessionId:sessionId broadcastPath:broadcastPath trackName:trackName sampleFormat:sampleFormat];
}

- (void)unsubscribeAudioData:(NSString *)sessionId broadcastPath:(NSString *)broadcastPath trackName:(NSString *)trackName sampleFormat:(NSString *)sampleFormat {
  [[MoQImpl shared] unsubscribeAudioDataWithSessionId:sessionId broadcastPath:broadcastPath trackName:trackName sampleFormat:sampleFormat];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<MoQJSIModule>(params);
}

@end
