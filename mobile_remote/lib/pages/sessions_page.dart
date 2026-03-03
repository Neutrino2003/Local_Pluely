import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/remote_state.dart';
import 'chat_page.dart';

/// Lists all PC chat sessions; tap one to open the chat view.
class SessionsPage extends StatelessWidget {
  const SessionsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final rs = context.watch<RemoteState>();
    final cs = Theme.of(context).colorScheme;

    return CustomScrollView(
      slivers: <Widget>[
        SliverAppBar.large(
          title: const Text('Chat History'),
          actions: <Widget>[
            IconButton(
              icon: const Icon(Icons.refresh),
              tooltip: 'Refresh',
              onPressed: rs.fetchSessions,
            ),
          ],
        ),

        if (rs.sessionsLoading)
          const SliverFillRemaining(
            child: Center(child: CircularProgressIndicator()),
          )
        else if (rs.sessions.isEmpty)
          SliverFillRemaining(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  Icon(
                    Icons.forum_outlined,
                    size: 56,
                    color: cs.onSurface.withValues(alpha: 0.25),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'No sessions yet',
                    style: TextStyle(
                      color: cs.onSurface.withValues(alpha: 0.45),
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: rs.fetchSessions,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Tap to load'),
                  ),
                ],
              ),
            ),
          )
        else
          SliverList.separated(
            itemCount: rs.sessions.length,
            separatorBuilder: (_, int index) =>
                Divider(height: 1, color: cs.outline.withValues(alpha: 0.15)),
            itemBuilder: (BuildContext context, int index) {
              final session = rs.sessions[index];
              final title = session['title']?.toString() ?? 'Conversation';
              final ts = (session['updatedAt'] as int?) ?? 0;
              final date = DateTime.fromMillisecondsSinceEpoch(ts);
              final id = session['id']?.toString() ?? '';

              return ListTile(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 6,
                ),
                leading: CircleAvatar(
                  backgroundColor: cs.primaryContainer.withValues(alpha: 0.6),
                  child: Text(
                    title.isNotEmpty ? title[0].toUpperCase() : '?',
                    style: TextStyle(
                      color: cs.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                title: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  _formatDate(date),
                  style: TextStyle(
                    fontSize: 12,
                    color: cs.onSurface.withValues(alpha: 0.5),
                  ),
                ),
                trailing: Icon(
                  Icons.chevron_right,
                  color: cs.onSurface.withValues(alpha: 0.35),
                ),
                onTap: () {
                  rs.openSession(id);
                  Navigator.push<void>(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          ChatPage(conversationId: id, title: title),
                    ),
                  );
                },
              );
            },
          ),
      ],
    );
  }

  String _formatDate(DateTime d) {
    final now = DateTime.now();
    final diff = now.difference(d);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${d.month}/${d.day}/${d.year}';
  }
}
