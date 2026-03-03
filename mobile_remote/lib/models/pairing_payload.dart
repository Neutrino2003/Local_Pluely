import 'dart:convert';

class PairingPayload {
  const PairingPayload({
    required this.type,
    required this.token,
    required this.port,
    required this.hosts,
    required this.wsUrls,
    required this.commands,
  });

  final String type;
  final String token;
  final int port;
  final List<String> hosts;
  final List<String> wsUrls;
  final List<String> commands;

  bool get isValid => token.isNotEmpty && wsUrls.isNotEmpty;

  String get preferredWsUrl {
    if (wsUrls.isEmpty) return '';
    return wsUrls.firstWhere(
      (url) => !url.contains('127.0.0.1') && !url.contains('localhost'),
      orElse: () => wsUrls.first,
    );
  }

  static PairingPayload? tryParse(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;

    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
      return PairingPayload(
        type: 'manual-ws-url',
        token: '',
        port: Uri.tryParse(trimmed)?.port ?? 0,
        hosts: const [],
        wsUrls: [trimmed],
        commands: _defaultCommands,
      );
    }

    try {
      final dynamic decoded = jsonDecode(trimmed);
      if (decoded is! Map<String, dynamic>) {
        return null;
      }

      final wsUrls = _readStringList(decoded['wsUrls']);
      final token = _readString(decoded['token']);
      final commands = _readStringList(decoded['commands']);

      if (wsUrls.isEmpty || token.isEmpty) {
        return null;
      }

      return PairingPayload(
        type: _readString(decoded['type'], fallback: 'pluely-remote-v1'),
        token: token,
        port: _readInt(decoded['port']),
        hosts: _readStringList(decoded['hosts']),
        wsUrls: wsUrls,
        commands: commands.isEmpty ? _defaultCommands : commands,
      );
    } catch (_) {
      return null;
    }
  }

  static String _readString(Object? value, {String fallback = ''}) {
    if (value is String) {
      return value.trim();
    }
    return fallback;
  }

  static int _readInt(Object? value) {
    if (value is int) return value;
    if (value is String) return int.tryParse(value) ?? 0;
    if (value is num) return value.toInt();
    return 0;
  }

  static List<String> _readStringList(Object? value) {
    if (value is List) {
      return value
          .whereType<String>()
          .map((item) => item.trim())
          .where((item) => item.isNotEmpty)
          .toList(growable: false);
    }
    return const [];
  }

  static const List<String> _defaultCommands = <String>[
    'ping',
    'screenshot',
    'audio_recording',
    'system_audio',
    'toggle_dashboard',
    'focus_input',
    'toggle_window',
    'get_overlay_state',
    'open_chat_session',
    'get_chat_sessions',
    'get_chat_messages',
    'send_chat_message',
  ];
}
