import Testing
@testable import PulseLauncherMac

struct CommandRoutingTests {
    @Test func parsesBaseConfigCommand() async throws {
        #expect(CommandRouting.parseConfig("/config") == ConfigCommand(section: .general))
    }

    @Test func parsesWorkflowAlias() async throws {
        #expect(CommandRouting.parseConfig("/config workflow") == ConfigCommand(section: .workflow))
        #expect(CommandRouting.parseConfig("/settings plugins") == ConfigCommand(section: .plugins))
    }

    @Test func parsesClipboardAndSnippetSections() async throws {
        #expect(CommandRouting.parseConfig("/config clipboard") == ConfigCommand(section: .clipboard))
        #expect(CommandRouting.parseConfig("/settings snippets") == ConfigCommand(section: .snippets))
    }

    @Test func fallsBackToGeneralForUnknownSection() async throws {
        #expect(CommandRouting.parseConfig("/config unknown") == ConfigCommand(section: .general))
    }
}
