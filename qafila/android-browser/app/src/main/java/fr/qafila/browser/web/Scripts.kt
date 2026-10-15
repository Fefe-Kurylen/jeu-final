package fr.qafila.browser.web

/** Scripts injectés : temps de lecture + couleur du site, mode sombre, masquage CSS, lecteur, page d'erreur. */
object Scripts {
    /** Temps de lecture (200 mots/min) + couleur du site : theme-color (selon le mode clair/sombre), sinon fond de la page, normalisée en rgb(). */
    val pageInfo = """
        (function(){ try {
          var words = (document.body && document.body.innerText || '').split(/\s+/).filter(Boolean).length;
          function norm(c){ if (!c) return ''; var d = document.createElement('div'); d.style.color = c; (document.body || document.documentElement).appendChild(d); var r = getComputedStyle(d).color; d.remove(); return r; }
          function empty(c){ return !c || c === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c); }
          var c = '', metas = document.querySelectorAll('meta[name="theme-color"]');
          for (var i = 0; i < metas.length; i++) { var m = metas[i].getAttribute('media'); if (!m || window.matchMedia(m).matches) { c = metas[i].getAttribute('content') || ''; break; } }
          c = norm(c);
          if (empty(c) && document.body) { c = getComputedStyle(document.body).backgroundColor; if (empty(c)) c = getComputedStyle(document.documentElement).backgroundColor; }
          if (empty(c)) c = '';
          window.Qafila.pageInfo(Math.max(0, Math.round(words / 200)), c);
        } catch (e) {} })();
    """.trimIndent()

    fun injectCss(id: String, css: String, on: Boolean): String = """
        (function(){ var el = document.getElementById('$id');
          if (${if (on) "true" else "false"}) { if (!el) { el = document.createElement('style'); el.id = '$id'; el.textContent = ${jsString(css)}; (document.head || document.documentElement).appendChild(el); } }
          else if (el) { el.remove(); } })();
    """.trimIndent()

    const val darkenCss = """html { filter: invert(0.92) hue-rotate(180deg) !important; background: #111 !important; }
img, video, canvas, picture, svg, iframe, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }"""

    val reader = """
        (function(){
          function score(el){ var t=(el.innerText||'').trim(); var p=el.querySelectorAll('p').length; return t.length + p*80 - el.querySelectorAll('a').length*30; }
          var candidates = Array.from(document.querySelectorAll('article, main, [role=main], .post, .article, .entry-content, .post-content, #content, .content'));
          var best = null, bestScore = 0;
          candidates.forEach(function(c){ var s = score(c); if (s > bestScore) { bestScore = s; best = c; } });
          if (!best) { var ps = Array.from(document.querySelectorAll('p')); var map = new Map(); ps.forEach(function(p){ var par = p.parentElement; map.set(par, (map.get(par)||0) + (p.innerText||'').length); }); map.forEach(function(v,k){ if (v > bestScore) { bestScore = v; best = k; } }); }
          if (!best) return;
          var clone = best.cloneNode(true);
          clone.querySelectorAll('script, style, nav, aside, footer, form, iframe, .share, .social, .ad, .ads, [class*="related"], [class*="comment"]').forEach(function(e){ e.remove(); });
          var title = (document.querySelector('h1') || {}).innerText || document.title;
          var byline = (document.querySelector('[rel=author], .author, .byline') || {}).innerText || '';
          window.Qafila.reader(title, byline, clone.innerHTML, location.host, location.href);
        })();
    """.trimIndent()

    fun readerPage(title: String, byline: String, html: String, host: String, dark: Boolean): String = """
        <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>:root{color-scheme:${if (dark) "dark" else "light"}}
        body{margin:0 auto;padding:24px 20px 60px;font:19px/1.6 Georgia,serif;background:${if (dark) "#141416" else "#fbfaf7"};color:${if (dark) "#ececec" else "#1b1b1b"};max-width:680px}
        h1{font:700 30px/1.2 sans-serif;margin:0 0 8px}.meta{color:#888;font:14px sans-serif;margin-bottom:28px}img,video{max-width:100%;height:auto;border-radius:10px}a{color:${if (dark) "#8fb0ff" else "#004fd6"}}pre{white-space:pre-wrap;font-size:15px}</style>
        </head><body><h1>$title</h1><div class="meta">${if (byline.isEmpty()) "" else "$byline · "}$host</div>$html</body></html>
    """.trimIndent()

    fun errorPage(message: String, url: String): String = """
        <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;padding:24px;color:#17191c}@media(prefers-color-scheme:dark){body{background:#17191c;color:#f2f4f7}}h1{font-size:22px;margin:0 0 8px}p{color:#8395af;font-size:15px;max-width:360px}</style>
        </head><body><h1>Page inaccessible</h1><p>$message</p><p style="font-size:13px;word-break:break-all">$url</p></body></html>
    """.trimIndent()

    private fun jsString(s: String): String = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""
}
