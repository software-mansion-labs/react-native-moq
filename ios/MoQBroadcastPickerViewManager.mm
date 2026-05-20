#import <React/RCTViewManager.h>
#import <MoQ/MoQ-Swift.h>

@interface MoQBroadcastPickerViewManager : RCTViewManager
@end

@implementation MoQBroadcastPickerViewManager

RCT_EXPORT_MODULE(MoQBroadcastPickerView)

- (UIView *)view {
  return [MoQBroadcastPickerView new];
}

RCT_EXPORT_VIEW_PROPERTY(preferredExtension, NSString)
RCT_EXPORT_VIEW_PROPERTY(tintColor, UIColor)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
