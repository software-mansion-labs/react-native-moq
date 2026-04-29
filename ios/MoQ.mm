#import "MoQ.h"
#import "MoQPlayerHostObject.h"
#import <MoQ/MoQ-Swift.h>

// C++ subclass of the codegen-generated TurboModule that adds the `getPlayer`
// JSI method.  All other methods fall through to NativeMoQSpecJSI's dispatch
// table, which bridges them to the ObjC @implementation below.
namespace {

class MoQJSIModule : public facebook::react::NativeMoQSpecJSI {
 public:
  using NativeMoQSpecJSI::NativeMoQSpecJSI;

  facebook::jsi::Value get(facebook::jsi::Runtime& rt,
                            const facebook::jsi::PropNameID& name) override {
    if (name.utf8(rt) == "getPlayer") {
      return facebook::jsi::Function::createFromHostFunction(
          rt, name, 1,
          [](facebook::jsi::Runtime& rt, const facebook::jsi::Value&,
             const facebook::jsi::Value* args, size_t) -> facebook::jsi::Value {
            int playerId = (int)args[0].asNumber();
            MoQPlayerRef* ref = [[MoQImpl shared] playerRefForId:playerId];
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

- (void)play:(double)playerId {
  [[MoQImpl shared] play:(int)playerId];
}

- (void)pause:(double)playerId {
  [[MoQImpl shared] pause:(int)playerId];
}

- (void)stopPlayer:(double)playerId {
  [[MoQImpl shared] stopPlayer:(int)playerId];
}

- (void)updateTargetLatency:(double)playerId ms:(double)ms {
  [[MoQImpl shared] updateTargetLatency:(int)playerId ms:(int)ms];
}

- (void)switchVideoTrack:(double)playerId trackName:(NSString *)trackName {
  [[MoQImpl shared] switchVideoTrack:(int)playerId trackName:trackName];
}

- (void)switchAudioTrack:(double)playerId trackName:(NSString *)trackName {
  [[MoQImpl shared] switchAudioTrack:(int)playerId trackName:trackName];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<MoQJSIModule>(params);
}

@end
