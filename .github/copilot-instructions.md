# Pluely AI Coding Agent Instructions

## Big Picture Architecture
- **Frontend:** React + TypeScript (src/), Tauri (Rust) backend (src-tauri/), Flutter mobile client (mobile_remote/).
- **Desktop App:** Uses Tauri for native performance, React for UI, Rust for backend services (WebSocket, SQLite, system integration).
- **Mobile App:** Flutter client connects via WebSocket for remote control and pairing.
- **Data Flow:** Local SQLite for chat history, settings in localStorage, direct API calls to AI/STT providers (no proxy/middleware).
- **Privacy:** All user data and settings are stored locally; no telemetry or server-side data collection.

## Developer Workflows
- **Install:** `npm install` (Node.js v18+, Rust stable required)
- **Dev Server:** `npm run tauri dev` (runs frontend + backend)
- **Build:** `npm run tauri build` (creates platform installers in src-tauri/target/release/bundle/)
- **Mobile:** Flutter app in mobile_remote/ (see its README for build/run)
- **Rust Backend:** Use Cargo for backend-only dev (`cargo check`, `cargo build` in src-tauri/)
- **Testing:** No formal test suite; bugfixes and improvements only (see README contribution section)

## Project-Specific Conventions
- **Custom AI/STT Providers:** Configured via curl templates in Dev Space; dynamic variables like `{{TEXT}}`, `{{AUDIO}}`, `{{API_KEY}}` auto-replaced.
- **React Hooks:** Always call hooks unconditionally (see src/pages/dev/components/*/CreateEditProvider.tsx for correct pattern).
- **Network Discovery:** Rust backend enumerates all local IPs for pairing; mobile client tries all wsUrls with fallback and per-URL timeout.
- **Keyboard Shortcuts:** Defined in src/config/shortcuts.ts and README; customizable in-app.
- **Overlay Window:** Always-on-top, translucent, invisible in screen shares/recordings (see README for stealth design).

## Integration Points & Dependencies
- **AI Providers:** OpenAI, Anthropic, Google, xAI, Mistral, Cohere, Perplexity, Groq, Ollama, or custom endpoints.
- **STT Providers:** Whisper, ElevenLabs, Groq, Deepgram, Azure, Google, etc. (customizable via curl).
- **Rust:** Uses tokio, tauri, tokio-tungstenite, if-addrs for networking.
- **Flutter:** Uses web_socket_channel, provider, mobile_scanner.
- **SQLite:** Local chat history (desktop only).

## Key Files & Directories
- **src-tauri/src/remote_control.rs:** WebSocket server, IP discovery logic.
- **src/pages/dev/components/ai-configs/CreateEditProvider.tsx:** Custom AI provider config pattern.
- **src/pages/dev/components/stt-configs/CreateEditProvider.tsx:** Custom STT provider config pattern.
- **src/config/shortcuts.ts:** Keyboard shortcut definitions.
- **mobile_remote/lib/services/remote_socket_client.dart:** Mobile WebSocket client logic.
- **mobile_remote/lib/state/remote_state.dart:** Mobile connection fallback logic.
- **README.md:** Full feature, build, and contribution details.

## Examples
- **Custom AI Provider (Dev Space):**
  ```bash
  curl -X POST https://api.example.com/v1/chat/completions \
    -H "Authorization: Bearer {{API_KEY}}" \
    -H "Content-Type: application/json" \
    -d '{"model": "{{MODEL}}", "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": "{{TEXT}}"}]}'
  ```
- **Custom STT Provider (Dev Space):**
  ```bash
  curl -X POST https://api.example.com/v1/audio/transcriptions \
    -H "Authorization: Bearer {{API_KEY}}" \
    -H "Content-Type: multipart/form-data" \
    -F "file={{AUDIO}}" \
    -F "model=whisper-1"
  ```

---

For unclear or missing conventions, ask the user for clarification or examples from recent code changes.
