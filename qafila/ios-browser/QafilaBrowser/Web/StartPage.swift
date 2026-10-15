import Foundation

/// Page de démarrage locale (aucune requête réseau) et page d'erreur.
enum StartPage {
    static func html(dark: Bool, bookmarks: [(title: String, url: String)] = []) -> String {
        let tiles = bookmarks.map { b -> String in
            let letter = String(b.title.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
            return "<a class=\"tile\" href=\"\(escape(b.url))\"><span class=\"ic\">\(escape(letter))</span><span class=\"t\">\(escape(b.title))</span></a>"
        }.joined()
        return """
        <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        :root { color-scheme: \(dark ? "dark" : "light"); }
        * { -webkit-tap-highlight-color: transparent; }
        body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; font-family: -apple-system, system-ui; background: \(dark ? "#000000" : "#ffffff"); color: \(dark ? "#f2f2f7" : "#1c1c1e"); }
        .head { margin-top: 26vh; text-align: center; }
        h1 { font-family: "New York", "Iowan Old Style", Georgia, serif; font-weight: 500; font-size: 40px; letter-spacing: -.02em; margin: 0; }
        .ar { font-family: "Geeza Pro", "Damascus", serif; font-size: 19px; color: #8e8e93; margin-top: 2px; }
        .grid { display: grid; grid-template-columns: repeat(4, 72px); gap: 18px 14px; margin-top: 44px; }
        .tile { display: flex; flex-direction: column; align-items: center; gap: 7px; text-decoration: none; color: inherit; }
        .ic { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font: 500 22px "New York", Georgia, serif; background: \(dark ? "#1c1c1e" : "#f2f2f7"); color: \(dark ? "#d1d1d6" : "#3a3a3c"); }
        .t { font-size: 11px; color: #8e8e93; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        </style></head><body><div class="head"><h1>Qafila</h1><div class="ar" lang="ar" dir="rtl">قافلة</div></div>
        <div class="grid">\(tiles)</div></body></html>
        """
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }

    static func error(message: String, url: String) -> String {
        """
        <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,system-ui;text-align:center;padding:24px;color:#17191c}@media(prefers-color-scheme:dark){body{background:#17191c;color:#f2f4f7}}h1{font-size:22px;margin:0 0 8px}p{color:#8395af;font-size:15px;max-width:360px}</style>
        </head><body><h1>Page inaccessible</h1><p>\(message)</p><p style="font-size:13px;word-break:break-all">\(url)</p></body></html>
        """
    }
}
