import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/remote_state.dart';
import 'chat_page.dart';

/// PC remote controls + overlay state mirror + quick chat + live chat feed.
class ControlsPage extends StatefulWidget {
  const ControlsPage({super.key});
  @override
  State<ControlsPage> createState() => _ControlsPageState();
}

class _ControlsPageState extends State<ControlsPage> {
  final _quickChatCtrl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _quickChatCtrl.dispose();
    super.dispose();
  }

  void _send(RemoteState rs) {
    final text = _quickChatCtrl.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    // If sessions loaded, send to active conversation; otherwise start new.
    if (rs.openConversationId != null || rs.sessions.isNotEmpty) {
      rs.sendQuickMessage(text);
    } else {
      rs.startNewConversation(text);
    }
    _quickChatCtrl.clear();
    setState(() => _sending = true);
    Future<void>.delayed(
      const Duration(milliseconds: 600),
      () => setState(() => _sending = false),
    );
  }

  void _openConversationFromLiveFeed(
    BuildContext context,
    RemoteState rs,
    LiveChatMessage m,
  ) {
    if (m.conversationId == null || m.conversationId!.isEmpty) return;
    HapticFeedback.mediumImpact();
    rs.openSession(m.conversationId!);
    Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ChatPage(
          conversationId: m.conversationId!,
          title: m.conversationTitle ?? 'Conversation',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final rs = context.watch<RemoteState>();
    final ov = rs.overlayState;
    final cs = Theme.of(context).colorScheme;

    // Quick chat is always enabled when connected — even without sessions,
    // the user can start a new conversation.
    final bool canChat = rs.connected;

    return Scaffold(
      body: CustomScrollView(
        slivers: <Widget>[
          SliverAppBar.large(
            title: const Text('Remote Controls'),
            actions: <Widget>[
              IconButton(
                onPressed: rs.disconnect,
                icon: const Icon(Icons.link_off),
                tooltip: 'Disconnect',
              ),
            ],
          ),

          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            sliver: SliverList.list(
              children: <Widget>[
                // ── Overlay State Mirror ──────────────────────────────────────
                _SectionHeader('Overlay State', icon: Icons.monitor),
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: <Widget>[
                            _ToggleTile(
                              label: 'STT',
                              active: ov.sttEnabled,
                              activeIcon: Icons.mic,
                              inactiveIcon: Icons.mic_off,
                              onTap: rs.toggleStt,
                            ),
                            _ToggleTile(
                              label: 'System Audio',
                              active: ov.systemAudioCapturing,
                              activeIcon: Icons.hearing,
                              inactiveIcon: Icons.hearing_disabled,
                              onTap: rs.toggleSystemAudio,
                            ),
                            _ToggleTile(
                              label: 'Overlay',
                              active: ov.mainWindowVisible,
                              activeIcon: Icons.visibility,
                              inactiveIcon: Icons.visibility_off,
                              onTap: rs.toggleWindow,
                            ),
                            _ToggleTile(
                              label: 'Dashboard',
                              active: ov.dashboardVisible,
                              activeIcon: Icons.dashboard,
                              inactiveIcon: Icons.dashboard_outlined,
                              onTap: rs.toggleDashboard,
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        // Subtle "syncing" indicator
                        Row(
                          children: <Widget>[
                            Icon(
                              Icons.sync,
                              size: 12,
                              color: cs.onSurface.withValues(alpha: 0.35),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Syncs every 3 s — tap a tile to toggle on PC',
                              style: TextStyle(
                                fontSize: 11,
                                color: cs.onSurface.withValues(alpha: 0.35),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // ── Quick Actions ─────────────────────────────────────────────
                _SectionHeader('Quick Actions', icon: Icons.flash_on),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: <Widget>[
                    _ActionButton(
                      icon: Icons.wifi_tethering,
                      label: 'Ping',
                      onTap: rs.sendPing,
                    ),
                    _ActionButton(
                      icon: Icons.screenshot_monitor,
                      label: 'Screenshot',
                      onTap: rs.requestScreenshot,
                    ),
                    _ActionButton(
                      icon: Icons.image_search,
                      label: 'Fetch Screen',
                      onTap: rs.getScreenshot,
                    ),
                    _ActionButton(
                      icon: Icons.edit_note,
                      label: 'Focus Input',
                      onTap: rs.focusInput,
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // ── Quick Chat ────────────────────────────────────────────────
                _SectionHeader('Quick Chat', icon: Icons.send),
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          canChat
                              ? 'Type a message — it will be sent to the active conversation on your PC.'
                              : 'Connect to your PC first to start chatting.',
                          style: TextStyle(
                            fontSize: 12,
                            color: cs.onSurface.withValues(alpha: 0.5),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: <Widget>[
                            Expanded(
                              child: TextField(
                                controller: _quickChatCtrl,
                                enabled: canChat,
                                minLines: 1,
                                maxLines: 4,
                                textInputAction: TextInputAction.send,
                                onSubmitted: (_) => _send(rs),
                                decoration: InputDecoration(
                                  hintText: canChat
                                      ? 'Message your PC…'
                                      : 'Not connected',
                                  filled: true,
                                  fillColor: cs.surfaceContainerHighest,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(20),
                                    borderSide: BorderSide.none,
                                  ),
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 10,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton.filled(
                              style: IconButton.styleFrom(
                                backgroundColor: canChat
                                    ? cs.primary
                                    : cs.outline,
                                foregroundColor: cs.onPrimary,
                              ),
                              onPressed: canChat && !_sending
                                  ? () => _send(rs)
                                  : null,
                              icon: _sending
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
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // ── Last Screenshot ───────────────────────────────────────────
                if (rs.lastScreenshotBase64 != null) ...<Widget>[
                  _SectionHeader('Last Screenshot', icon: Icons.image),
                  const SizedBox(height: 8),
                  _ScreenshotPreview(base64: rs.lastScreenshotBase64!),
                  const SizedBox(height: 16),
                ],

                // ── Live Chat Feed ────────────────────────────────────────────
                _SectionHeader('Live Chat Feed', icon: Icons.chat),
                const SizedBox(height: 4),
                Text(
                  'Tap any message to open that conversation.',
                  style: TextStyle(
                    fontSize: 11,
                    color: cs.onSurface.withValues(alpha: 0.35),
                  ),
                ),
                const SizedBox(height: 8),
                if (rs.liveChat.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Chat activity from your PC will stream here in real time.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: cs.onSurface.withValues(alpha: 0.45),
                        ),
                      ),
                    ),
                  )
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: rs.liveChat.length,
                    separatorBuilder: (_, int index) =>
                        const SizedBox(height: 8),
                    itemBuilder: (_, int i) {
                      final m = rs.liveChat[i];
                      final isInput = m.direction == 'input';
                      final hasCid =
                          m.conversationId != null &&
                          m.conversationId!.isNotEmpty;
                      return Material(
                        color: Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(12),
                          onTap: hasCid
                              ? () => _openConversationFromLiveFeed(
                                  context,
                                  rs,
                                  m,
                                )
                              : null,
                          child: Ink(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isInput
                                  ? cs.primaryContainer.withValues(alpha: 0.35)
                                  : cs.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(12),
                              border: isInput
                                  ? Border.all(
                                      color: cs.primary.withValues(alpha: 0.4),
                                    )
                                  : null,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Row(
                                  children: <Widget>[
                                    Icon(
                                      isInput ? Icons.person : Icons.smart_toy,
                                      size: 13,
                                      color: cs.onSurface.withValues(
                                        alpha: 0.5,
                                      ),
                                    ),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        isInput
                                            ? 'You'
                                            : (m.conversationTitle ?? 'AI'),
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: cs.onSurface.withValues(
                                            alpha: 0.5,
                                          ),
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    if (!m.isFinal) ...<Widget>[
                                      const SizedBox(width: 6),
                                      SizedBox.square(
                                        dimension: 10,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                          color: cs.primary,
                                        ),
                                      ),
                                    ],
                                    if (hasCid) ...<Widget>[
                                      const SizedBox(width: 4),
                                      Icon(
                                        Icons.chevron_right,
                                        size: 14,
                                        color: cs.onSurface.withValues(
                                          alpha: 0.3,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  m.text.isEmpty ? '…' : m.text,
                                  style: const TextStyle(fontSize: 13),
                                  maxLines: 4,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title, {required this.icon});
  final String title;
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: <Widget>[
        Icon(icon, size: 16, color: cs.primary),
        const SizedBox(width: 6),
        Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 13,
            color: cs.primary,
          ),
        ),
      ],
    );
  }
}

class _ToggleTile extends StatelessWidget {
  const _ToggleTile({
    required this.label,
    required this.active,
    required this.activeIcon,
    required this.inactiveIcon,
    required this.onTap,
  });
  final String label;
  final bool active;
  final IconData activeIcon;
  final IconData inactiveIcon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: active ? cs.primaryContainer : cs.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: active
                ? cs.primary.withValues(alpha: 0.6)
                : cs.outline.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              active ? activeIcon : inactiveIcon,
              size: 18,
              color: active ? cs.primary : cs.onSurface.withValues(alpha: 0.5),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: active ? FontWeight.w700 : FontWeight.normal,
                color: active
                    ? cs.onPrimaryContainer
                    : cs.onSurface.withValues(alpha: 0.65),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FilledButton.tonalIcon(
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      ),
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
    );
  }
}

class _ScreenshotPreview extends StatelessWidget {
  const _ScreenshotPreview({required this.base64});
  final String base64;

  @override
  Widget build(BuildContext context) {
    Uint8List? bytes;
    try {
      bytes = base64Decode(base64);
    } catch (_) {}
    if (bytes == null) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.memory(bytes, fit: BoxFit.contain),
    );
  }
}
