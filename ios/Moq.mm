#import "Moq.h"
#import <Moq/Moq-Swift.h>

@implementation Moq
- (NSString *)getSessionState {
    return [MoqImpl getSessionState];
}

- (void)setSessionState:(NSString *)state {
    [MoqImpl setSessionState:state];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeMoqSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"Moq";
}

@end
