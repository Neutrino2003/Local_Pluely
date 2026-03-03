import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'state/remote_state.dart';
import 'pages/pair_page.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => RemoteState(),
      child: const PluelyRemoteApp(),
    ),
  );
}

class PluelyRemoteApp extends StatelessWidget {
  const PluelyRemoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pluely Remote',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF00C6A2)),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF00C6A2),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      themeMode: ThemeMode.dark,
      home: const PairPage(),
    );
  }
}
