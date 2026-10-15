import Foundation

/// Scripts injectés dans les pages : temps de lecture, couleur du site, mode sombre, lecteur.
enum Scripts {
    /// Calcule le temps de lecture (200 mots/min) et la couleur de thème, puis les envoie à l'app.
    static let pageInfo = """
    (function(){
      try {
        var words = (document.body && document.body.innerText || '').split(/\\s+/).filter(Boolean).length;
        var meta = document.querySelector('meta[name="theme-color"]');
        var color = meta ? meta.getAttribute('content') : '';
        var icon = '';
        var links = document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]');
        for (var i = 0; i < links.length; i++) { if (links[i].href) { icon = links[i].href; if (/apple-touch/.test(links[i].rel)) break; } }
        window.webkit.messageHandlers.qafila.postMessage({ type: 'pageInfo', minutes: Math.max(0, Math.round(words / 200)), color: color || '', icon: icon });
      } catch (e) {}
    })();
    """

    /// Mode sombre pour tous les sites : inversion douce, images et vidéos préservées.
    static let darkenCSS = """
    html { filter: invert(0.92) hue-rotate(180deg) !important; background: #111 !important; }
    img, video, canvas, picture, svg, iframe, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
    """
    static func darken(_ on: Bool) -> String {
        """
        (function(){
          var id = 'qafila-darken';
          var el = document.getElementById(id);
          if (\(on ? "true" : "false")) {
            if (!el) { el = document.createElement('style'); el.id = id; el.textContent = `\(darkenCSS)`; (document.head || document.documentElement).appendChild(el); }
          } else if (el) { el.remove(); }
        })();
        """
    }

    /// Lecteur : extrait l'article principal (heuristique simple inspirée de Readability) et le présente dans une page épurée.
    static let reader = """
    (function(){
      function score(el){ var t=(el.innerText||'').trim(); var p=el.querySelectorAll('p').length; return t.length + p*80 - el.querySelectorAll('a').length*30; }
      var candidates = Array.from(document.querySelectorAll('article, main, [role=main], .post, .article, .entry-content, .post-content, #content, .content'));
      var best = null, bestScore = 0;
      candidates.forEach(function(c){ var s = score(c); if (s > bestScore) { bestScore = s; best = c; } });
      if (!best) { var ps = Array.from(document.querySelectorAll('p')); var map = new Map(); ps.forEach(function(p){ var par = p.parentElement; map.set(par, (map.get(par)||0) + (p.innerText||'').length); }); map.forEach(function(v,k){ if (v > bestScore) { bestScore = v; best = k; } }); }
      if (!best) return null;
      var clone = best.cloneNode(true);
      clone.querySelectorAll('script, style, nav, aside, footer, form, iframe, .share, .social, .ad, .ads, [class*="related"], [class*="comment"]').forEach(function(e){ e.remove(); });
      var title = (document.querySelector('h1') || {}).innerText || document.title;
      var byline = (document.querySelector('[rel=author], .author, .byline') || {}).innerText || '';
      return JSON.stringify({ title: title, byline: byline, html: clone.innerHTML, host: location.host, url: location.href });
    })();
    """

    static func readerPage(title: String, byline: String, html: String, host: String, dark: Bool) -> String {
        """
        <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        :root { color-scheme: \(dark ? "dark" : "light"); }
        body { margin: 0; padding: 24px 20px 60px; font: 19px/1.6 -apple-system, "New York", Georgia, serif; background: \(dark ? "#141416" : "#fbfaf7"); color: \(dark ? "#ececec" : "#1b1b1b"); max-width: 680px; margin: 0 auto; }
        h1 { font: 700 30px/1.2 -apple-system, system-ui; margin: 0 0 8px; }
        .meta { color: #888; font: 14px -apple-system, system-ui; margin-bottom: 28px; }
        img, video { max-width: 100%; height: auto; border-radius: 10px; }
        a { color: \(dark ? "#8fb0ff" : "#004fd6"); }
        pre { white-space: pre-wrap; font-size: 15px; }
        </style></head><body><h1>\(title)</h1><div class="meta">\(byline.isEmpty ? "" : byline + " · ")\(host)</div>\(html)</body></html>
        """
    }
}
