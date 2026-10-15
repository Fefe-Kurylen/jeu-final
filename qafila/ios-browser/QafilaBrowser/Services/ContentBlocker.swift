import Foundation
import WebKit

/// Règles de blocage compilées pour WKWebView : publicités, traqueurs, et bandeaux de cookies (sélecteurs CSS masqués).
enum ContentBlocker {
    static let adsIdentifier = "qafila-ads"
    static let trackersIdentifier = "qafila-trackers"
    static let cookiesIdentifier = "qafila-cookie-banners"

    /// Domaines publicitaires et de traçage les plus répandus (liste volontairement courte et lisible ; extensible).
    static let blockedDomains: [String] = [
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com", "googletagmanager.com", "googletagservices.com",
        "adservice.google.com", "pagead2.googlesyndication.com", "adnxs.com", "adsrvr.org", "advertising.com", "adform.net", "criteo.com", "criteo.net",
        "taboola.com", "outbrain.com", "smartadserver.com", "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com", "indexww.com",
        "amazon-adsystem.com", "facebook.net", "connect.facebook.net", "ads.linkedin.com", "snap.licdn.com", "analytics.twitter.com", "ads-twitter.com",
        "scorecardresearch.com", "quantserve.com", "chartbeat.com", "hotjar.com", "mouseflow.com", "fullstory.com", "crazyegg.com", "mixpanel.com",
        "segment.io", "segment.com", "amplitude.com", "newrelic.com", "nr-data.net", "sentry.io", "bugsnag.com", "optimizely.com", "yandex.ru/metrika",
        "mc.yandex.ru", "bat.bing.com", "clarity.ms", "xiti.com", "ati-host.net", "at-o.net", "weborama.fr", "ligatus.com", "sddan.com", "teads.tv",
        "moatads.com", "adsafeprotected.com", "doubleverify.com", "cedexis.com", "branch.io", "appsflyer.com", "adjust.com", "onesignal.com",
        "pushwoosh.com", "tapad.com", "bluekai.com", "demdex.net", "omtrdc.net", "everesttech.net", "krxd.net", "rlcdn.com", "exelator.com",
        "eyeota.net", "agkn.com", "mathtag.com", "media.net", "zedo.com", "adroll.com", "sharethrough.com", "33across.com", "yieldmo.com",
        "triplelift.com", "sovrn.com", "lijit.com", "gumgum.com", "undertone.com", "bidswitch.net", "contextweb.com", "mgid.com", "revcontent.com",
        "cxense.com", "permutive.com", "piano.io", "tinypass.com", "didomi.io", "quantcast.mgr.consensu.org", "cookielaw.org", "onetrust.com",
    ]

    /// Sélecteurs de bandeaux de cookies et d'éléments publicitaires courants, masqués par CSS.
    static let hiddenSelectors: [String] = [
        "#onetrust-consent-sdk", "#onetrust-banner-sdk", ".onetrust-pc-dark-filter", "#didomi-host", "#didomi-popup", ".didomi-popup-backdrop",
        "#CybotCookiebotDialog", "#cookie-banner", "#cookieBanner", "#cookie-consent", ".cookie-consent", ".cookie-banner", ".cookiebanner",
        "#cookie-notice", ".cookie-notice", "#cookieNotice", ".cc-window", ".cc-banner", "#cc-main", ".cmp-container", "#cmp-container", ".qc-cmp2-container",
        "#qc-cmp2-container", ".fc-consent-root", "#sp_message_container", "[id^='sp_message_container_']", ".sp-message-open", "#axeptio_overlay",
        ".tarteaucitronAlert", "#tarteaucitronRoot", "#tarteaucitronAlertBig", ".gdpr-banner", "#gdpr-banner", ".gdpr-modal", "#gdpr", ".consent-banner",
        "#consent-banner", ".consent-modal", "#usercentrics-root", ".cookie-wall", "#cookie-wall", ".cookiewall", ".privacy-banner", "#privacy-banner",
        ".adsbygoogle", "ins.adsbygoogle", "[id^='google_ads_iframe']", ".ad-slot", ".ad-container", ".ad-banner", ".advertisement", "[class*='sponsored-']",
        "#taboola-below-article-thumbnails", ".OUTBRAIN", ".trc_related_container", ".ad-wrapper", "[aria-label='Publicité']", "[aria-label='Advertisement']",
    ]

    /// Domaines de mesure d'audience et de traçage (le reste de la liste est publicitaire).
    static let trackerDomains: Set<String> = [
        "google-analytics.com", "googletagmanager.com", "facebook.net", "connect.facebook.net", "snap.licdn.com", "analytics.twitter.com",
        "scorecardresearch.com", "quantserve.com", "chartbeat.com", "hotjar.com", "mouseflow.com", "fullstory.com", "crazyegg.com", "mixpanel.com",
        "segment.io", "segment.com", "amplitude.com", "newrelic.com", "nr-data.net", "sentry.io", "bugsnag.com", "optimizely.com", "yandex.ru/metrika",
        "mc.yandex.ru", "bat.bing.com", "clarity.ms", "xiti.com", "ati-host.net", "at-o.net", "cedexis.com", "branch.io", "appsflyer.com", "adjust.com",
        "onesignal.com", "pushwoosh.com", "tapad.com", "bluekai.com", "demdex.net", "omtrdc.net", "everesttech.net", "krxd.net", "rlcdn.com",
        "exelator.com", "eyeota.net", "agkn.com", "mathtag.com", "cxense.com", "permutive.com", "piano.io", "tinypass.com",
    ]

    static func adsRules() -> String { domainRules(blockedDomains.filter { !trackerDomains.contains($0) }) }
    static func trackerRules() -> String { domainRules(Array(trackerDomains)) }

    private static func domainRules(_ domains: [String]) -> String {
        // Toute ressource tierce (script, image, requête) servie par l'un de ces domaines est bloquée.
        let rules: [[String: Any]] = domains.map { domain in
            let escaped = domain.replacingOccurrences(of: ".", with: "\\.")
            return ["trigger": ["url-filter": "^https?://([a-z0-9-]+\\.)*" + escaped + "/", "load-type": ["third-party"]], "action": ["type": "block"]]
        }
        return json(rules)
    }

    static func cookieRules() -> String {
        json([["trigger": ["url-filter": ".*"], "action": ["type": "css-display-none", "selector": hiddenSelectors.joined(separator: ", ")]]])
    }

    private static func json(_ obj: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: data, encoding: .utf8) else { return "[]" }
        return s
    }

    /// Compile (ou recharge depuis le cache de WebKit) les deux listes.
    static func compile(completion: @escaping (WKContentRuleList?, WKContentRuleList?, WKContentRuleList?) -> Void) {
        let store = WKContentRuleListStore.default()
        store?.compileContentRuleList(forIdentifier: adsIdentifier, encodedContentRuleList: adsRules()) { ads, _ in
            store?.compileContentRuleList(forIdentifier: trackersIdentifier, encodedContentRuleList: trackerRules()) { trackers, _ in
                store?.compileContentRuleList(forIdentifier: cookiesIdentifier, encodedContentRuleList: cookieRules()) { cookies, _ in
                    completion(ads, trackers, cookies)
                }
            }
        }
    }
}
