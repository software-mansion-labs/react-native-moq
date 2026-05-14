#import <React/RCTViewManager.h>
#import <MoQ/MoQ-Swift.h>

@interface MoQCameraPreviewViewManager : RCTViewManager
@end

@implementation MoQCameraPreviewViewManager

RCT_EXPORT_MODULE(MoQCameraPreviewView)

- (UIView *)view {
  return [MoQCameraPreviewView new];
}

RCT_EXPORT_VIEW_PROPERTY(cameraPosition, NSString)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
