# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Safari Web Extension for macOS that extracts transcripts from Loom videos. Two-target Xcode project:
- **Main App** (`Loom Transcript Extractor/`) — macOS Cocoa container app with WKWebView settings UI
- **Extension** (`Loom Transcript Extractor Extension/`) — Safari Web Extension (Manifest v3) with content script

## Architecture

The extension's `content.js` runs on Loom pages and supports two extraction modes:
- **Instant Fetch** — pulls complete transcript from TextTrack API (waits up to 15s for caption tracks)
- **Live Capture** — polls activeCues every 500ms as video plays, accumulates unique segments

The main app communicates with the extension via `SFSafariExtensionManager` and displays status in a WKWebView loading `Main.html`.

## Build

Standard Xcode build — open `Loom Transcript Extractor.xcodeproj` and build. No external dependencies (SPM, CocoaPods, etc.).

Build from CLI:
```
xcodebuild -project "Loom Transcript Extractor.xcodeproj" -scheme "Loom Transcript Extractor" build
```

## Key Files

- `Loom Transcript Extractor Extension/Resources/content.js` — core transcript extraction logic (394 lines)
- `Loom Transcript Extractor Extension/Resources/manifest.json` — extension permissions and content script matching
- `Loom Transcript Extractor/ViewController.swift` — WKWebView + SafariServices integration
- `Loom Transcript Extractor Extension/SafariWebExtensionHandler.swift` — native message handler

## Extension Permissions

Content script matches (defined in manifest.json):
- `https://www.loom.com/share/*` and `https://www.loom.com/embed/*`
- `https://*.skool.com/*` and `https://*.notion.site/*` (third-party embeds)

## Conventions

- Swift: standard Apple naming conventions, Cocoa delegate patterns
- JavaScript: async/await, ES6+, console logging with emoji indicators for debugging
- No linter or formatter configured yet
