import 'dart:convert';

import 'remote_chat_io_event.dart';
import 'remote_overlay_state.dart';

class RemoteResponse {
  const RemoteResponse({
    required this.ok,
    required this.command,
    required this.message,
    required this.requestId,
    required this.imageBase64,
    required this.overlayState,
    required this.chatIo,
    this.chatSessions,
    this.chatMessages,
    required this.rawJson,
  });

  final bool ok;
  final String command;
  final String message;
  final String? requestId;
  final String? imageBase64;
  final RemoteOverlayState? overlayState;
  final RemoteChatIoEvent? chatIo;
  final dynamic chatSessions;
  final dynamic chatMessages;
  final Map<String, dynamic> rawJson;

  factory RemoteResponse.fromJsonString(String source) {
    final dynamic decoded = jsonDecode(source);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Response is not a JSON object');
    }

    final overlayStateJson = decoded['overlayState'];
    final chatIoJson = decoded['chatIo'];
    return RemoteResponse(
      ok: decoded['ok'] == true,
      command: decoded['command']?.toString() ?? 'unknown',
      message: decoded['message']?.toString() ?? '',
      requestId: decoded['requestId']?.toString(),
      imageBase64: decoded['imageBase64']?.toString(),
      overlayState: overlayStateJson is Map<String, dynamic>
          ? RemoteOverlayState.fromJson(overlayStateJson)
          : null,
      chatIo: chatIoJson is Map<String, dynamic>
          ? RemoteChatIoEvent.fromJson(chatIoJson)
          : null,
      chatSessions: decoded['chatSessions'],
      chatMessages: decoded['chatMessages'],
      rawJson: decoded,
    );
  }
}
