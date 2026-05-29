#import <React/RCTViewManager.h>
#import <MoQ/MoQ-Swift.h>

@interface VideoViewManager : RCTViewManager
@end

@implementation VideoViewManager

RCT_EXPORT_MODULE(MoQVideoView)

- (UIView *)view {
  return [MoQVideoView new];
}

RCT_EXPORT_VIEW_PROPERTY(sessionId, NSString)
RCT_EXPORT_VIEW_PROPERTY(broadcastPath, NSString)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
