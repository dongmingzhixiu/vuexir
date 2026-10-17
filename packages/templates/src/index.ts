/**
 * @dongmingzhixiu/vuexir-templates —— 原生工程模板与版本契约（P2）
 *
 * 版本约定：TEMPLATE_VERSION 变化意味着生成产物结构可能变化（新增/删除文件或改动工程骨架），
 * `vrn doctor` 会对比工程内 `.vrn/manifest.json` 记录的版本并提示重生成。
 */
export const TEMPLATE_VERSION = '0.1.0';

/** iOS 工程骨架（xcodegen project.yml） */
export const projectYml = (projectName: string, bundleId: string) => `name: ${projectName}
options:
  bundleIdPrefix: com.vrn
  deploymentTarget:
    iOS: "17.0"
  createIntermediateGroups: true
targets:
  ${projectName}:
    type: application
    platform: iOS
    deploymentTarget: "17.0"
    sources:
      - ${projectName}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ${bundleId}
        GENERATE_INFOPLIST_FILE: YES
        INFOPLIST_KEY_UILaunchScreen_Generation: YES
        INFOPLIST_KEY_UISupportedInterfaceOrientations: UIInterfaceOrientationPortrait
        SWIFT_VERSION: "5.0"
        TARGETED_DEVICE_FAMILY: "1"
        CODE_SIGN_STYLE: Automatic
`;

/** Android 工程骨架（app/build.gradle.kts） */
export const buildGradle = (bundleId: string) => `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${bundleId}"
    compileSdk = 34

    defaultConfig {
        applicationId = "${bundleId}"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.09.00"))
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.navigation:navigation-compose:2.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.6.8")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    debugImplementation("androidx.compose.ui:ui-test-manifest:1.6.8")
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        freeCompilerArgs.add("-Xjvm-default=all")
    }
}
`;

/** 模板清单：生成产物需要落盘的工程级文件（相对工程目录） */
export function templateFiles(platform: 'ios' | 'android'): string[] {
  return platform === 'ios' ? ['project.yml'] : ['settings.gradle.kts', 'build.gradle.kts', 'app/build.gradle.kts', 'gradle.properties'];
}
