# Cheese School for Android

This repository now contains a native Android app in `app/`. It uses Kotlin and Android SDK classes only: a custom `View`, `Canvas` ray-casting, `AlertDialog`, touch input, and Android text-to-speech. It does not embed the website in a `WebView`.

## Open and run

1. Open the repository root in Android Studio.
2. Allow Android Studio to sync the Gradle project and install Android SDK 35 if prompted.
3. Run the `app` configuration on an Android 7.0 (API 24) or newer device or emulator.

The game is locked to landscape. A physical device is recommended for the multitouch move/look/run controls.

## Project structure

- `MainActivity.kt` owns immersive mode, the native math dialog, and text-to-speech.
- `GameView.kt` renders the first-person world and handles multitouch controls.
- `GameEngine.kt` contains gameplay, collision, pathfinding, inventory, stamina, vending, and win/loss state.
- `SchoolMap.kt` defines the hallway and classroom grid.
- Existing artwork is packaged in `app/src/main/res/drawable/`.

The root web files remain because this hosted workspace requires `index.html` as its live-preview entrypoint; they are not used by the Android app.
