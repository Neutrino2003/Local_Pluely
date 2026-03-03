import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_remote/main.dart';
import 'package:mobile_remote/state/remote_state.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => RemoteState(),
        child: const PluelyRemoteApp(),
      ),
    );
    await tester.pump();
  });
}
