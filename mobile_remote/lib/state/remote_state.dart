import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/pairing_payload.dart';
import '../models/remote_chat_io_event.dart';
import '../models/remote_overlay_state.dart';
import '../models/remote_response.dart';
import '../services/remote_socket_client.dart';

/// A single live message bubble received via chat_io events.
class LiveChatMessage {
  LiveChatMessage({
    required this.direction,
    required this.text,
    required this.conversationId,
    required this.conversationTitle,
    required this.isFinal,
    required this.timestampMs,
  });

  final String direction;
  String text;
  final String? conversationId;
  final String? conversationTitle;
  bool isFinal;
  int timestampMs;
}

/// Central app state — all screens listen to this.
class RemoteState extends ChangeNotifier {
  RemoteState() {
    _client = RemoteSocketClient();
    _init();
  }

  late final RemoteSocketClient _client;
  Timer? _syncTimer;
  Timer? _sessionsTimeoutTimer;
  Timer? _messagesTimeoutTimer;
  StreamSubscription<bool>? _connectionSub;
  StreamSubscription<String>? _statusSub;
  StreamSubscription<RemoteResponse>? _responsesSub;
  bool _isDisposed = false;

  // ── Connection ──────────────────────────────────────────────────────────────
  bool _connected = false;
  bool _connecting = false;
  String _statusMessage = 'Not connected';
  PairingPayload? _pairingPayload;
  String _wsUrl = '';
  String _token = '';

  bool get connected => _connected;
  bool get connecting => _connecting;
  String get statusMessage => _statusMessage;
  PairingPayload? get pairingPayload => _pairingPayload;
  String get wsUrl => _wsUrl;
  String get token => _token;

  // ── Overlay state (mirrors PC) ───────────────────────────────────────────────
  RemoteOverlayState _overlayState = RemoteOverlayState.empty;
  RemoteOverlayState get overlayState => _overlayState;

  // ── Screenshot ──────────────────────────────────────────────────────────────
  String? _lastScreenshotBase64;
  String? get lastScreenshotBase64 => _lastScreenshotBase64;

  // ── Chat sessions ────────────────────────────────────────────────────────────
  List<Map<String, dynamic>> _sessions = [];
  bool _sessionsLoading = false;
  List<Map<String, dynamic>> get sessions => _sessions;
  bool get sessionsLoading => _sessionsLoading;

  // ── Messages for a selected session ─────────────────────────────────────────
  String? _openConversationId;
  Map<String, dynamic>? _openConversation;
  List<Map<String, dynamic>> _messages = [];
  bool _messagesLoading = false;

  String? get openConversationId => _openConversationId;
  Map<String, dynamic>? get openConversation => _openConversation;
  List<Map<String, dynamic>> get messages => _messages;
  bool get messagesLoading => _messagesLoading;

  // ── Live streaming chat I/O (from PC's current conversation) ────────────────
  final List<LiveChatMessage> _liveChat = [];
  List<LiveChatMessage> get liveChat => List.unmodifiable(_liveChat);

  /// Live output bubble for the open conversation, if the AI is still typing.
  LiveChatMessage? get typingBubble {
    if (_openConversationId == null) return null;
    for (final m in _liveChat.reversed) {
      if (m.conversationId == _openConversationId &&
          m.direction == 'output' &&
          !m.isFinal) {
        return m;
      }
    }
    return null;
  }

  // ── init ────────────────────────────────────────────────────────────────────
  void _init() {
    _connectionSub = _client.connectionState.listen((bool connected) {
      if (_isDisposed) return;
      // Only act on disconnections here; connection is handled in connect().
      if (!connected) {
        _connected = false;
        _overlayState = RemoteOverlayState.empty;
        _statusMessage = 'Disconnected';
        _syncTimer?.cancel();
        _syncTimer = null;
        _sessionsTimeoutTimer?.cancel();
        _messagesTimeoutTimer?.cancel();
        if (!_isDisposed) {
          notifyListeners();
        }
      }
    });

    _statusSub = _client.statusMessages.listen((String msg) {
      if (_isDisposed) return;
      _statusMessage = msg;
      if (!_isDisposed) {
        notifyListeners();
      }
    });

    _responsesSub = _client.responses.listen(_handleResponse);
  }

  void _handleResponse(RemoteResponse res) {
    if (_isDisposed) return;
    // Overlay state — update on every response that carries it
    if (res.overlayState != null) {
      _overlayState = res.overlayState!;
    }

    // Screenshot
    if ((res.imageBase64 ?? '').isNotEmpty) {
      _lastScreenshotBase64 = res.imageBase64;
    }

    switch (res.command) {
      case 'chat_io':
        if (res.chatIo != null) _applyLiveChatEvent(res.chatIo!);
        break;

      case 'chat_sessions':
        _sessionsTimeoutTimer?.cancel();
        _sessionsLoading = false;
        final raw = res.chatSessions;
        if (raw is List) {
          final list = raw
              .whereType<Object>()
              .map((e) => _toStringMap(e))
              .whereType<Map<String, dynamic>>()
              .toList();
          list.sort(
            (a, b) => ((b['updatedAt'] as int?) ?? 0).compareTo(
              (a['updatedAt'] as int?) ?? 0,
            ),
          );
          _sessions = list;
        }
        break;

      case 'chat_messages':
        _messagesTimeoutTimer?.cancel();
        _messagesLoading = false;
        final raw2 = res.chatMessages;
        if (raw2 is Map) {
          final smap = _toStringMap(raw2);
          if (smap != null) {
            _openConversation = smap;
            final msgs = smap['messages'];
            _messages = msgs is List
                ? msgs
                      .whereType<Object>()
                      .map((e) => _toStringMap(e))
                      .whereType<Map<String, dynamic>>()
                      .toList()
                : [];
          }
        }
        break;
    }

    if (!_isDisposed) {
      notifyListeners();
    }
  }

  void _applyLiveChatEvent(RemoteChatIoEvent e) {
    final dir = e.direction == 'input' ? 'input' : 'output';

    if (dir == 'output') {
      // Try to append to existing streaming bubble
      final idx = _liveChat.lastIndexWhere(
        (m) =>
            m.direction == 'output' &&
            !m.isFinal &&
            m.conversationId == e.conversationId,
      );
      if (idx != -1) {
        _liveChat[idx].text += e.text;
        _liveChat[idx].isFinal = e.isFinal || _liveChat[idx].isFinal;
        _liveChat[idx].timestampMs = e.timestampMs;
        return;
      }
    }

    if (e.text.isNotEmpty || e.isFinal) {
      _liveChat.insert(
        0,
        LiveChatMessage(
          direction: dir,
          text: e.text,
          conversationId: e.conversationId,
          conversationTitle: e.conversationTitle,
          isFinal: e.isFinal,
          timestampMs: e.timestampMs,
        ),
      );
      if (_liveChat.length > 100) _liveChat.removeRange(100, _liveChat.length);
    }
  }

  // ── Public Actions ───────────────────────────────────────────────────────────

  void applyPairingPayload(PairingPayload payload) {
    _pairingPayload = payload;
    _wsUrl = payload.preferredWsUrl;
    _token = payload.token;
    notifyListeners();
  }

  void updateManualCredentials(String wsUrl, String token) {
    _wsUrl = wsUrl;
    _token = token;
    notifyListeners();
  }

  /// Returns a de-duplicated, ordered list of WebSocket URLs to attempt.
  /// Non-loopback addresses come first (most likely to be reachable from a
  /// phone), loopback / localhost last (useful for local testing only).
  List<String> _urlsToTry() {
    final seen = <String>{};
    final result = <String>[];

    void add(String url) {
      final trimmed = url.trim();
      if (trimmed.isNotEmpty && seen.add(trimmed)) result.add(trimmed);
    }

    // Prefer the full list from the pairing payload (non-loopback first).
    final payload = _pairingPayload;
    if (payload != null) {
      for (final url in payload.wsUrls) {
        if (!url.contains('127.0.0.1') && !url.contains('localhost')) {
          add(url);
        }
      }
      // Loopback entries go last.
      for (final url in payload.wsUrls) {
        if (url.contains('127.0.0.1') || url.contains('localhost')) {
          add(url);
        }
      }
    }

    // Always include the manually-entered URL as a final fallback.
    add(_wsUrl);
    return result;
  }

  Future<void> connect() async {
    final urls = _urlsToTry();
    if (urls.isEmpty || _token.isEmpty) return;

    _connecting = true;
    _statusMessage = 'Connecting…';
    notifyListeners();

    // Try each candidate URL in order, using a short per-URL timeout so we
    // cycle through wrong IPs quickly without making the user wait too long.
    // The Pluely desktop app now includes ALL local IPs in the QR code, so
    // one of them should be reachable on the same network.
    const perUrlTimeout = Duration(seconds: 6);
    dynamic lastError;

    for (final url in urls) {
      try {
        _statusMessage = 'Trying $url…';
        if (!_isDisposed) notifyListeners();

        await _client.connect(url, timeout: perUrlTimeout);

        // Success — record which URL worked.
        _wsUrl = url;
        _connected = true;
        _connecting = false;
        _statusMessage = 'Connected';
        notifyListeners();

        _sendCommand('get_overlay_state', silent: true);
        // Pre-fetch sessions so the Chats tab loads instantly.
        fetchSessions();
        // Second overlay-state ping after 1.5 s in case the first was dropped.
        Future<void>.delayed(const Duration(milliseconds: 1500)).then((_) {
          if (_connected) _sendCommand('get_overlay_state', silent: true);
        });
        _startSync();
        return; // Done — skip remaining candidates.
      } catch (e) {
        lastError = e;
        // Connection attempt failed; try the next URL.
      }
    }

    // All URLs failed.
    _connected = false;
    _connecting = false;
    _statusMessage = 'Failed: $lastError';
    notifyListeners();
  }

  Future<void> disconnect() async {
    _syncTimer?.cancel();
    _syncTimer = null;
    await _client.disconnect();
    _connected = false;
    _overlayState = RemoteOverlayState.empty;
    _statusMessage = 'Disconnected';
    notifyListeners();
  }

  void _startSync() {
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_connected) _sendCommand('get_overlay_state', silent: true);
    });
  }

  // ── PC controls ──────────────────────────────────────────────────────────────
  void sendPing() => _sendCommand('ping');
  void toggleStt() => _sendCommand('audio_recording');
  void toggleSystemAudio() => _sendCommand('system_audio');
  void toggleDashboard() => _sendCommand('toggle_dashboard');
  void focusInput() => _sendCommand('focus_input');
  void toggleWindow() => _sendCommand('toggle_window');
  void requestScreenshot() => _sendCommand('screenshot');

  // ── Chat actions ─────────────────────────────────────────────────────────────
  void fetchSessions() {
    if (!_connected) return;
    _sessionsLoading = true;
    notifyListeners();
    _sendCommand('get_chat_sessions', silent: true);
    // Timeout guard — stop spinner after 10s if no response comes back
    _sessionsTimeoutTimer?.cancel();
    _sessionsTimeoutTimer = Timer(const Duration(seconds: 10), () {
      if (_sessionsLoading) {
        _sessionsLoading = false;
        _statusMessage = 'Chat sessions request timed out';
        notifyListeners();
      }
    });
  }

  void openSession(String conversationId) {
    _openConversationId = conversationId;
    _openConversation = null;
    _messages = [];
    _messagesLoading = true;
    notifyListeners();
    _sendCommand(
      'open_chat_session',
      conversationId: conversationId,
      silent: true,
    );
    _client.sendCommand(
      token: _token,
      command: 'get_chat_messages',
      conversationId: conversationId,
      silent: true,
    );
    // Timeout guard — stop spinner after 10s if no response comes back
    _messagesTimeoutTimer?.cancel();
    _messagesTimeoutTimer = Timer(const Duration(seconds: 10), () {
      if (_messagesLoading) {
        _messagesLoading = false;
        _statusMessage = 'Messages request timed out';
        notifyListeners();
      }
    });
  }

  void closeSession() {
    _openConversationId = null;
    _openConversation = null;
    _messages = [];
    notifyListeners();
  }

  void sendChatMessage(String text) {
    if (text.trim().isEmpty || _openConversationId == null) return;
    // Optimistic UI
    _messages = [
      ..._messages,
      <String, dynamic>{
        'role': 'user',
        'content': text.trim(),
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      },
    ];
    notifyListeners();
    _client.sendCommand(
      token: _token,
      command: 'send_chat_message',
      text: text.trim(),
      conversationId: _openConversationId,
      silent: true,
    );
  }

  /// Send a message to a specific (or the most recent) conversation without
  /// having opened a ChatPage first. Used by the Controls tab quick-chat bar.
  void sendQuickMessage(String text, {String? conversationId}) {
    final targetId =
        conversationId ??
        _openConversationId ??
        (_sessions.isNotEmpty ? _sessions.first['id']?.toString() : null);
    if (text.trim().isEmpty || targetId == null) return;
    _client.sendCommand(
      token: _token,
      command: 'send_chat_message',
      text: text.trim(),
      conversationId: targetId,
      silent: true,
    );
  }

  /// Start a new conversation from the mobile app.
  void startNewConversation(String text) {
    if (text.trim().isEmpty || !_connected) return;
    _client.sendCommand(
      token: _token,
      command: 'send_chat_message',
      text: text.trim(),
      conversationId: 'new',
      silent: true,
    );
    // Refresh sessions after a short delay to pick up the new one
    Future<void>.delayed(const Duration(seconds: 3)).then((_) {
      if (_connected) fetchSessions();
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────────
  void _sendCommand(
    String cmd, {
    bool silent = false,
    String? conversationId,
    String? text,
  }) {
    if (_token.isEmpty) return;
    try {
      _client.sendCommand(
        token: _token,
        command: cmd,
        silent: silent,
        conversationId: conversationId,
        text: text,
      );
    } catch (_) {}
  }

  @override
  void dispose() {
    _isDisposed = true;
    _syncTimer?.cancel();
    _sessionsTimeoutTimer?.cancel();
    _messagesTimeoutTimer?.cancel();
    _connectionSub?.cancel();
    _statusSub?.cancel();
    _responsesSub?.cancel();
    unawaited(_client.dispose());
    super.dispose();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /// Safely converts any map (including `Map<dynamic, dynamic>` from JSON decode)
  /// to `Map<String, dynamic>`. Returns null if the input is not a map.
  static Map<String, dynamic>? _toStringMap(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v));
    }
    return null;
  }
}
