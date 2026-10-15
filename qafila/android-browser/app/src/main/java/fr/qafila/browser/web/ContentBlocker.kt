package fr.qafila.browser.web

/**
 * Domaines bloqués, séparés en trois familles réglables indépendamment :
 * publicités, traqueurs (mesure d'audience, profilage) et plateformes de bandeaux de cookies.
 * Plus les sélecteurs CSS masqués (emplacements publicitaires / bandeaux de cookies).
 */
object ContentBlocker {
    val adDomains: List<String> = listOf(
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "googletagservices.com", "adnxs.com", "adsrvr.org", "advertising.com",
        "adform.net", "criteo.com", "criteo.net", "taboola.com", "outbrain.com", "smartadserver.com", "rubiconproject.com", "pubmatic.com", "openx.net",
        "casalemedia.com", "indexww.com", "amazon-adsystem.com", "ads.linkedin.com", "ads-twitter.com", "weborama.fr", "ligatus.com", "sddan.com",
        "teads.tv", "moatads.com", "adsafeprotected.com", "doubleverify.com", "zedo.com", "adroll.com", "sharethrough.com", "33across.com", "yieldmo.com",
        "triplelift.com", "sovrn.com", "lijit.com", "gumgum.com", "undertone.com", "bidswitch.net", "contextweb.com", "mgid.com", "revcontent.com", "media.net",
    )

    val trackerDomains: List<String> = listOf(
        "google-analytics.com", "googletagmanager.com", "facebook.net", "snap.licdn.com", "analytics.twitter.com", "scorecardresearch.com", "quantserve.com",
        "chartbeat.com", "hotjar.com", "mouseflow.com", "fullstory.com", "crazyegg.com", "mixpanel.com", "segment.io", "segment.com", "amplitude.com",
        "newrelic.com", "nr-data.net", "sentry.io", "bugsnag.com", "optimizely.com", "mc.yandex.ru", "bat.bing.com", "clarity.ms", "xiti.com", "ati-host.net",
        "at-o.net", "branch.io", "appsflyer.com", "adjust.com", "onesignal.com", "pushwoosh.com", "tapad.com", "bluekai.com", "demdex.net", "omtrdc.net",
        "everesttech.net", "krxd.net", "rlcdn.com", "exelator.com", "eyeota.net", "agkn.com", "mathtag.com", "cxense.com", "permutive.com", "piano.io", "tinypass.com",
    )

    val cookieDomains: List<String> = listOf("didomi.io", "cookielaw.org", "onetrust.com")

    val cookieSelectors: List<String> = listOf(
        "#onetrust-consent-sdk", "#onetrust-banner-sdk", ".onetrust-pc-dark-filter", "#didomi-host", "#didomi-popup", ".didomi-popup-backdrop",
        "#CybotCookiebotDialog", "#cookie-banner", "#cookieBanner", "#cookie-consent", ".cookie-consent", ".cookie-banner", ".cookiebanner",
        "#cookie-notice", ".cookie-notice", "#cookieNotice", ".cc-window", ".cc-banner", "#cc-main", ".cmp-container", "#cmp-container", ".qc-cmp2-container",
        "#qc-cmp2-container", ".fc-consent-root", "#sp_message_container", "[id^='sp_message_container_']", "#axeptio_overlay", ".tarteaucitronAlert",
        "#tarteaucitronRoot", "#tarteaucitronAlertBig", ".gdpr-banner", "#gdpr-banner", ".gdpr-modal", ".consent-banner", "#consent-banner", ".consent-modal",
        "#usercentrics-root", ".cookie-wall", "#cookie-wall", ".cookiewall", ".privacy-banner", "#privacy-banner",
    )

    val adSelectors: List<String> = listOf(
        ".adsbygoogle", "ins.adsbygoogle", "[id^='google_ads_iframe']", ".ad-slot", ".ad-container", ".ad-banner", ".advertisement", "[class*='sponsored-']",
        "#taboola-below-article-thumbnails", ".OUTBRAIN", ".trc_related_container", ".ad-wrapper", "[aria-label='Publicité']", "[aria-label='Advertisement']",
    )

    private fun matches(h: String, list: List<String>) = list.any { h == it || h.endsWith(".$it") }

    /** Vrai si l'hôte (ou un de ses domaines parents) appartient à une famille activée. */
    fun isBlocked(host: String?, ads: Boolean, trackers: Boolean, cookies: Boolean): Boolean {
        val h = host?.lowercase() ?: return false
        return (ads && matches(h, adDomains)) || (trackers && matches(h, trackerDomains)) || (cookies && matches(h, cookieDomains))
    }

    val cookieCss: String get() = cookieSelectors.joinToString(", ") + " { display: none !important; visibility: hidden !important; }\nhtml, body { overflow: auto !important; position: static !important; }"
    val adCss: String get() = adSelectors.joinToString(", ") + " { display: none !important; }"
}
