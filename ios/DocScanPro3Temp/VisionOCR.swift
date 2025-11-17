import Foundation
import UIKit
import Vision
import React

@objc(VisionOCR)
class VisionOCR: NSObject {
  
  @objc static func requiresMainQueueSetup() -> Bool { false }
  
  @objc(recognize:languages:resolver:rejecter:)
  func recognize(
    _ imagePath: String,
    languages: NSArray?,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    // Accept file:// or plain path
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
    
    // Load image
    guard let imageData = try? Data(contentsOf: url),
          let uiImage = UIImage(data: imageData),
          let cgImage = uiImage.cgImage else {
      rejecter("IMAGE_LOAD_FAILED", "Cannot load image at \(url.path)", nil)
      return
    }
    
    // Use raw raster dimensions
    let imgW = CGFloat(cgImage.width)
    let imgH = CGFloat(cgImage.height)
    
    // Create Vision request
    let request = VNRecognizeTextRequest { request, error in
      if let error = error {
        rejecter("OCR_FAILED", error.localizedDescription, error)
        return
      }
      
      guard let observations = request.results as? [VNRecognizedTextObservation] else {
        rejecter("NO_RESULTS", "No text observations found", nil)
        return
      }
      
      var words: [[String: Any]] = []
      var languageCounts: [String: Int] = [:]
      
      for obs in observations {
        guard let topCandidate = obs.topCandidates(1).first else { continue }
        let text = topCandidate.string
        let lang = topCandidate.languageCode ?? "und"
        languageCounts[lang, default: 0] += 1
        
        // Convert Vision bounding box to pixel coordinates
        // Vision's boundingBox is normalized [0,1] with origin at bottom-left
        // b.minY = bottom edge, b.maxY = top edge (in Vision's coordinate system)
        let b = obs.boundingBox
        let x = b.minX * imgW
        // Convert from bottom-left (Vision) to top-left (pixels)
        // b.maxY is the top edge in Vision's system, so (1.0 - b.maxY) gives distance from top
        let y = (1.0 - b.maxY) * imgH
        let w = b.width * imgW
        let h = b.height * imgH
        
        words.append([
          "text": text,
          "x": Int(round(x)),
          "y": Int(round(y)),
          "width": Int(round(w)),
          "height": Int(round(h)),
          "conf": topCandidate.confidence,
          "lang": lang
        ])
      }
      
      print("[VisionOCR] language counts:", languageCounts)
      
      let result: [String: Any] = [
        "imgW": Int(imgW),
        "imgH": Int(imgH),
        "words": words
      ]
      
      resolver(result)
    }
    
    // Configure request
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    
    // Language behavior:
    // - If languages is non-empty, use it.
    // - If languages is nil or empty, DO NOT touch recognitionLanguages at all.
    //   Let Vision use its own defaults based on system locale & characters.
    if let langs = languages as? [String], !langs.isEmpty {
      request.recognitionLanguages = langs
    }
    
    // Perform request - don't pass orientation to handler
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    
    do {
      try handler.perform([request])
    } catch {
      rejecter("OCR_EXECUTION_FAILED", error.localizedDescription, error)
    }
  }
}

