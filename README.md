# Loom Transcript Extractor

A Safari Web Extension for macOS that extracts transcripts from **Loom** and **Vimeo** videos — including embedded videos on third-party sites like Skool and Notion.

## Features

- **Instant Fetch** — pulls the full transcript immediately via platform APIs
- **Live Capture** — records captions in real-time as the video plays
- **Copy & Save** — copy transcript to clipboard or download as `.txt`
- **Embedded video support** — works on Loom/Vimeo pages, iframe embeds, and link-based embeds (e.g., Skool)
- **Toolbar button** — click the extension icon to activate on any page with an embedded video
- **Draggable UI** — floating transcript window you can move around the page

## Supported Sites

| Site | How it works |
|------|-------------|
| `loom.com/share/*` | Auto-activates, fetches via Loom API |
| `vimeo.com/*` | Auto-activates, fetches via player config / TextTrack API |
| `*.skool.com` | Auto-activates, detects Loom links in page HTML |
| `*.notion.site` | Auto-activates on embedded videos |
| Any other site | Click the toolbar button to activate |

## Installation

### From Source (Xcode)

1. Clone the repo
2. Open `Loom Transcript Extractor.xcodeproj` in Xcode
3. **Product → Archive**
4. **Distribute App → Developer ID** (or **Direct Distribution**)
5. Move the exported `.app` to `/Applications`
6. Open **Safari → Settings → Extensions** and enable **Loom Transcript Extractor**

### For Team Distribution

- **Developers**: Clone the repo and build locally — Xcode uses your own signing identity
- **Non-developers**: Use Developer ID + Notarization to export a signed `.app` and share directly

## Usage

1. Navigate to a page with a Loom or Vimeo video
2. The transcript window appears automatically on supported sites, or click the extension icon in the Safari toolbar
3. Click **Get Full Transcript** for instant extraction, or **Live Capture** to record as the video plays
4. Use **Copy** or **Save** to export the transcript

## Project Structure

```
Loom Transcript Extractor/              macOS container app (settings UI)
├── ViewController.swift                WKWebView + SafariServices integration
├── AppDelegate.swift                   App lifecycle
└── Resources/                          HTML/CSS/JS for settings UI

Loom Transcript Extractor Extension/    Safari Web Extension
├── SafariWebExtensionHandler.swift     Native message handler
└── Resources/
    ├── manifest.json                   Extension manifest (Manifest v3)
    ├── content.js                      Transcript extraction logic
    ├── background.js                   Toolbar button handler
    └── icons/                          Extension icons
```

## How It Works

The extension uses a multi-strategy approach to fetch transcripts, since video platforms serve caption data differently:

**Loom**: Tries REST API endpoints, share page HTML scanning for VTT URLs, GraphQL API queries, page context injection for window globals, and native TextTrack API as fallback.

**Vimeo**: Fetches the player config endpoint for text track VTT URLs, tries direct VTT endpoints, and falls back to the native TextTrack API.

**Embedded videos**: Detects video content via `<video>` elements, `<iframe>` sources, or video platform URLs in the page HTML. Works even when sites use non-standard embedding (e.g., Skool's link-based Loom embeds).

## Requirements

- macOS 26.0+ (Tahoe)
- Safari
- Xcode (for building from source)

## License

MIT
