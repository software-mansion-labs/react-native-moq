#import <React/RCTViewComponentView.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <MoQ/MoQ-Swift.h>

#include <react/renderer/components/MoQSpec/ComponentDescriptors.h>
#include <react/renderer/components/MoQSpec/EventEmitters.h>
#include <react/renderer/components/MoQSpec/Props.h>
#include <react/renderer/components/MoQSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface MoQVideoViewComponentView : RCTViewComponentView
@end

@implementation MoQVideoViewComponentView {
  MoQVideoView *_videoView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<MoQVideoViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const MoQVideoViewProps>();
    _props = defaultProps;

    _videoView = [[MoQVideoView alloc] initWithFrame:frame];
    self.contentView = _videoView;
  }
  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps {
  const auto &newProps = *std::static_pointer_cast<const MoQVideoViewProps>(props);
  [_videoView setPlayerId:newProps.playerId];
  [super updateProps:props oldProps:oldProps];
}

@end

Class<RCTComponentViewProtocol> MoQVideoViewCls(void) {
  return MoQVideoViewComponentView.class;
}
