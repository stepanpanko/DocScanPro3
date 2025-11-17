#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PDFRasterizer, NSObject)

RCT_EXTERN_METHOD(
  rasterize:(NSString *)src
  dpi:(nonnull NSNumber *)dpi
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

@end
