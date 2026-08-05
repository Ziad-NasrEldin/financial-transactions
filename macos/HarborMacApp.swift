import SwiftUI
import WebKit
import AppKit

private let dashboardURL = URL(string: "harbor://app/index.html?variant=overview")!
private let bridgeHealthURL = URL(string: "http://127.0.0.1:4317/health")!
private let mainWindowFrameDefaultsKey = "ZoidBank.MainWindowFrame"

@main
struct HarborMacApp: App {
    @NSApplicationDelegateAdaptor(HarborAppDelegate.self) private var appDelegate
    @StateObject private var health = BridgeHealth()

    var body: some Scene {
        WindowGroup("Zoid Bank") {
            HarborWindow(health: health)
                .frame(minWidth: 1100, minHeight: 720)
        }
        .defaultSize(width: 1100, height: 720)
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About Zoid Bank") { NSApplication.shared.orderFrontStandardAboutPanel(nil) }
            }
        }
        Settings {
            SettingsView()
        }
    }
}

final class BridgeHealth: ObservableObject {
    @Published private(set) var isHealthy = false
    @Published private(set) var message = "Checking local source..."
    private var timer: Timer?

    init() {
        check()
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.check() }
    }

    deinit { timer?.invalidate() }

    func check() {
        URLSession.shared.dataTask(with: bridgeHealthURL) { [weak self] data, response, _ in
            let healthy = (response as? HTTPURLResponse)?.statusCode == 200 && data != nil
            DispatchQueue.main.async {
                self?.isHealthy = healthy
                self?.message = healthy ? "Local Messages source ready" : "Start the Zoid Bank Messages bridge"
            }
        }.resume()
    }
}

struct HarborWindow: View {
    @ObservedObject var health: BridgeHealth
    @State private var reloadToken = UUID()
    @State private var currentURL = dashboardURL
    @State private var scanRequest: UUID? = UUID()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "water.waves")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color(red: 0.18, green: 0.36, blue: 0.28))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Zoid Bank")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Private signal ledger")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Label(health.message, systemImage: health.isHealthy ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(health.isHealthy ? Color(red: 0.18, green: 0.36, blue: 0.28) : .orange)
                Divider().frame(height: 18)
                Button("Overview") { navigate(to: "overview") }
                Button("Review Queue") { navigate(to: "review") }
                Button("Reset & Scan") { resetAndScan() }
                Button("Refresh") { reloadToken = UUID(); health.check() }
                    .keyboardShortcut("r", modifiers: [.command])
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(.bar)

            Divider()

            HarborWebView(url: currentURL, reloadToken: reloadToken, scanRequest: scanRequest)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private func navigate(to variant: String) {
        currentURL = URL(string: "harbor://app/index.html?variant=\(variant)")!
        reloadToken = UUID()
    }

    private func resetAndScan() {
        currentURL = dashboardURL
        scanRequest = UUID()
        reloadToken = UUID()
        health.check()
    }
}

final class HarborAppDelegate: NSObject, NSApplicationDelegate {
    private var windowObserver: NSObjectProtocol?

    func applicationDidFinishLaunching(_ notification: Notification) {
        windowObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didBecomeKeyNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let window = notification.object as? NSWindow,
                  window.title == "Zoid Bank" else { return }
            self?.configureMainWindow(window)
        }

        DispatchQueue.main.async { [weak self] in
            NSApplication.shared.windows
                .filter { $0.title == "Zoid Bank" }
                .forEach { self?.configureMainWindow($0) }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        WindowFramePersistence.saveAll()
    }

    deinit {
        if let windowObserver {
            NotificationCenter.default.removeObserver(windowObserver)
        }
    }

    private func configureMainWindow(_ window: NSWindow) {
        WindowFramePersistence.configure(window)
    }
}

private enum WindowFramePersistence {
    private static var configuredWindows = Set<ObjectIdentifier>()
    private static var observers = [ObjectIdentifier: [NSObjectProtocol]]()

    static func configure(_ window: NSWindow) {
        let windowID = ObjectIdentifier(window)
        guard configuredWindows.insert(windowID).inserted else { return }

        if let savedFrame = savedFrame(), isUsable(savedFrame) {
            window.setFrame(savedFrame, display: true)
        }

        let center = NotificationCenter.default
        observers[windowID] = [
            center.addObserver(forName: NSWindow.didMoveNotification, object: window, queue: .main) { _ in
                save(window)
            },
            center.addObserver(forName: NSWindow.didResizeNotification, object: window, queue: .main) { _ in
                save(window)
            },
        ]
        save(window)
    }

    static func saveAll() {
        NSApplication.shared.windows
            .filter { $0.title == "Zoid Bank" }
            .forEach { save($0) }
    }

    private static func save(_ window: NSWindow) {
        UserDefaults.standard.set(NSStringFromRect(window.frame), forKey: mainWindowFrameDefaultsKey)
    }

    private static func savedFrame() -> NSRect? {
        guard let value = UserDefaults.standard.string(forKey: mainWindowFrameDefaultsKey) else { return nil }
        return NSRectFromString(value)
    }

    private static func isUsable(_ frame: NSRect) -> Bool {
        guard frame.width >= 1100, frame.height >= 720 else { return false }
        return NSScreen.screens.contains { $0.visibleFrame.intersects(frame) }
    }
}

struct HarborWebView: NSViewRepresentable {
    let url: URL
    let reloadToken: UUID
    let scanRequest: UUID?

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(HarborSchemeHandler(), forURLScheme: "harbor")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.setValue(false, forKey: "drawsBackground")
        view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        if context.coordinator.currentURL != url {
            context.coordinator.currentURL = url
            context.coordinator.pendingScan = false
            view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        } else if context.coordinator.reloadToken != reloadToken {
            context.coordinator.reloadToken = reloadToken
            context.coordinator.pendingScan = scanRequest != nil
            view.reload()
        }
        if context.coordinator.scanRequest != scanRequest {
            context.coordinator.scanRequest = scanRequest
            context.coordinator.pendingScan = scanRequest != nil
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(url: url, reloadToken: reloadToken, scanRequest: scanRequest) }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var currentURL: URL
        var reloadToken: UUID
        var scanRequest: UUID?
        var pendingScan: Bool

        init(url: URL, reloadToken: UUID, scanRequest: UUID?) {
            self.currentURL = url
            self.reloadToken = reloadToken
            self.scanRequest = scanRequest
            self.pendingScan = scanRequest != nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard pendingScan else { return }
            pendingScan = false
            let scanScript = """
            (() => {
              window.__harborLedger?.reset?.();
              window.__harborRender?.();
              document.querySelector('[data-view="settings"]')?.click();
              let attempts = 0;
              const timer = setInterval(() => {
                const button = document.querySelector('#automatic-approval-test-mode button.button-primary');
                if (button) {
                  clearInterval(timer);
                  button.click();
                  setTimeout(() => document.querySelector('[data-view="review"]')?.click(), 2500);
                }
                if (++attempts > 80) clearInterval(timer);
              }, 100);
              return 'scan-requested';
            })();
            """
            webView.evaluateJavaScript(scanScript, completionHandler: nil)
        }
    }
}

final class HarborSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL?.appendingPathComponent("dist")

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url,
              let root,
              !requestURL.pathComponents.contains("..") else {
            urlSchemeTask.didFailWithError(NSError(domain: "Harbor", code: 1))
            return
        }
        let relativePath = requestURL.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let requestedFile = relativePath.isEmpty ? "index.html" : relativePath
        let fileURL = root.appendingPathComponent(requestedFile)
        do {
            let data = try Data(contentsOf: fileURL)
            let response = URLResponse(url: requestURL, mimeType: mimeType(for: fileURL), expectedContentLength: data.count, textEncodingName: "utf-8")
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "css": return "text/css"
        case "js": return "text/javascript"
        case "svg": return "image/svg+xml"
        case "json": return "application/json"
        default: return "text/html"
        }
    }
}

struct SettingsView: View {
    var body: some View {
        Form {
            Section("Local source") {
                Label("Apple Messages database", systemImage: "message.fill")
                Text("Zoid Bank reads approved Bank Al Ahly and Banque Misr alerts locally. It does not send, edit, mark read, delete, or upload messages.")
                    .foregroundStyle(.secondary)
            }
            Section("Dashboard") {
                Text("The native shell opens the compiled local Zoid Bank dashboard on port 4180.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 420, height: 240)
        .padding()
    }
}
