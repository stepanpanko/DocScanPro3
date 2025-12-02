import Foundation
import UIKit
import React

@objc(NativePDFBuilder)
class NativePDFBuilder: NSObject {
  
  @objc static func requiresMainQueueSetup() -> Bool { false }
  
  @objc(build:resolver:rejecter:)
  func build(
    _ pages: [[String: Any]],
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    // Validate pages array
    guard !pages.isEmpty else {
      rejecter("EMPTY_PAGES", "Pages array cannot be empty", nil)
      return
    }
    
    // Load first page image to determine PDF page size
    guard let firstPage = pages.first,
          let imagePath = firstPage["imagePath"] as? String else {
      rejecter("INVALID_PAGE", "First page missing imagePath", nil)
      return
    }
    
    // Load first image
    let url: URL
    if imagePath.hasPrefix("file://") {
      guard let u = URL(string: imagePath) else {
        rejecter("INVALID_URI", "Invalid URI: \(imagePath)", nil)
        return
      }
      url = u
    } else {
      url = URL(fileURLWithPath: imagePath)
    }
    
    guard let imageData = try? Data(contentsOf: url),
          let firstImage = UIImage(data: imageData) else {
      rejecter("IMAGE_LOAD_FAILED", "Cannot load first image at \(url.path)", nil)
      return
    }
    
    // Use first page's image size as PDF page size
    let pageSize = firstImage.size
    let bounds = CGRect(origin: .zero, size: pageSize)
    let format = UIGraphicsPDFRendererFormat()
    let renderer = UIGraphicsPDFRenderer(bounds: bounds, format: format)
    
    // Create temporary file
    let fileName = "export-\(UUID().uuidString).pdf"
    let tmpURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)
    
    // Generate PDF
    do {
      try renderer.writePDF(to: tmpURL) { ctx in
        for pageData in pages {
          // Begin new page
          ctx.beginPage()
          
          // Extract page data
          guard let imagePath = pageData["imagePath"] as? String,
                let imgW = pageData["imgW"] as? Int,
                let imgH = pageData["imgH"] as? Int,
                let ocrWords = pageData["ocrWords"] as? [[String: Any]] else {
            print("[NativePDFBuilder] Skipping invalid page data")
            continue
          }
          
          // Load page image
          let pageURL: URL
          if imagePath.hasPrefix("file://") {
            guard let u = URL(string: imagePath) else {
              print("[NativePDFBuilder] Invalid URI: \(imagePath)")
              continue
            }
            pageURL = u
          } else {
            pageURL = URL(fileURLWithPath: imagePath)
          }
          
          guard let pageImageData = try? Data(contentsOf: pageURL),
                let pageImage = UIImage(data: pageImageData) else {
            print("[NativePDFBuilder] Cannot load image at \(pageURL.path)")
            continue
          }
          
          // Compute page rect
          let pageRect = CGRect(origin: .zero, size: pageSize)
          
          // Draw image
          pageImage.draw(in: pageRect)
          
          // Draw OCR words as invisible text layer
          let scaleX = pageRect.width / CGFloat(imgW)
          let scaleY = pageRect.height / CGFloat(imgH)
          
          for wordData in ocrWords {
            guard let text = wordData["text"] as? String,
                  let x = wordData["x"] as? Int,
                  let y = wordData["y"] as? Int,
                  let width = wordData["width"] as? Int,
                  let height = wordData["height"] as? Int else {
              print("[NativePDFBuilder] Skipping invalid word data")
              continue
            }
            
            let bx = CGFloat(x)
            let by = CGFloat(y)
            let bw = CGFloat(width)
            let bh = CGFloat(height)
            
            // Convert coordinates from top-left origin to PDF coordinates
            let xPdf = pageRect.minX + bx * scaleX
            let yTopImage = CGFloat(imgH) - (by + bh)  // flip from top-left to bottom-left
            let yPdf = pageRect.minY + yTopImage * scaleY
            
            // Calculate font size
            let fontSize = max(bh * scaleY * 0.9, 6.0)
            let attributes: [NSAttributedString.Key: Any] = [
              .font: UIFont.systemFont(ofSize: fontSize),
              .foregroundColor: UIColor.black.withAlphaComponent(0.01)  // almost invisible
            ]
            
            // Draw text
            (text as NSString).draw(at: CGPoint(x: xPdf, y: yPdf), withAttributes: attributes)
          }
        }
      }
      
      // Resolve with file path
      resolver(tmpURL.path)
    } catch {
      rejecter("PDF_CREATION_FAILED", "Failed to create PDF: \(error.localizedDescription)", error)
    }
  }
}

