@preconcurrency import Network
import Foundation

final class ConnectivityMonitor: ObservableObject, @unchecked Sendable {
    @Published private(set) var isReachable = true
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "GearGuard.Connectivity")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let reachable = path.status == .satisfied
            DispatchQueue.main.async {
                self?.isReachable = reachable
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
