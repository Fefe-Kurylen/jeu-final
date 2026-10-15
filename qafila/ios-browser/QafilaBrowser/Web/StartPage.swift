import Foundation

/// Page de démarrage locale (aucune requête réseau) et page d'erreur.
enum StartPage {
    static func html(dark: Bool) -> String {
        """
        <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        :root { color-scheme: \(dark ? "dark" : "light"); }
        body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, system-ui; background: \(dark ? "#17191c" : "#ffffff"); color: \(dark ? "#f2f4f7" : "#17191c"); }
        .ring { width: 96px; height: 96px; border-radius: 50%; border: 20px solid currentColor; box-sizing: border-box; opacity: .9; }
        h1 { font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-size: 44px; letter-spacing: -.03em; margin: 22px 0 6px; }
        p { margin: 0; color: #8395af; font-size: 15px; }
        .ar { font-family: "Geeza Pro", "Damascus", serif; font-size: 26px; font-weight: 600; color: #8395af; margin: 0 0 14px; }
        </style></head><body><div class="ring"></div><h1>Qafila</h1><div class="ar" lang="ar" dir="rtl">قافلة</div><p>Touchez la barre d'adresse pour commencer.</p></body></html>
        """
    }

    static func error(message: String, url: String) -> String {
        """
        <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,system-ui;text-align:center;padding:24px;color:#17191c}@media(prefers-color-scheme:dark){body{background:#17191c;color:#f2f4f7}}h1{font-size:22px;margin:0 0 8px}p{color:#8395af;font-size:15px;max-width:360px}</style>
        </head><body><h1>Page inaccessible</h1><p>\(message)</p><p style="font-size:13px;word-break:break-all">\(url)</p></body></html>
        """
    }
}
