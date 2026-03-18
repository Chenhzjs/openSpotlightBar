// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "PulseLauncherMac",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "PulseLauncherMac", targets: ["PulseLauncherMac"])
    ],
    targets: [
        .executableTarget(
            name: "PulseLauncherMac",
            path: "Sources/PulseLauncherMac"
        ),
        .testTarget(
            name: "PulseLauncherMacTests",
            dependencies: ["PulseLauncherMac"],
            path: "Tests/PulseLauncherMacTests"
        )
    ]
)
