import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/remote_state.dart';
import 'controls_page.dart';
import 'sessions_page.dart';
import 'pair_page.dart';

/// Root shell after connection — houses the bottom nav bar.
class ShellPage extends StatefulWidget {
  const ShellPage({super.key});
  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  int _tab = 0;

  static const _pages = <Widget>[ControlsPage(), SessionsPage()];
  static const _labels = <String>['Controls', 'Chats'];
  static const _icons = <IconData>[Icons.settings_remote, Icons.chat_outlined];

  @override
  Widget build(BuildContext context) {
    final rs = context.watch<RemoteState>();

    // Kicked back to pair page if disconnected
    if (!rs.connected && !rs.connecting) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(builder: (_) => const PairPage()),
        );
      });
    }

    return Scaffold(
      body: _pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          if (i == 1) rs.fetchSessions();
        },
        destinations: List.generate(
          _labels.length,
          (i) =>
              NavigationDestination(icon: Icon(_icons[i]), label: _labels[i]),
        ),
      ),
    );
  }
}
