use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

const DEFAULT_REMOTE_PORT: u16 = 45777;
const SUPPORTED_REMOTE_COMMANDS: &[&str] = &[
    "ping",
    "screenshot",
    "audio_recording",
    "system_audio",
    "toggle_dashboard",
    "focus_input",
    "toggle_window",
    "get_overlay_state",
    "open_chat_session",
    "get_chat_sessions",
    "get_chat_messages",
    "send_chat_message",
    "get_screenshot",
];

#[derive(Default)]
pub struct OverlaySyncState {
    pub stt_enabled: bool,
    pub system_audio_capturing: bool,
}

#[derive(Default)]
pub struct RemoteControlState {
    pub server_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    pub pair_token: Arc<Mutex<String>>,
    pub port: Arc<Mutex<u16>>,
    pub overlay_sync: Arc<Mutex<OverlaySyncState>>,
    pub client_channels: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<String>>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePairingInfo {
    pub running: bool,
    pub port: u16,
    pub token: String,
    pub hosts: Vec<String>,
    pub ws_urls: Vec<String>,
    pub qr_payload: String,
    pub commands: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RemoteOverlayState {
    stt_enabled: bool,
    system_audio_capturing: bool,
    main_window_visible: bool,
    dashboard_visible: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteCommand {
    token: String,
    command: String,
    request_id: Option<String>,
    conversation_id: Option<String>,
    text: Option<String>,
    image_base64: Option<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteResponse {
    ok: bool,
    command: String,
    message: String,
    request_id: Option<String>,
    image_base64: Option<String>,
    overlay_state: Option<RemoteOverlayState>,
    chat_io: Option<RemoteChatIoEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    chat_sessions: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    chat_messages: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RemoteChatIoEvent {
    direction: String,
    text: String,
    conversation_id: Option<String>,
    conversation_title: Option<String>,
    is_final: bool,
    timestamp_ms: u64,
}

fn generate_token() -> String {
    Uuid::new_v4().to_string()
}

fn now_ms() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis() as u64,
        Err(_) => 0,
    }
}

fn detect_local_hosts() -> Vec<String> {
    let mut hosts: Vec<String> = Vec::new();

    // Enumerate every network interface and collect all non-loopback IPv4 addresses.
    // This ensures that machines with multiple adapters (ethernet + Wi-Fi, VPN,
    // hotspot, etc.) expose every reachable IP in the QR code so the mobile can
    // pick the one it can actually reach.
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            if let std::net::IpAddr::V4(ipv4) = iface.ip() {
                // Skip link-local addresses (169.254.x.x) — they are
                // auto-assigned when DHCP fails and are not useful for pairing.
                if !ipv4.is_link_local() {
                    hosts.push(ipv4.to_string());
                }
            }
        }
    }

    // Fall back to the UDP routing trick in case if_addrs returns nothing
    // (unlikely, but safe to keep as a last resort).
    if hosts.is_empty() {
        if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if socket.connect("8.8.8.8:80").is_ok() {
                if let Ok(local_addr) = socket.local_addr() {
                    let ip = local_addr.ip();
                    if !ip.is_loopback() {
                        hosts.push(ip.to_string());
                    }
                }
            }
        }
    }

    // Always include loopback last so local testing is possible.
    hosts.push("127.0.0.1".to_string());
    hosts.sort();
    hosts.dedup();
    hosts
}

fn build_pairing_info(running: bool, port: u16, token: String) -> RemotePairingInfo {
    let hosts = detect_local_hosts();
    let ws_urls: Vec<String> = hosts
        .iter()
        .map(|host| format!("ws://{}:{}", host, port))
        .collect();
    let commands = SUPPORTED_REMOTE_COMMANDS
        .iter()
        .map(|cmd| cmd.to_string())
        .collect::<Vec<String>>();

    let qr_payload = json!({
        "type": "pluely-remote-v1",
        "token": token,
        "port": port,
        "hosts": hosts,
        "wsUrls": ws_urls,
        "commands": commands
    })
    .to_string();

    RemotePairingInfo {
        running,
        port,
        token,
        hosts,
        ws_urls,
        qr_payload,
        commands,
    }
}

fn get_window_visibility(app: &AppHandle, label: &str) -> bool {
    app.get_webview_window(label)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn collect_overlay_state(
    app: &AppHandle,
    overlay_state_ref: &Arc<Mutex<OverlaySyncState>>,
) -> RemoteOverlayState {
    let (stt_enabled, system_audio_capturing) = overlay_state_ref
        .lock()
        .map(|state| (state.stt_enabled, state.system_audio_capturing))
        .unwrap_or((false, false));

    RemoteOverlayState {
        stt_enabled,
        system_audio_capturing,
        main_window_visible: get_window_visibility(app, "main"),
        dashboard_visible: get_window_visibility(app, "dashboard"),
    }
}

fn normalize_running_state(state: &RemoteControlState) -> bool {
    let mut task_guard = state.server_task.lock().unwrap();
    if let Some(task) = task_guard.as_ref() {
        if task.is_finished() {
            *task_guard = None;
            return false;
        }
    }
    task_guard.is_some()
}

fn get_or_create_token(state: &RemoteControlState) -> String {
    let mut token_guard = state.pair_token.lock().unwrap();
    if token_guard.is_empty() {
        *token_guard = generate_token();
    }
    token_guard.clone()
}

fn queue_response(sender: &mpsc::UnboundedSender<String>, response: &RemoteResponse) {
    match serde_json::to_string(response) {
        Ok(payload) => {
            let _ = sender.send(payload);
        }
        Err(error) => {
            eprintln!("Failed to serialize response: {}", error);
        }
    }
}

fn broadcast_response(app: &AppHandle, response: &RemoteResponse) {
    let payload = match serde_json::to_string(response) {
        Ok(payload) => payload,
        Err(error) => {
            eprintln!("Failed to serialize broadcast response: {}", error);
            return;
        }
    };

    let state = app.state::<RemoteControlState>();
    let mut stale_client_ids: Vec<String> = Vec::new();

    let mut clients_guard = match state.client_channels.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    for (client_id, sender) in clients_guard.iter() {
        if sender.send(payload.clone()).is_err() {
            stale_client_ids.push(client_id.clone());
        }
    }

    for client_id in stale_client_ids {
        clients_guard.remove(&client_id);
    }
}

async fn handle_client_connection(
    app: AppHandle,
    token_ref: Arc<Mutex<String>>,
    overlay_state_ref: Arc<Mutex<OverlaySyncState>>,
    tcp_stream: TcpStream,
) -> Result<(), String> {
    let _ = tcp_stream.set_nodelay(true);
    let ws_stream = accept_async(tcp_stream)
        .await
        .map_err(|e| format!("WebSocket handshake failed: {}", e))?;
    let (mut writer, mut reader) = ws_stream.split();

    let client_id = Uuid::new_v4().to_string();
    let (writer_tx, mut writer_rx) = mpsc::unbounded_channel::<String>();

    {
        let state = app.state::<RemoteControlState>();
        let mut clients_guard = match state.client_channels.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        clients_guard.insert(client_id.clone(), writer_tx.clone());
    }

    let writer_task = tokio::spawn(async move {
        while let Some(payload) = writer_rx.recv().await {
            if writer.send(Message::Text(payload.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(next_msg) = reader.next().await {
        let message = match next_msg {
            Ok(msg) => msg,
            Err(e) => return Err(format!("WebSocket receive error: {}", e)),
        };

        if message.is_close() {
            break;
        }

        if !message.is_text() {
            continue;
        }

        let text = match message.to_text() {
            Ok(text) => text,
            Err(_) => continue,
        };

        let command: RemoteCommand = match serde_json::from_str(text) {
            Ok(cmd) => cmd,
            Err(_) => {
                let response = RemoteResponse {
                    ok: false,
                    command: "invalid".to_string(),
                    message: "Invalid JSON message".to_string(),
                    request_id: None,
                    image_base64: None,
                    overlay_state: None,
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
                continue;
            }
        };

        let expected_token = token_ref.lock().unwrap().clone();
        if expected_token.is_empty() || command.token != expected_token {
            let response = RemoteResponse {
                ok: false,
                command: command.command.clone(),
                message: "Unauthorized token".to_string(),
                request_id: command.request_id.clone(),
                image_base64: None,
                overlay_state: None,
                chat_io: None,
                chat_sessions: None,
                chat_messages: None,
            };
            queue_response(&writer_tx, &response);
            continue;
        }

        match command.command.as_str() {
            "ping" => {
                let response = RemoteResponse {
                    ok: true,
                    command: "ping".to_string(),
                    message: "pong".to_string(),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }
            "open_chat_session" => {
                let _ = app.emit(
                    "remote-control-open-chat-session",
                    serde_json::json!({
                        "requestId": command.request_id.clone(),
                        "conversationId": command.conversation_id.clone(),
                    }),
                );
                let response = RemoteResponse {
                    ok: true,
                    command: "open_chat_session".to_string(),
                    message: "Opening chat session on desktop...".to_string(),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }
            "send_chat_message" => {
                let _ = app.emit(
                    "remote-control-send-chat-message",
                    serde_json::json!({
                        "requestId": command.request_id.clone(),
                        "conversationId": command.conversation_id.clone(),
                        "text": command.text.clone(),
                        "imagesBase64": command.image_base64.clone(),
                    }),
                );
                let response = RemoteResponse {
                    ok: true,
                    command: "send_chat_message".to_string(),
                    message: "Passing message to app...".to_string(),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }
            "get_chat_sessions" => {
                // Emit event to frontend; useHistory.ts listener will call
                // remote_control_push_chat_sessions with the data.
                let _ = app.emit(
                    "remote-control-get-chat-sessions",
                    serde_json::json!({
                        "requestId": command.request_id.clone(),
                    }),
                );
                let response = RemoteResponse {
                    ok: true,
                    command: "get_chat_sessions".to_string(),
                    message: "Requesting chat sessions...".to_string(),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }
            "get_chat_messages" => {
                // Emit event to frontend; useHistory.ts listener will call
                // remote_control_push_chat_messages with the conversation data.
                let _ = app.emit(
                    "remote-control-get-chat-messages",
                    serde_json::json!({
                        "requestId": command.request_id.clone(),
                        "conversationId": command.conversation_id.clone(),
                    }),
                );
                let response = RemoteResponse {
                    ok: true,
                    command: "get_chat_messages".to_string(),
                    message: "Requesting chat messages...".to_string(),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }

            "get_overlay_state" => {
                let response = RemoteResponse {
                    ok: true,
                    command: "get_overlay_state".to_string(),
                    message: "Overlay state synced".to_string(),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }
            "get_screenshot" => {
                let mut image_base64 = None;
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(base64_img) = crate::capture::capture_to_base64(window).await {
                        image_base64 = Some(base64_img);
                    }
                }
                
                let response = RemoteResponse {
                    ok: image_base64.is_some(),
                    command: "get_screenshot".to_string(),
                    message: if image_base64.is_some() {
                        "Screenshot captured".to_string()
                    } else {
                        "Failed to capture screenshot".to_string()
                    },
                    request_id: command.request_id.clone(),
                    image_base64,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }
            "screenshot" | "audio_recording" | "system_audio" | "toggle_dashboard" | "focus_input"
            | "toggle_window" => {
                if let Ok(mut overlay_sync) = overlay_state_ref.lock() {
                    if command.command == "audio_recording" {
                        overlay_sync.stt_enabled = !overlay_sync.stt_enabled;
                    }
                    if command.command == "system_audio" {
                        overlay_sync.system_audio_capturing = !overlay_sync.system_audio_capturing;
                    }
                }

                crate::shortcuts::handle_shortcut_action(&app, command.command.as_str());

                let response = RemoteResponse {
                    ok: true,
                    command: command.command.clone(),
                    message: format!("Triggered {}", command.command),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
                let _ = app.emit(
                    "remote-control-command",
                    json!({
                        "command": command.command,
                        "status": "success"
                    }),
                );
            }
            _ => {
                let response = RemoteResponse {
                    ok: false,
                    command: command.command.clone(),
                    message: "Unknown command".to_string(),
                    request_id: command.request_id.clone(),
                    image_base64: None,
                    overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
                    chat_io: None,
                    chat_sessions: None,
                    chat_messages: None,
                };
                queue_response(&writer_tx, &response);
            }
        }
    }

    {
        let state = app.state::<RemoteControlState>();
        let mut clients_guard = match state.client_channels.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        clients_guard.remove(&client_id);
    }
    drop(writer_tx);
    let _ = writer_task.await;

    Ok(())
}

#[tauri::command]
pub async fn remote_control_start(
    app: AppHandle,
    port: Option<u16>,
) -> Result<RemotePairingInfo, String> {
    let state = app.state::<RemoteControlState>();

    if normalize_running_state(&state) {
        return remote_control_status(app).await;
    }

    let bind_port = port.unwrap_or(DEFAULT_REMOTE_PORT);
    let listener = TcpListener::bind(("0.0.0.0", bind_port))
        .await
        .map_err(|e| format!("Failed to bind remote server on port {}: {}", bind_port, e))?;
    let active_port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read bound address: {}", e))?
        .port();

    let token = generate_token();
    {
        let mut token_guard = state.pair_token.lock().unwrap();
        *token_guard = token.clone();
    }
    {
        let mut port_guard = state.port.lock().unwrap();
        *port_guard = active_port;
    }

    let app_for_server = app.clone();
    let token_ref = state.pair_token.clone();
    let overlay_state_ref = state.overlay_sync.clone();
    let task = tokio::spawn(async move {
        loop {
            let (tcp_stream, _) = match listener.accept().await {
                Ok(conn) => conn,
                Err(error) => {
                    eprintln!("Remote server accept error: {}", error);
                    break;
                }
            };

            let app_for_client = app_for_server.clone();
            let token_ref_for_client = token_ref.clone();
            let overlay_state_for_client = overlay_state_ref.clone();
            tokio::spawn(async move {
                if let Err(error) = handle_client_connection(
                    app_for_client,
                    token_ref_for_client,
                    overlay_state_for_client,
                    tcp_stream,
                )
                .await
                {
                    eprintln!("Remote client connection error: {}", error);
                }
            });
        }
    });

    {
        let mut task_guard = state.server_task.lock().unwrap();
        *task_guard = Some(task);
    }

    let _ = app.emit(
        "remote-control-status",
        json!({
            "running": true,
            "port": active_port
        }),
    );

    Ok(build_pairing_info(true, active_port, token))
}

#[tauri::command]
pub async fn remote_control_stop(app: AppHandle) -> Result<(), String> {
    let state = app.state::<RemoteControlState>();

    {
        let mut task_guard = state.server_task.lock().unwrap();
        if let Some(task) = task_guard.take() {
            task.abort();
        }
    }

    {
        let mut port_guard = state.port.lock().unwrap();
        *port_guard = 0;
    }

    let _ = app.emit(
        "remote-control-status",
        json!({ "running": false, "port": 0 }),
    );
    Ok(())
}

#[tauri::command]
pub async fn remote_control_regenerate_token(app: AppHandle) -> Result<RemotePairingInfo, String> {
    let state = app.state::<RemoteControlState>();

    let token = generate_token();
    {
        let mut token_guard = state.pair_token.lock().unwrap();
        *token_guard = token.clone();
    }

    let running = normalize_running_state(&state);
    let port = *state.port.lock().unwrap();
    Ok(build_pairing_info(running, port, token))
}

#[tauri::command]
pub async fn remote_control_status(app: AppHandle) -> Result<RemotePairingInfo, String> {
    let state = app.state::<RemoteControlState>();
    let running = normalize_running_state(&state);
    let port = *state.port.lock().unwrap();
    let token = get_or_create_token(&state);
    Ok(build_pairing_info(running, port, token))
}

#[tauri::command]
pub fn remote_control_sync_overlay_state(
    app: AppHandle,
    stt_enabled: Option<bool>,
    system_audio_capturing: Option<bool>,
) -> Result<(), String> {
    let state = app.state::<RemoteControlState>();
    let mut overlay_sync = state
        .overlay_sync
        .lock()
        .map_err(|_| "Failed to lock overlay sync state".to_string())?;

    if let Some(enabled) = stt_enabled {
        overlay_sync.stt_enabled = enabled;
    }
    if let Some(capturing) = system_audio_capturing {
        overlay_sync.system_audio_capturing = capturing;
    }

    Ok(())
}

#[tauri::command]
pub fn remote_control_push_chat_io(
    app: AppHandle,
    direction: String,
    text: String,
    conversation_id: Option<String>,
    conversation_title: Option<String>,
    is_final: Option<bool>,
) -> Result<(), String> {
    if direction != "input" && direction != "output" {
        return Err("direction must be 'input' or 'output'".to_string());
    }

    let trimmed_text = text.trim().to_string();
    let final_flag = is_final.unwrap_or(false);
    if trimmed_text.is_empty() && !final_flag {
        return Ok(());
    }

    let overlay_state_ref = {
        let state = app.state::<RemoteControlState>();
        state.overlay_sync.clone()
    };

    let response = RemoteResponse {
        ok: true,
        command: "chat_io".to_string(),
        message: "Live chat update".to_string(),
        request_id: None,
        image_base64: None,
        overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
        chat_io: Some(RemoteChatIoEvent {
            direction,
            text: trimmed_text,
            conversation_id,
            conversation_title,
            is_final: final_flag,
            timestamp_ms: now_ms(),
        }),
        chat_sessions: None,
        chat_messages: None,
    };

    broadcast_response(&app, &response);
    Ok(())
}

#[tauri::command]
pub fn remote_control_push_chat_sessions(
    app: AppHandle,
    sessions: serde_json::Value,
    request_id: Option<String>,
) -> Result<(), String> {
    let overlay_state_ref = {
        let state = app.state::<RemoteControlState>();
        state.overlay_sync.clone()
    };

    let response = RemoteResponse {
        ok: true,
        command: "chat_sessions".to_string(),
        message: "Here are the chat sessions".to_string(),
        request_id,
        image_base64: None,
        overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
        chat_io: None,
        chat_sessions: Some(sessions),
        chat_messages: None,
    };

    broadcast_response(&app, &response);
    Ok(())
}

#[tauri::command]
pub fn remote_control_push_chat_messages(
    app: AppHandle,
    messages: serde_json::Value,
    request_id: Option<String>,
) -> Result<(), String> {
    let overlay_state_ref = {
        let state = app.state::<RemoteControlState>();
        state.overlay_sync.clone()
    };

    let response = RemoteResponse {
        ok: true,
        command: "chat_messages".to_string(),
        message: "Here are the chat messages".to_string(),
        request_id,
        image_base64: None,
        overlay_state: Some(collect_overlay_state(&app, &overlay_state_ref)),
        chat_io: None,
        chat_sessions: None,
        chat_messages: Some(messages),
    };

    broadcast_response(&app, &response);
    Ok(())
}
