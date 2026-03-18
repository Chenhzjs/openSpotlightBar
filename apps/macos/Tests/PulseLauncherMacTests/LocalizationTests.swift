import Testing
@testable import PulseLauncherMac

struct LocalizationTests {
    @Test func normalizesLanguagePreferenceValues() async throws {
        #expect(LauncherLanguagePreference.from(rawValue: "zh-CN") == .chineseSimplified)
        #expect(LauncherLanguagePreference.from(rawValue: "en") == .englishUS)
        #expect(LauncherLanguagePreference.from(rawValue: nil) == .system)
    }
}
