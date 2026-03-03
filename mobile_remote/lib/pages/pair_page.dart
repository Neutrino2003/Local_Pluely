import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/pairing_payload.dart';
import '../state/remote_state.dart';
import '../widgets/qr_scanner_sheet.dart';
import 'shell_page.dart';

/// Pair/Connect screen — the app always lands here when disconnected.
class PairPage extends StatefulWidget {
  const PairPage({super.key});
  @override
  State<PairPage> createState() => _PairPageState();
}

class _PairPageState extends State<PairPage> {
  final _wsCtrl = TextEditingController();
  final _tokenCtrl = TextEditingController();
  bool _obscureToken = true;

  @override
  void dispose() {
    _wsCtrl.dispose();
    _tokenCtrl.dispose();
    super.dispose();
  }

  void _applyPayload(String rawValue) {
    final p = PairingPayload.tryParse(rawValue);
    if (p == null) {
      _showMsg('Invalid pairing payload.');
      return;
    }
    if (!mounted) return;
    context.read<RemoteState>().applyPairingPayload(p);
    final rs = context.read<RemoteState>();
    _wsCtrl.text = rs.wsUrl;
    _tokenCtrl.text = rs.token;
    _showMsg('Pairing info applied ✓');
  }

  Future<void> _connect() async {
    final rs = context.read<RemoteState>();
    rs.updateManualCredentials(_wsCtrl.text.trim(), _tokenCtrl.text.trim());
    await rs.connect();
    if (!mounted) return;
    if (rs.connected) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(builder: (_) => const ShellPage()),
      );
    } else {
      _showMsg(rs.statusMessage);
    }
  }

  void _showMsg(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final rs = context.watch<RemoteState>();
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const SizedBox(height: 32),
              // ── Logo / title ──────────────────────────────────────────────
              Icon(Icons.computer, size: 64, color: cs.primary),
              const SizedBox(height: 12),
              Text(
                'Pluely Remote',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium!.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                'Control your PC from your phone',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium!.copyWith(
                  color: cs.onSurface.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 40),

              // ── QR scan ───────────────────────────────────────────────────
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  side: BorderSide(color: cs.primary),
                ),
                onPressed: () async {
                  await showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    useSafeArea: true,
                    builder: (_) => QrScannerSheet(onDetected: _applyPayload),
                  );
                },
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan QR Code from Pluely'),
              ),

              const SizedBox(height: 16),
              Row(
                children: <Widget>[
                  Expanded(
                    child: Divider(color: cs.outline.withValues(alpha: 0.4)),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      'or enter manually',
                      style: TextStyle(
                        color: cs.onSurface.withValues(alpha: 0.5),
                        fontSize: 12,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Divider(color: cs.outline.withValues(alpha: 0.4)),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // ── Manual fields ─────────────────────────────────────────────
              TextField(
                controller: _wsCtrl,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'WebSocket URL',
                  hintText: 'ws://192.168.1.x:45777',
                  prefixIcon: Icon(Icons.link),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _tokenCtrl,
                obscureText: _obscureToken,
                decoration: InputDecoration(
                  labelText: 'Pairing Token',
                  prefixIcon: const Icon(Icons.key),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscureToken ? Icons.visibility_off : Icons.visibility,
                    ),
                    onPressed: () =>
                        setState(() => _obscureToken = !_obscureToken),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // ── Connect button ────────────────────────────────────────────
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: rs.connecting ? null : _connect,
                icon: rs.connecting
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.link),
                label: Text(rs.connecting ? 'Connecting…' : 'Connect to PC'),
              ),

              if (rs.statusMessage.isNotEmpty &&
                  rs.statusMessage != 'Not connected') ...<Widget>[
                const SizedBox(height: 12),
                Text(
                  rs.statusMessage,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: cs.onSurface.withValues(alpha: 0.55),
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
