#pragma once
#include <jsi/jsi.h>
#include <memory>
#include <vector>

// Only include from ObjC++ (.mm) translation units.
@class PlayerRef;

namespace moq {

class PlayerHostObject final : public facebook::jsi::HostObject {
 public:
  explicit PlayerHostObject(PlayerRef* ref);
  ~PlayerHostObject();

  facebook::jsi::Value get(facebook::jsi::Runtime& rt,
                            const facebook::jsi::PropNameID& name) override;
  std::vector<facebook::jsi::PropNameID> getPropertyNames(
      facebook::jsi::Runtime& rt) override;

 private:
  void* _refBridge;  // CF-retained PlayerRef*, managed via CFBridgingRetain/Release
};

}  // namespace moq
