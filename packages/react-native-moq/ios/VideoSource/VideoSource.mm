#import "VideoSource.h"
#import <MoQ/MoQ-Swift.h>

@implementation VideoSource

RCT_EXPORT_MODULE(MoQVideoSource)

- (void)create:(NSString *)trackId
         width:(double)width
        height:(double)height
      poolSize:(double)poolSize
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject {
  NSArray *descriptors = [[VideoSourceImpl shared] createWithTrackId:trackId
                                                               width:width
                                                              height:height
                                                            poolSize:poolSize];
  if (descriptors == nil) {
    reject(@"E_VIDEO_SOURCE_POOL", @"failed to allocate video buffer pool", nil);
  } else {
    resolve(descriptors);
  }
}

- (void)destroy:(NSString *)trackId {
  [[VideoSourceImpl shared] destroyWithTrackId:trackId];
}

- (void)pushFrame:(NSString *)trackId
      bufferIndex:(double)bufferIndex
      timestampNs:(double)timestampNs
      fenceHandle:(NSString *)fenceHandle
       fenceValue:(NSString *)fenceValue {
  [[VideoSourceImpl shared] pushFrameWithTrackId:trackId
                                     bufferIndex:bufferIndex
                                     timestampNs:timestampNs
                                     fenceHandle:fenceHandle
                                      fenceValue:fenceValue];
}

- (void)fillTestPattern:(NSString *)trackId
            bufferIndex:(double)bufferIndex
             frameIndex:(double)frameIndex {
  [[VideoSourceImpl shared] fillTestPatternWithTrackId:trackId
                                           bufferIndex:bufferIndex
                                            frameIndex:frameIndex];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeMoQVideoSourceSpecJSI>(params);
}

@end
