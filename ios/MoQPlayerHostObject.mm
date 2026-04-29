#include "MoQPlayerHostObject.h"
#import <MoQ/MoQ-Swift.h>

using namespace facebook::jsi;

namespace moq {

PlayerHostObject::PlayerHostObject(MoQPlayerRef* ref)
    : _refBridge((__bridge_retained void*)ref) {}

PlayerHostObject::~PlayerHostObject() { CFBridgingRelease(_refBridge); }

Value PlayerHostObject::get(Runtime& rt, const PropNameID& name) {
  const auto n = name.utf8(rt);
  MoQPlayerRef* ref = (__bridge MoQPlayerRef*)_refBridge;

  if (n == "broadcastPath") {
    return String::createFromUtf8(rt, ref.broadcastPath.UTF8String);
  }

  if (n == "play") {
    return Function::createFromHostFunction(
        rt, name, 0,
        [ref](Runtime&, const Value&, const Value*, size_t) -> Value {
          [ref play];
          return Value::undefined();
        });
  }

  if (n == "pause") {
    return Function::createFromHostFunction(
        rt, name, 0,
        [ref](Runtime&, const Value&, const Value*, size_t) -> Value {
          [ref pause];
          return Value::undefined();
        });
  }

  if (n == "stop") {
    return Function::createFromHostFunction(
        rt, name, 0,
        [ref](Runtime&, const Value&, const Value*, size_t) -> Value {
          [ref stop];
          return Value::undefined();
        });
  }

  if (n == "updateTargetLatency") {
    return Function::createFromHostFunction(
        rt, name, 1,
        [ref](Runtime& rt, const Value&, const Value* args,
              size_t) -> Value {
          [ref updateTargetLatencyMs:(int)args[0].asNumber()];
          return Value::undefined();
        });
  }

  if (n == "switchVideoTrack") {
    return Function::createFromHostFunction(
        rt, name, 1,
        [ref](Runtime& rt, const Value&, const Value* args,
              size_t) -> Value {
          NSString* trackName =
              [NSString stringWithUTF8String:args[0]
                                                .asString(rt)
                                                .utf8(rt)
                                                .c_str()];
          [ref switchVideoTrackName:trackName];
          return Value::undefined();
        });
  }

  if (n == "switchAudioTrack") {
    return Function::createFromHostFunction(
        rt, name, 1,
        [ref](Runtime& rt, const Value&, const Value* args,
              size_t) -> Value {
          NSString* trackName =
              [NSString stringWithUTF8String:args[0]
                                                .asString(rt)
                                                .utf8(rt)
                                                .c_str()];
          [ref switchAudioTrackName:trackName];
          return Value::undefined();
        });
  }

  return Value::undefined();
}

std::vector<PropNameID> PlayerHostObject::getPropertyNames(Runtime& rt) {
  std::vector<PropNameID> props;
  props.reserve(7);
  props.push_back(PropNameID::forAscii(rt, "broadcastPath"));
  props.push_back(PropNameID::forAscii(rt, "play"));
  props.push_back(PropNameID::forAscii(rt, "pause"));
  props.push_back(PropNameID::forAscii(rt, "stop"));
  props.push_back(PropNameID::forAscii(rt, "updateTargetLatency"));
  props.push_back(PropNameID::forAscii(rt, "switchVideoTrack"));
  props.push_back(PropNameID::forAscii(rt, "switchAudioTrack"));
  return props;
}

}  // namespace moq
