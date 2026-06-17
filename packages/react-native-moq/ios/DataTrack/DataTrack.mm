#import "DataTrack.h"
#import <MoQ/MoQ-Swift.h>

@implementation DataTrack

RCT_EXPORT_MODULE(MoQDataTrack)

- (void)create:(NSString *)trackId {
  [[DataTrackImpl shared] createWithTrackId:trackId];
}

- (void)destroy:(NSString *)trackId {
  [[DataTrackImpl shared] destroyWithTrackId:trackId];
}

- (void)send:(NSString *)trackId payload:(NSString *)payload {
  [[DataTrackImpl shared] sendWithTrackId:trackId payload:payload];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQDataTrackSpecJSI>(params);
}

@end
