class RemoteChatIoEvent {
  const RemoteChatIoEvent({
    required this.direction,
    required this.text,
    required this.conversationId,
    required this.conversationTitle,
    required this.isFinal,
    required this.timestampMs,
  });

  final String direction;
  final String text;
  final String? conversationId;
  final String? conversationTitle;
  final bool isFinal;
  final int timestampMs;

  factory RemoteChatIoEvent.fromJson(Map<String, dynamic> json) {
    return RemoteChatIoEvent(
      direction: json['direction']?.toString() ?? 'output',
      text: json['text']?.toString() ?? '',
      conversationId: json['conversationId']?.toString(),
      conversationTitle: json['conversationTitle']?.toString(),
      isFinal: json['isFinal'] == true,
      timestampMs: _toInt(json['timestampMs']),
    );
  }

  static int _toInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value) ?? 0;
    return 0;
  }
}
