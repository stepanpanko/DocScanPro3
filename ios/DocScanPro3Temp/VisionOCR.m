#import <React/RCTBridgeModule.h>

// Expose the Swift class to React Native (bridgeless compatible)
@interface RCT_EXTERN_MODULE(VisionOCR, NSObject)

RCT_EXTERN_METHOD(recognize:(NSString *)imagePath
                  languages:(NSArray *)languages
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end

