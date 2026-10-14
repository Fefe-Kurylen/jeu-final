package fr.furtif.browser.web

/** Domaines publicitaires / de traçage bloqués et sélecteurs de bandeaux de cookies masqués (même liste que la version iOS). */
object ContentBlocker {
    val blockedDomains: List<String> = listOf(
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com", "googletagmanager.com", "googletagservices.com",
        "adnxs.com", "adsrvr.org", "advertising.com", "adform.net", "criteo.com", "criteo.net", "taboola.com", "outbrain.com", "smartadserver.com",
        "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com", "indexww.com", "amazon-adsystem.com", "facebook.net", "ads.linkedin.com",
        "snap.licdn.com", "analytics.twitter.com", "ads-twitter.com", "scorecardresearch.com", "quantserve.com", "chartbeat.com", "hotjar.com", "mouseflow.com",
        "fullstory.com", "crazyegg.com", "mixpanel.com", "segment.io", "segment.com", "amplitude.com", "newrelic.com", "nr-data.net", "sentry.io", "bugsnag.com",
        "optimizely.com", "mc.yandex.ru", "bat.bing.com", "clarity.ms", "xiti.com", "ati-host.net", "at-o.net", "weborama.fr", "ligatus.com", "sddan.com", "teads.tv",
        "moatads.com", "adsafeprotected.com", "doubleverify.com", "branch.io", "appsflyer.com", "adjust.com", "onesignal.com", "pushwoosh.com", "tapad.com",
        "bluekai.com", "demdex.net", "omtrdc.net", "everesttech.net", "krxd.net", "rlcdn.com", "exelator.com", "eyeota.net", "agkn.com", "mathtag.com", "media.net",
        "zedo.com", "adroll.com", "sharethrough.com", "33across.com", "yieldmo.com", "triplelift.com", "sovrn.com", "lijit.com", "gumgum.com", "undertone.com",
        "bidswitch.net", "contextweb.com", "mgid.com", "revcontent.com", "cxense.com", "permutive.com", "piano.io", "tinypass.com", "didomi.io", "cookielaw.org", "onetrust.com",
    )

    val hiddenSelectors: List<String> = listOf(
        "#onetrust-consent-sdk", "#onetrust-banner-sdk", ".onetrust-pc-dark-filter", "#didomi-host", "#didomi-popup", ".didomi-popup-backdrop",
        "#CybotCookiebotDialog", "#cookie-banner", "#cookieBanner", "#cookie-consent", ".cookie-consent", ".cookie-banner", ".cookiebanner",
        "#cookie-notice", ".cookie-notice", "#cookieNotice", ".cc-window", ".cc-banner", "#cc-main", ".cmp-container", "#cmp-container", ".qc-cmp2-container",
        "#qc-cmp2-container", ".fc-consent-root", "#sp_message_container", "[id^='sp_message_container_']", "#axeptio_overlay", ".tarteaucitronAlert",
        "#tarteaucitronRoot", "#tarteaucitronAlertBig", ".gdpr-banner", "#gdpr-banner", ".gdpr-modal", ".consent-banner", "#consent-banner", ".consent-modal",
        "#usercentrics-root", ".cookie-wall", "#cookie-wall", ".cookiewall", ".privacy-banner", "#privacy-banner",
        ".adsbygoogle", "ins.adsbygoogle", "[id^='google_ads_iframe']", ".ad-slot", ".ad-container", ".ad-banner", ".advertisement", "[class*='sponsored-']",
        "#taboola-below-article-thumbnails", ".OUTBRAIN", ".trc_related_container", ".ad-wrapper", "[aria-label='Publicité']", "[aria-label='Advertisement']",
    )

    private val suffixes = blockedDomains.map { ".$it" }

    /** Vrai si l'hôte est un domaine bloqué ou un de ses sous-domaines. */
    fun isBlocked(host: String?): Boolean {
        val h = host?.lowercase() ?: return false
        return blockedDomains.any { h == it } || suffixes.any { h.endsWith(it) }
    }

    fun registrableDomain(host: String?): String? = host?.split('.')?.takeLast(2)?.joinToString(".")

    val cookieCss: String get() = hiddenSelectors.joinToString(", ") + " { display: none !important; visibility: hidden !important; }\nhtml, body { overflow: auto !important; position: static !important; }"
}
