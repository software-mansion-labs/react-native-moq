#import <React/RCTViewManager.h>
#import <Moq/Moq-Swift.h>

@interface MoQVideoViewManager : RCTViewManager
@end

@implementation MoQVideoViewManager

RCT_EXPORT_MODULE(MoQVideoView)

- (UIView *)view {
  return [MoQVideoView new];
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
