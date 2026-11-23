import AVFoundation
import Foundation
import Speech

@main
struct LocalDictation {
    static func main() async {
        guard CommandLine.arguments.count == 2, #available(macOS 26, *) else {
            exit(2)
        }
        do {
            let audio = try AVAudioFile(forReading: URL(fileURLWithPath: CommandLine.arguments[1]))
            guard audio.length > 0, Double(audio.length) / audio.processingFormat.sampleRate <= 95 else { exit(3) }
            let language = Locale(identifier: "de-DE")
            if SpeechTranscriber.isAvailable,
               let locale = await SpeechTranscriber.supportedLocale(equivalentTo: language) {
                let module = SpeechTranscriber(locale: locale, preset: .transcription)
                print(try await transcribe(audio, module, text: { String($0.text.characters) }))
            } else if let locale = await DictationTranscriber.supportedLocale(equivalentTo: language) {
                let module = DictationTranscriber(locale: locale, preset: .shortDictation)
                print(try await transcribe(audio, module, text: { String($0.text.characters) }))
            } else {
                exit(2)
            }
        } catch {
            exit(4)
        }
    }

    @available(macOS 26, *)
    static func transcribe<T: SpeechModule>(_ file: AVAudioFile, _ module: T,
                                             text: @escaping @Sendable (T.Results.Element) -> String) async throws -> String {
        if let assets = try await AssetInventory.assetInstallationRequest(supporting: [module]) {
            try await assets.downloadAndInstall()
        }
        let analyzer = SpeechAnalyzer(modules: [module])
        return try await withThrowingTaskGroup(of: String.self) { group in
            group.addTask {
                var transcript = ""
                for try await result in module.results {
                    transcript += text(result)
                }
                return transcript
            }
            do {
                if let end = try await analyzer.analyzeSequence(from: file) {
                    try await analyzer.finalizeAndFinish(through: end)
                } else {
                    await analyzer.cancelAndFinishNow()
                }
                return try await group.next() ?? ""
            } catch {
                await analyzer.cancelAndFinishNow()
                throw error
            }
        }
    }
}
