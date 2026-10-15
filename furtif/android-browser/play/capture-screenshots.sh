#!/usr/bin/env bash
# Captures d'écran Google Play (émulateur 1080x1920, format 9:16 accepté par la Play Console).
# Lancé par le workflow « Furtif captures stores », depuis furtif/android-browser.
set -euo pipefail
APK=app/build/outputs/apk/debug/app-debug.apk
PKG=fr.furtif.browser.debug
ACT=fr.furtif.browser.MainActivity
OUT=store-screenshots/android
mkdir -p "$OUT"
adb install -r "$APK"
# Barre d'état propre (heure 9:41, batterie pleine, pas de notifications)
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941 >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null
shoot() {  # $1 = écran, $2 = nom du fichier
  adb shell am force-stop "$PKG"
  adb shell am start -W -n "$PKG/$ACT" --es demo "$1" >/dev/null
  sleep 22
  adb exec-out screencap -p > "$OUT/$2.png"
  echo "capture : $OUT/$2.png"
}
shoot page 1-page
shoot menu 2-menu
shoot tabs 3-onglets
shoot editor 4-personnaliser
shoot settings 5-reglages
adb shell cmd uimode night yes
shoot page 6-page-sombre
adb shell cmd uimode night no
