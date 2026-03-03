import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/remote_state.dart';

/// Full conversation view with message history + live typing + chat input.
class ChatPage extends StatefulWidget {
  const ChatPage({
    super.key,
    required this.conversationId,
    required this.title,
  });
  final String conversationId;
  final String title;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _isSending = false;

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _send() {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    context.read<RemoteState>().sendChatMessage(text);
    _inputCtrl.clear();
    setState(() => _isSending = true);
    // After AI starts responding the typing bubble appears; reset flag.
    Future.delayed(
      const Duration(milliseconds: 800),
      () => setState(() => _isSending = false),
    );
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final rs = context.watch<RemoteState>();
    final cs = Theme.of(context).colorScheme;
    final messages = rs.messages;
    final typing = rs.typingBubble;

    // Scroll to bottom whenever messages or typing bubble changes
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.title,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.screenshot_monitor),
            tooltip: 'Screenshot PC',
            onPressed: () {
              rs.requestScreenshot();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Screenshot triggered on PC')),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: <Widget>[
          // ── Messages ────────────────────────────────────────────────────────
          Expanded(
            child: messages.isEmpty && typing == null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        if (rs.messagesLoading)
                          const CircularProgressIndicator()
                        else ...<Widget>[
                          Icon(
                            Icons.chat_bubble_outline,
                            size: 48,
                            color: cs.onSurface.withValues(alpha: 0.25),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No messages',
                            style: TextStyle(
                              color: cs.onSurface.withValues(alpha: 0.4),
                            ),
                          ),
                        ],
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    itemCount: messages.length + (typing != null ? 1 : 0),
                    itemBuilder: (BuildContext context, int index) {
                      // Typing bubble at the end
                      if (index == messages.length && typing != null) {
                        return _MessageBubble(
                          isUser: false,
                          text: typing.text.isEmpty ? '…' : typing.text,
                          isTyping: true,
                          cs: cs,
                        );
                      }

                      final msg = messages[index];
                      final isUser = msg['role']?.toString() == 'user';
                      final content = msg['content']?.toString() ?? '';
                      return _MessageBubble(
                        isUser: isUser,
                        text: content,
                        isTyping: false,
                        cs: cs,
                      );
                    },
                  ),
          ),

          // ── Input bar ────────────────────────────────────────────────────────
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: BoxDecoration(
                color: cs.surface,
                border: Border(
                  top: BorderSide(color: cs.outline.withValues(alpha: 0.2)),
                ),
              ),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: TextField(
                      controller: _inputCtrl,
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: InputDecoration(
                        hintText: 'Message PC…',
                        filled: true,
                        fillColor: cs.surfaceContainerHighest,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    style: IconButton.styleFrom(
                      backgroundColor: cs.primary,
                      foregroundColor: cs.onPrimary,
                    ),
                    onPressed: _isSending ? null : _send,
                    icon: _isSending
                        ? SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: cs.onPrimary,
                            ),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Message bubble ────────────────────────────────────────────────────────────

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.isUser,
    required this.text,
    required this.isTyping,
    required this.cs,
  });

  final bool isUser;
  final String text;
  final bool isTyping;
  final ColorScheme cs;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(
          top: 4,
          bottom: 4,
          left: isUser ? 48 : 0,
          right: isUser ? 0 : 48,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isUser ? cs.primary : cs.surfaceContainerHigh,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(isUser ? 18 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 18),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            Flexible(
              child: Text(
                text,
                style: TextStyle(
                  color: isUser ? cs.onPrimary : cs.onSurface,
                  fontSize: 14.5,
                ),
              ),
            ),
            if (isTyping) ...<Widget>[
              const SizedBox(width: 8),
              SizedBox.square(
                dimension: 12,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: cs.primary,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
