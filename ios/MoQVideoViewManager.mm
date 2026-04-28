#import <React/RCTViewManager.h>
#import <MoQ/MoQ-Swift.h>

@interface MoQVideoViewManager : RCTViewManager
@end

@implementation MoQVideoViewManager

RCT_EXPORT_MODULE(MoQVideoView)

- (UIView *)view {
  return [MoQVideoView new];
}

RCT_EXPORT_VIEW_PROPERTY(playerHandle, NSNumber)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
