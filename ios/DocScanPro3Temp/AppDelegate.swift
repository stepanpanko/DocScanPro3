import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "DocScanPro3Temp",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // Try to get bundle URL from Metro bundler (auto-discovery via Bonjour)
    if let url = RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index") {
      return url
    }
    
    // Fallback: Read Mac IP from file (automatically detected during build)
    // The build script generates MacIP.txt in the source directory
    // and it should be included as a resource in the bundle
    let macIP: String
    if let ipPath = Bundle.main.path(forResource: "MacIP", ofType: "txt"),
       let ip = try? String(contentsOfFile: ipPath).trimmingCharacters(in: .whitespacesAndNewlines),
       !ip.isEmpty {
      macIP = ip
    } else {
      // Last resort fallback (shouldn't happen if build script works)
      // This will be updated automatically on next build
      macIP = "192.168.1.61"
    }
    
    if let fallbackURL = URL(string: "http://\(macIP):8081/index.bundle?platform=ios&dev=true") {
      return fallbackURL
    }
    
    // Last resort: return nil to show error (user can shake device to enter URL manually)
    return nil
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
