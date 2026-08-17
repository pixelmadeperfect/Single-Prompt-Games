# AGENTS.md — AI Coding Guidance & Standards

## Project Scope & Output Architecture
- **Single-File Demos:** For HTML5 canvas games, interactive widgets, and quick prototypes, default to outputting code in a single, fully self-contained `index.html` file (embedding CSS in `<style>` and JavaScript in `<script>`).
- **Zero External File Dependencies:** Do not depend on external static assets (`.png`, `.mp3`, `.css`) or third-party CDN libraries unless explicitly requested.

## Audio Standards (Web Audio API)
- **Procedural Sound Synthesis:** Always use the browser's native `AudioContext` (Web Audio API) to synthesize sound effects (beeps, chimes, noise bursts, game-over sounds).
- **No External MP3/WAV Links:** Never hardcode external audio links (e.g., `new Audio('https://...')`) due to CORS, latency, and broken link risks.
- **Audio Lifecycle & Autoplay:** Initialize or resume the `AudioContext` inside a user-gesture handler (e.g., `click` or `keydown`) to comply with browser autoplay policies.

## HTML5 Canvas & Game Loop Conventions
- **Rendering & Pixels:** Use standard requestAnimationFrame loops. Set `imageSmoothingEnabled = false` when rendering retro or pixel-art graphics.
- **Input & Hitboxes:** Calculate mouse and touch hitboxes relative to the canvas element using `getBoundingClientRect()`.
- **UI & HUD Overlay:** Separate gameplay rendering from HUD text (scores, countdown timers). Ensure high-contrast floating feedback text (e.g., `+100`, `-200`) degrades smoothly over time via alpha fading.
- **State Management:** Implement clear game state machines (`IDLE`, `PLAYING`, `GAMEOVER`) with clean reset loops and no memory leaks (clear active timers/intervals on reset).

## Code Style & Implementation
- **JavaScript Standard:** Use modern ES6+ features (`const`/`let`, arrow functions, array methods).
- **CSS Styling:** Use CSS variables for color palettes, zero out default body margins/padding, and center the main canvas viewport using Flexbox or Grid.
- **Error Resilience:** Wrap Web Audio initialization and event binding in defensive checks to prevent runtime canvas freezes.