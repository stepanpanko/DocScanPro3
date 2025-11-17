import Foundation
import PDFKit
import React

@objc(PDFRasterizer)
class PDFRasterizer: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(rasterize:dpi:resolver:rejecter:)
  func rasterize(_ src: String,
                 dpi: NSNumber,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    // Perform heavy rasterization work off the main thread to avoid UI freezes and watchdog kills
    DispatchQueue.global(qos: .userInitiated).async {
      guard let pdf = PDFDocument(url: URL(fileURLWithPath: src)) else {
        DispatchQueue.main.async {
          reject("E_NO_PDF", "Failed to open PDF", nil)
        }
        return
      }

      var results: [String] = []
      let scale = CGFloat(truncating: dpi) / 72.0 // PDF points are 72 DPI

      for i in 0..<pdf.pageCount {
        autoreleasepool {
          guard let page = pdf.page(at: i) else { return }
          let pageRect = page.bounds(for: .mediaBox)
          let size = CGSize(width: pageRect.width * scale, height: pageRect.height * scale)

          // Use a renderer format that is memory-friendly
          let format = UIGraphicsImageRendererFormat.default()
          format.opaque = true
          format.scale = 1
          let renderer = UIGraphicsImageRenderer(size: size, format: format)

          let img = renderer.image { ctx in
            UIColor.white.set()
            ctx.fill(CGRect(origin: .zero, size: size))
            ctx.cgContext.translateBy(x: 0, y: size.height)
            ctx.cgContext.scaleBy(x: scale, y: -scale)
            page.draw(with: .mediaBox, to: ctx.cgContext)
          }

          if let data = img.jpegData(compressionQuality: 0.85) {
            let outURL = URL(fileURLWithPath: NSTemporaryDirectory())
              .appendingPathComponent("raster-\(UUID().uuidString)-\(i).jpg")
            do {
              try data.write(to: outURL, options: .atomic)
              results.append(outURL.path)
            } catch {
              // Skip this page on write failure
            }
          }
        }
      }

      DispatchQueue.main.async {
        resolve(results)
      }
    }
  }
}
