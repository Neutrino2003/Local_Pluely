# Flutter Mobile Remote (Local LAN/Hotspot)

This project now exposes a local remote-control WebSocket server from `Dev Space -> Mobile Remote Control`.

## Pairing

1. Open `Dev Space -> Mobile Remote Control`.
2. Click `Start`.
3. Scan the QR from Flutter, or read the values manually:
   - `ws://<pc-local-ip>:<port>`
   - `token`

Both devices must be on the same reachable network:
- same Wi-Fi, or
- one device hosting hotspot and the other connected to it.

## WebSocket Request Format

Send JSON text messages:

```json
{
  "token": "PAIRING_TOKEN",
  "command": "screenshot",
  "requestId": "mobile-1"
}
```

Supported commands:
- `ping`
- `screenshot`
- `audio_recording` (toggle STT/mic overlay input)
- `system_audio` (toggle system-audio capture)
- `toggle_dashboard` (open/close chat sessions window)
- `focus_input` (focus overlay text input)
- `toggle_window` (show/hide overlay window)
- `get_overlay_state` (return synced overlay state)

## WebSocket Response Format

```json
{
  "ok": true,
  "command": "screenshot",
  "message": "Screenshot captured",
  "requestId": "mobile-1",
  "imageBase64": "...",
  "overlayState": {
    "sttEnabled": false,
    "systemAudioCapturing": false,
    "mainWindowVisible": true,
    "dashboardVisible": false
  }
}
```

## Minimal Flutter Client

```dart
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class PluelyRemoteClient {
  final String wsUrl;
  final String token;
  late final WebSocketChannel _channel;

  PluelyRemoteClient({required this.wsUrl, required this.token});

  void connect(void Function(Map<String, dynamic>) onMessage) {
    _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    _channel.stream.listen((raw) {
      final data = jsonDecode(raw as String) as Map<String, dynamic>;
      onMessage(data);
    });
  }

  void ping() {
    _channel.sink.add(jsonEncode({
      "token": token,
      "command": "ping",
      "requestId": DateTime.now().millisecondsSinceEpoch.toString(),
    }));
  }

  void captureScreenshot() {
    _channel.sink.add(jsonEncode({
      "token": token,
      "command": "screenshot",
      "requestId": DateTime.now().millisecondsSinceEpoch.toString(),
    }));
  }

  void dispose() {
    _channel.sink.close();
  }
}
```
