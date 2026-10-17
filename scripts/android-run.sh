#!/usr/bin/env bash
# Vuexir Android 一键链路：生成 → 构建 → 安装 → 启动 → 截图
# 用法：bash scripts/android-run.sh [sample名，默认 vuexir-demo]
#   工程目录名 / 包名由生成器从 sample 名推导（<SampleName> / com.vrn.<sample名>），
#   本脚本自动从 gen-android 输出解析，不再硬编码 VuexirDemo。
# 前置：真机 USB 调试已开；MIUI 需开「USB 调试（安全设置）」+「USB 安装」
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
GRADLE="${VRN_GRADLE:-$HOME/gradle-dist/gradle-8.9/bin/gradle}"
SAMPLE="${1:-vuexir-demo}"
ANDROID_ROOT="${VRN_OUT_DIR:-$ROOT/compiler/generated/android}"

echo "[1/5] 生成 Compose 工程（$SAMPLE → $ANDROID_ROOT/）..."
GEN_OUT="$(cd "$ROOT" && npx vite-node packages/cli/src/gen-android.ts "$SAMPLE" 2>&1)"
echo "$GEN_OUT"
# 从生成输出解析工程目录（[gen-android] 完成: <路径>（N tab + M detail））
PROJ_DIR="$(echo "$GEN_OUT" | sed -n 's/.*\[gen-android\] 完成: \(.*\)（.*）/\1/p' | head -1)"
if [[ -z "$PROJ_DIR" || ! -d "$PROJ_DIR" ]]; then
  echo "✗ 无法解析生成工程目录（见上方输出）"
  exit 1
fi
PROJ_NAME="$(basename "$PROJ_DIR")"
BUNDLE="com.vrn.$(echo "$PROJ_NAME" | tr '[:upper:]' '[:lower:]')"

echo "[2/5] Gradle assembleDebug（$PROJ_NAME）..."
(cd "$PROJ_DIR" && "$GRADLE" assembleDebug)

APK="$PROJ_DIR/app/build/outputs/apk/debug/app-debug.apk"
echo "[3/5] adb 安装 APK ..."
"$ADB" install -r "$APK"

echo "[4/5] 启动应用（$BUNDLE）..."
"$ADB" shell am start -n "$BUNDLE/.MainActivity"

echo "[5/5] 截图 → /tmp/${PROJ_NAME}-android.png ..."
sleep 4
"$ADB" exec-out screencap -p > "/tmp/${PROJ_NAME}-android.png"
echo "完成：/tmp/${PROJ_NAME}-android.png"
