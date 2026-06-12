#import <React/RCTViewManager.h>
#import <MoQ/MoQ-Swift.h>

@interface MultiCameraPreviewViewManager : RCTViewManager
@end

@implementation MultiCameraPreviewViewManager

RCT_EXPORT_MODULE(MoQMultiCameraPreviewView)

RCT_EXPORT_VIEW_PROPERTY(source, NSString)

- (UIView *)view {
  return [MoQMultiCameraPreviewView new];
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
