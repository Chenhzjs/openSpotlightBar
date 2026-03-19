import Foundation

struct MacShellBridge: Sendable {
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    func bootstrap() async throws -> NativeShellSnapshot {
        try await runCommand(arguments: ["bootstrap"], input: Optional<String>.none)
    }

    func updateLanguage(_ language: String) async throws -> NativeShellSnapshot {
        try await runCommand(arguments: ["update-language", language], input: Optional<String>.none)
    }

    func updateSettings(_ settings: BridgeLauncherSettings) async throws -> NativeShellSnapshot {
        try await runCommand(arguments: ["update-settings"], input: settings)
    }

    func searchFiles(query: String) async throws -> [BridgeResultItem] {
        try await runCommand(arguments: ["search-files", query], input: Optional<String>.none)
    }

    func perform(action: BridgeActionItem, result: BridgeResultItem?) async throws -> BridgeActionResponse {
        try await runCommand(
            arguments: ["perform-action"],
            input: BridgeActionRequest(action: action, result: result)
        )
    }

    func recordSelection(itemID: String, itemType: String, query: String) async throws {
        let _: BridgeActionResponse = try await runCommand(
            arguments: ["record-selection"],
            input: BridgeRecordSelectionRequest(itemID: itemID, itemType: itemType, query: query)
        )
    }

    func status() -> NativeShellBridgeStatus {
        do {
            _ = try resolveBinaryURL()
            return .ready
        } catch {
            return .unavailable(error.localizedDescription)
        }
    }

    private func runCommand<Output: Decodable, Input: Encodable>(
        arguments: [String],
        input: Input?
    ) async throws -> Output
    where Output: Sendable, Input: Sendable {
        let binaryURL = try resolveBinaryURL()
        let currentDirectoryURL = resolveRepoRoot()

        return try await Task.detached(priority: .userInitiated) { [decoder, encoder] in
            let process = Process()
            process.executableURL = binaryURL
            process.arguments = arguments
            process.currentDirectoryURL = currentDirectoryURL

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            let stdinPipe = Pipe()
            if input != nil {
                process.standardInput = stdinPipe
            }

            try process.run()

            if let input {
                let data = try encoder.encode(input)
                stdinPipe.fileHandleForWriting.write(data)
                stdinPipe.fileHandleForWriting.closeFile()
            }

            process.waitUntilExit()

            let stdout = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            let stderr = stderrPipe.fileHandleForReading.readDataToEndOfFile()

            guard process.terminationStatus == 0 else {
                throw MacShellBridgeError.commandFailed(
                    String(decoding: stderr, as: UTF8.self).trimmingCharacters(
                        in: .whitespacesAndNewlines
                    )
                )
            }

            guard !stdout.isEmpty else {
                throw MacShellBridgeError.emptyResponse
            }

            do {
                return try decoder.decode(Output.self, from: stdout)
            } catch {
                throw MacShellBridgeError.invalidResponse(error.localizedDescription)
            }
        }.value
    }

    private func resolveBinaryURL() throws -> URL {
        let fileManager = FileManager.default
        let environment = ProcessInfo.processInfo.environment

        let candidates = [
            environment["OSB_BRIDGE_BIN"],
            resolveRepoRoot()?.appendingPathComponent(
                "apps/desktop/src-tauri/target/debug/osb_bridge"
            ).path,
            resolveRepoRoot()?.appendingPathComponent(
                "apps/desktop/src-tauri/target/release/osb_bridge"
            ).path
        ]
            .compactMap { $0 }

        for candidate in candidates where fileManager.isExecutableFile(atPath: candidate) {
            return URL(fileURLWithPath: candidate)
        }

        throw MacShellBridgeError.binaryNotFound
    }

    private func resolveRepoRoot() -> URL? {
        let fileManager = FileManager.default
        let environment = ProcessInfo.processInfo.environment

        if let repoRoot = environment["OSB_REPO_ROOT"] {
            return URL(fileURLWithPath: repoRoot, isDirectory: true)
        }

        var candidate = URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)
        for _ in 0..<5 {
            let marker = candidate.appendingPathComponent("apps/desktop/src-tauri/Cargo.toml")
            if fileManager.fileExists(atPath: marker.path) {
                return candidate
            }
            candidate.deleteLastPathComponent()
        }

        return nil
    }
}

private struct BridgeActionRequest: Encodable, Sendable {
    let action: BridgeActionItem
    let result: BridgeResultItem?
}

private struct BridgeRecordSelectionRequest: Encodable, Sendable {
    let itemID: String
    let itemType: String
    let query: String

    private enum CodingKeys: String, CodingKey {
        case itemID = "itemId"
        case itemType
        case query
    }
}

private enum MacShellBridgeError: LocalizedError {
    case binaryNotFound
    case commandFailed(String)
    case emptyResponse
    case invalidResponse(String)

    var errorDescription: String? {
        switch self {
        case .binaryNotFound:
            return "Pulse bridge binary not found. Use the workspace macOS scripts so the shared Rust bridge is built first."
        case .commandFailed(let message):
            if message.isEmpty {
                return "Pulse bridge command failed."
            }
            return "Pulse bridge command failed: \(message)"
        case .emptyResponse:
            return "Pulse bridge returned an empty response."
        case .invalidResponse(let message):
            return "Pulse bridge returned invalid JSON: \(message)"
        }
    }
}
