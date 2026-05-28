#pragma once
#include <jsi/jsi.h>
#include <memory>
#include <vector>

// Only include from ObjC++ (.mm) translation units.
@class MoQPlayerRef;

namespace moq {

class PlayerHostObject final : public facebook::jsi::HostObject {
 public:
  explicit PlayerHostObject(MoQPlayerRef* ref);
  ~PlayerHostObject();

  facebook::jsi::Value get(facebook::jsi::Runtime& rt,
                            const facebook::jsi::PropNameID& name) override;
  std::vector<facebook::jsi::PropNameID> getPropertyNames(
      facebook::jsi::Runtime& rt) override;

 private:
  void* _refBridge;  // CF-retained MoQPlayerRef*, managed via CFBridgingRetain/Release
};

}  // namespace moq
