---
name: verify
description: Build both targets of the Xcode project to verify it compiles cleanly. Use after making code changes to catch build errors.
---

Run the following command to build the project and verify it compiles without errors:

```bash
xcodebuild -project "Loom Transcript Extractor.xcodeproj" -scheme "Loom Transcript Extractor" build 2>&1 | tail -20
```

If the build fails:
1. Read the error output carefully
2. Identify the file and line number causing the issue
3. Fix the error
4. Re-run the build to confirm the fix

Report whether the build succeeded or failed, and summarize any warnings.
