class RemoteOverlayState {
  const RemoteOverlayState({
    required this.sttEnabled,
    required this.systemAudioCapturing,
    required this.mainWindowVisible,
    required this.dashboardVisible,
  });

  final bool sttEnabled;
  final bool systemAudioCapturing;
  final bool mainWindowVisible;
  final bool dashboardVisible;

  static const RemoteOverlayState empty = RemoteOverlayState(
    sttEnabled: false,
    systemAudioCapturing: false,
    mainWindowVisible: false,
    dashboardVisible: false,
  );

  factory RemoteOverlayState.fromJson(Map<String, dynamic> json) {
    return RemoteOverlayState(
      sttEnabled: json['sttEnabled'] == true,
      systemAudioCapturing: json['systemAudioCapturing'] == true,
      mainWindowVisible: json['mainWindowVisible'] == true,
      dashboardVisible: json['dashboardVisible'] == true,
    );
  }
}
