import Foundation
import UIKit

/// Un onglet : état persistant (l'instance WKWebView vit dans TabManager, pas ici).
struct BrowserTab: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var url: URL?
    var title: String = ""
    var isPrivate: Bool = false
    var createdAt: Date = Date()
    var lastVisited: Date = Date()
    /// Temps de lecture estimé en minutes (calculé par script dans la page).
    var readingMinutes: Int = 0
    var faviconData: Data?
    var themeColorHex: String?

    var host: String {
        guard let h = url?.host else { return "Nouvel onglet" }
        return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    }
    var displayTitle: String { title.isEmpty ? (url?.absoluteString ?? "Nouvel onglet") : title }
    var favicon: UIImage? { faviconData.flatMap(UIImage.init(data:)) }
    var readingLabel: String? { readingMinutes > 0 ? "\(readingMinutes) min" : nil }
}

struct Bookmark: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var title: String
    var url: URL
    var addedAt: Date = Date()
}

struct HistoryEntry: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var title: String
    var url: URL
    var visitedAt: Date = Date()
}
