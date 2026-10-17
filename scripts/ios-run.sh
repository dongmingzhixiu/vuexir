#!/usr/bin/env bash
# ============================================================
# ios-run.sh —— 一条命令：Vue 样例 → 生成原生工程 → 编译 → 安装 → 启动
#
# 用法:
#   npm run ios                     # 交互选择样例（回车默认 vuexir-demo）
#   npm run ios -- vuexir-demo      # 按样例名（多页目录：compiler/samples/<name>/router.ts）
#   npm run ios -- path/App.vue     # 按文件路径
#   npm run ios -- --list           # 仅列出可用样例
#   npm run ios -- --device <UDID>  # 真机模式：签名构建 + 安装到已连接设备（自动探测 Team ID）
#
# 快捷别名: npm run ios:vuexir-demo（package.json）
# 前置：Xcode + xcodegen（brew install xcodegen）+ iPhone 17 模拟器（iOS 26）
# 真机前置：开发者账号已登录 Xcode（Account）；设备已连接并信任本机；UDID 用
#   xcrun devicectl list devices 查询
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INPUT="${1:-}"
DEVICE_UDID=""

list_samples() {
  ls -d "$ROOT"/examples/*/ 2>/dev/null | sed "s|${ROOT}/examples/||; s|/||"
}

# --list：仅列出
if [[ "$INPUT" == "--list" || "$INPUT" == "-l" ]]; then
  echo "可用样例："
  list_samples | nl -w2 -s'. '
  exit 0
fi

# --device <UDID>：真机模式（样例名/路径跟在后面）
if [[ "$INPUT" == "--device" ]]; then
  DEVICE_UDID="${2:-}"
  if [[ -z "$DEVICE_UDID" ]]; then
    echo "✗ 缺少设备 UDID，用法：npm run ios -- --device <UDID> vuexir-demo"
    echo "  查询已连接设备：xcrun devicectl list devices（或 xcrun xctrace list devices 取硬件 UDID）"
    exit 1
  fi
  # 5 段 UUID（8-4-4-4-12）才是 CoreDevice ID，需要按设备名反查硬件 UDID（00008150-…）；硬件 UDID（8-16 两段）直接用
  if [[ "$DEVICE_UDID" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]]; then
    NAME="$(xcrun devicectl list devices 2>/dev/null | grep -F "$DEVICE_UDID" | head -1 | sed 's/^[[:space:]]*//' | cut -d' ' -f1-2 || true)"
    MAPPED="$(xcrun xctrace list devices 2>/dev/null | grep -iF "$NAME" | grep -oE '0000[0-9A-Fa-f]{20}' | head -1 || true)"
    if [[ -z "$MAPPED" ]]; then
      echo "✗ 未找到 CoreDevice ID $DEVICE_UDID 对应的硬件 UDID"
      echo "  请用硬件 UDID 重试（xcrun xctrace list devices 查看，形如 00008150-xxxxxxxxxxxxxxxx）"
      exit 1
    fi
    DEVICE_UDID="$MAPPED"
    echo "  已映射设备 → 硬件 UDID $DEVICE_UDID"
  fi
  INPUT="${3:-}"
fi

# 无参数：交互选择
if [[ -z "$INPUT" ]]; then
  SAMPLES="$(list_samples)"
  echo "可用样例（回车默认 vuexir-demo）："
  echo "$SAMPLES" | nl -w2 -s'. '
  read -r -p "选择编号或样例名: " SEL
  if [[ -z "$SEL" ]]; then
    INPUT="vuexir-demo"
  elif [[ "$SEL" =~ ^[0-9]+$ ]]; then
    INPUT="$(echo "$SAMPLES" | sed -n "${SEL}p")"
    if [[ -z "$INPUT" ]]; then
      echo "✗ 编号 $SEL 超出范围"
      exit 1
    fi
  else
    INPUT="$SEL"
  fi
fi

# 解析输入：样例名 → 多页目录（含 router.ts）或 samples/<name>/App.vue；路径 → 直接用
SRC=""
if [[ "$INPUT" == *.vue ]]; then
  SRC="$INPUT"
elif [[ -f "$ROOT/examples/$INPUT/router.ts" ]]; then
  SRC="$INPUT"   # 多页目录模式：传给 gen-ios 的样例名
else
  SRC="$ROOT/compiler/samples/$INPUT/App.vue"
fi
if [[ ! -f "$ROOT/examples/$INPUT/router.ts" && ! -f "$SRC" ]]; then
  echo "✗ 找不到样例: $SRC"
  echo "  可用样例：$(list_samples | tr '\n' ' ')"
  exit 1
fi
echo "== 样例: $SRC =="
if [[ -n "$DEVICE_UDID" ]]; then
  echo "== 目标: 真机（UDID ${DEVICE_UDID}）=="
else
  echo "== 目标: 模拟器（iPhone 17）=="
fi

# ① 生成原生工程（Vue SFC → IR → SwiftUI 源码 + xcodegen 工程）
echo "== ① 生成工程 =="
GEN_OUT="$(cd "$ROOT" && npx vite-node packages/cli/src/gen-ios.ts "$SRC" 2>&1)"
echo "$GEN_OUT"
OUT_DIR="$(echo "$GEN_OUT" | sed -n 's/.*已生成.*工程: //p' | head -1)"
if [[ -z "$OUT_DIR" || ! -d "$OUT_DIR" ]]; then
  echo "✗ 生成失败（见上方输出）"
  exit 1
fi
PROJECT="$(basename "$OUT_DIR")"
BUNDLE="com.vrn.$(echo "$PROJECT" | tr '[:upper:]' '[:lower:]')"

# ② 生成 .xcodeproj + 编译
echo "== ② 编译 =="
cd "$OUT_DIR"
xcodegen generate

if [[ -n "$DEVICE_UDID" ]]; then
  # 真机模式：自动签名（Team ID 从 Apple Development 证书 OU 探测；-allowProvisioningUpdates 让 xcodebuild 自动注册/更新描述文件）
  TEAM="$(security find-certificate -c "Apple Development" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | sed -n 's/.*OU=\([A-Z0-9]*\).*/\1/p' | head -1)"
  if [[ -z "$TEAM" ]]; then
    echo "✗ 未找到 Apple Development 证书（请先在 Xcode → Settings → Accounts 登录开发者账号）"
    exit 1
  fi
  echo "  签名团队: ${TEAM}"
  xcodebuild -project "$PROJECT.xcodeproj" -scheme "$PROJECT" -configuration Debug \
    -destination "platform=iOS,id=$DEVICE_UDID" \
    -derivedDataPath build build \
    CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$TEAM" CODE_SIGNING_ALLOWED=YES \
    -allowProvisioningUpdates > /tmp/vrn-ios-build.log 2>&1 \
    || { echo "✗ 编译失败，日志: /tmp/vrn-ios-build.log"; tail -30 /tmp/vrn-ios-build.log; exit 1; }
else
  xcodebuild -project "$PROJECT.xcodeproj" -scheme "$PROJECT" -configuration Debug \
    -destination 'platform=iOS Simulator,name=iPhone 17' \
    -derivedDataPath build build CODE_SIGNING_ALLOWED=NO > /tmp/vrn-ios-build.log 2>&1 \
    || { echo "✗ 编译失败，日志: /tmp/vrn-ios-build.log"; tail -20 /tmp/vrn-ios-build.log; exit 1; }
fi
echo "✓ BUILD SUCCEEDED"

# ③ 安装 + 启动
if [[ -n "$DEVICE_UDID" ]]; then
  echo "== ③ 安装到真机（${BUNDLE}）=="
  APP="build/Build/Products/Debug-iphoneos/$PROJECT.app"
  xcrun devicectl device install app --device "$DEVICE_UDID" "$APP" || {
    echo "✗ 安装失败。常见原因："
    echo "  1) 设备未在开发者后台注册（Xcode 里连一次设备会自动注册，或开发者网页手动加 UDID）"
    echo "  2) 设备锁屏/未信任本机（iPhone 设置 → 通用 → VPN与设备管理 → 信任）"
    exit 1
  }
  echo "== 完成 =="
  echo "  已在真机安装 ${PROJECT}（${BUNDLE}），到手机上点图标启动"
  exit 0
fi

echo "== ③ 安装并启动（${BUNDLE}）=="
xcrun simctl boot 'iPhone 17' 2>/dev/null || true
xcrun simctl install booted "build/Build/Products/Debug-iphonesimulator/$PROJECT.app"
xcrun simctl terminate booted "$BUNDLE" 2>/dev/null || true
xcrun simctl launch booted "$BUNDLE"

# ④ 截图留证
sleep 1
xcrun simctl io booted screenshot "/tmp/${PROJECT}.png" 2>/dev/null || true
echo ""
echo "== 完成 =="
echo "  模拟器已打开 ${PROJECT}（${BUNDLE}）"
echo "  截图: /tmp/${PROJECT}.png"
echo ""
echo "下次可直接：npm run ios -- ${PROJECT}"
