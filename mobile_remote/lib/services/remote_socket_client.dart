import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/remote_response.dart';

class RemoteSocketClient {
  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;

  final StreamController<RemoteResponse> _responsesController =
      StreamController<RemoteResponse>.broadcast();
  final StreamController<bool> _connectionController =
      StreamController<bool>.broadcast();
  final StreamController<String> _statusController =
      StreamController<String>.broadcast();

  Stream<RemoteResponse> get responses => _responsesController.stream;
  Stream<bool> get connectionState => _connectionController.stream;
  Stream<String> get statusMessages => _statusController.stream;

  bool get isConnected => _channel != null;

  Future<void> connect(
    String wsUrl, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final uri = Uri.tryParse(wsUrl.trim());
    if (uri == null || !(uri.isScheme('ws') || uri.isScheme('wss'))) {
      throw const FormatException('Enter a valid ws:// or wss:// URL');
    }

    await disconnect();

    final channel = WebSocketChannel.connect(uri);

    // CRITICAL: Dart's IOWebSocketChannel stream is lazy! It does NOT attempt
    // to connect to the network until someone calls `.listen()` on the stream.
    // If we await `channel.ready` before `listen()`, it hangs forever.
    _subscription = channel.stream.listen(
      (dynamic event) {
        final raw = event is String ? event : event.toString();
        try {
          final response = RemoteResponse.fromJsonString(raw);
          _responsesController.add(response);
        } catch (_) {
          _statusController.add('Received non-JSON message: $raw');
        }
      },
      onError: (Object error) {
        _statusController.add('Socket error: $error');
        _connectionController.add(false);
        _channel = null;
      },
      onDone: () {
        _statusController.add('Socket closed');
        _connectionController.add(false);
        _channel = null;
      },
      cancelOnError: false,
    );

    // Await the actual handshake with the specified timeout.
    // channel.ready throws if the server is unreachable or refuses connection.
    try {
      await channel.ready.timeout(
        timeout,
        onTimeout: () => throw TimeoutException(
          'Could not reach $wsUrl within ${timeout.inSeconds} seconds. '
          'Check that Pluely is running and both devices are on the same network.',
        ),
      );
    } catch (e) {
      // If the handshake fails, we must cancel the subscription we just started
      await _subscription?.cancel();
      _subscription = null;
      rethrow;
    }

    _channel = channel;
    _connectionController.add(true);
    _statusController.add('Connected to $wsUrl');
  }

  void sendCommand({
    required String token,
    required String command,
    bool silent = false,
    String? conversationId,
    String? text,
    List<String>? imagesBase64,
  }) {
    final channel = _channel;
    if (channel == null) {
      throw StateError('Socket is not connected');
    }
    if (token.trim().isEmpty) {
      throw const FormatException('Token is required');
    }

    final payload = <String, dynamic>{
      'token': token.trim(),
      'command': command,
      'requestId': DateTime.now().millisecondsSinceEpoch.toString(),
      if (conversationId case final String id) 'conversationId': id,
      if (text case final String value) 'text': value,
      if (imagesBase64 != null) 'imageBase64': imagesBase64,
    };

    channel.sink.add(jsonEncode(payload));
    if (!silent) {
      _statusController.add('Sent "$command" command');
    }
  }

  Future<void> disconnect() async {
    final channel = _channel;
    _channel = null;

    await _subscription?.cancel();
    _subscription = null;

    if (channel != null) {
      await channel.sink.close();
      _statusController.add('Disconnected');
    }
    _connectionController.add(false);
  }

  Future<void> dispose() async {
    await disconnect();
    await _responsesController.close();
    await _connectionController.close();
    await _statusController.close();
  }
}
