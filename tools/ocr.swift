import Foundation
import Vision
import AppKit

// 用法: ocr <image-path> —— macOS Vision 框架离线 OCR（中英混排）
let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
guard let img = NSImage(contentsOfFile: path),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("无法读取图像: \(path)\n".data(using: .utf8)!)
    exit(1)
}

let req = VNRecognizeTextRequest { request, _ in
    guard let obs = request.results as? [VNRecognizedTextObservation] else { return }
    // 按纵向位置排序（自上而下），便于还原界面结构
    let sorted = obs.sorted { $0.boundingBox.midY > $1.boundingBox.midY }
    for o in sorted {
        guard let top = o.topCandidates(1).first else { continue }
        let bb = o.boundingBox
        let y = String(format: "%.3f", 1 - bb.midY)
        let x = String(format: "%.3f", bb.midX)
        print("[y=\(y) x=\(x)] \(top.string)")
    }
}
req.recognitionLevel = .accurate
req.recognitionLanguages = ["zh-Hans", "en-US"]
req.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
    try handler.perform([req])
} catch {
    FileHandle.standardError.write("OCR 失败: \(error)\n".data(using: .utf8)!)
    exit(1)
}
