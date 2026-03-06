/// local_whisper.rs — on-device Whisper transcription using whisper-rs (whisper.cpp bindings).
///
/// Design decisions:
/// - The WhisperContext is expensive to load (~seconds for larger models), so we cache it in a
///   lazy Mutex and reuse it across calls. The cache is keyed by model path; if the user switches
///   models we discard the old context and reload.
/// - Audio is decoded from a base64-encoded WAV blob (the same format the rest of the STT
///   pipeline uses), converted to 16 kHz f32 mono, and passed directly to whisper-rs.
/// - Inference runs on a blocking Tokio thread (spawn_blocking) so the async Tauri command
///   doesn't hold up the runtime.

use base64::{engine::general_purpose, Engine as _};
use once_cell::sync::Lazy;
use serde::Serialize;
use std::{
    io::Cursor,
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

// ──────────────────────────────────────────────────────────
// Model cache
// ──────────────────────────────────────────────────────────

struct ModelCache {
    /// Absolute path to the currently loaded model file.
    path: String,
    /// The live context (holds the model weights in memory).
    ctx: WhisperContext,
}

static MODEL_CACHE: Lazy<Mutex<Option<ModelCache>>> = Lazy::new(|| Mutex::new(None));

// ──────────────────────────────────────────────────────────
// Public response type
// ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct LocalWhisperResponse {
    pub success: bool,
    pub transcription: Option<String>,
    pub error: Option<String>,
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/// Resolve the on-disk path for a downloaded GGML model by its ID.
fn model_path_for_id(app: &AppHandle, model_id: &str) -> Result<String, String> {
    // The whisper_models module stores files as "ggml-{id}.bin"
    let file_name = format!("ggml-{}.bin", model_id);

    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?
        .join("whisper-models")
        .join(&file_name);

    if !models_dir.exists() {
        return Err(format!(
            "Model '{}' is not downloaded yet. Please download it from Settings → STT Provider.",
            model_id
        ));
    }

    models_dir
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Model path contains invalid UTF-8".to_string())
}

/// Decode a base64-encoded WAV blob and resample to 16 kHz f32 mono.
///
/// whisper-rs always expects 16 kHz mono f32 PCM. The VAD pipeline already
/// produces 16 kHz WAV, but we resample defensively for correctness.
fn decode_wav_to_f32_16k(audio_base64: &str) -> Result<Vec<f32>, String> {
    // Strip optional data-URI prefix
    let base64_str = if let Some(idx) = audio_base64.find(',') {
        &audio_base64[idx + 1..]
    } else {
        audio_base64.trim()
    };

    let wav_bytes = general_purpose::STANDARD
        .decode(base64_str)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let cursor = Cursor::new(wav_bytes);
    let mut reader = hound::WavReader::new(cursor)
        .map_err(|e| format!("WAV parse error: {}", e))?;

    let spec = reader.spec();
    // Collect all samples as f32 regardless of source bit depth
    let samples_f32: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .map(|s| s.map_err(|e| format!("WAV read error: {}", e)))
            .collect::<Result<Vec<_>, _>>()?,
        hound::SampleFormat::Int => {
            let max_val = (1_i64 << (spec.bits_per_sample - 1)) as f32;
            match spec.bits_per_sample {
                16 => reader
                    .samples::<i16>()
                    .map(|s| s.map(|v| v as f32 / max_val).map_err(|e| format!("{}", e)))
                    .collect::<Result<Vec<_>, _>>()?,
                32 => reader
                    .samples::<i32>()
                    .map(|s| s.map(|v| v as f32 / max_val).map_err(|e| format!("{}", e)))
                    .collect::<Result<Vec<_>, _>>()?,
                _ => {
                    return Err(format!(
                        "Unsupported bit depth: {}",
                        spec.bits_per_sample
                    ))
                }
            }
        }
    };

    let channels = spec.channels as usize;
    let sample_rate = spec.sample_rate;

    // Mix down to mono
    let mono: Vec<f32> = if channels == 1 {
        samples_f32
    } else {
        samples_f32
            .chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    };

    // Resample to 16 kHz if needed (linear interpolation — good enough for speech)
    let resampled: Vec<f32> = if sample_rate == 16000 {
        mono
    } else {
        let ratio = sample_rate as f64 / 16000.0;
        let out_len = (mono.len() as f64 / ratio).ceil() as usize;
        (0..out_len)
            .map(|i| {
                let src_pos = i as f64 * ratio;
                let src_idx = src_pos as usize;
                let frac = (src_pos - src_idx as f64) as f32;
                let a = mono.get(src_idx).copied().unwrap_or(0.0);
                let b = mono.get(src_idx + 1).copied().unwrap_or(0.0);
                a + frac * (b - a)
            })
            .collect()
    };

    Ok(resampled)
}

/// Load (or reuse) a WhisperContext for the given model path.
///
/// Must be called from a blocking context (not inside an async fn directly).
fn get_or_load_context(model_path: String) -> Result<(), String> {
    let mut cache = MODEL_CACHE
        .lock()
        .map_err(|_| "Model cache mutex poisoned".to_string())?;

    // Already loaded and same model — nothing to do
    if let Some(cached) = cache.as_ref() {
        if cached.path == model_path {
            return Ok(());
        }
    }

    // Load new model (this can take a few seconds for large models)
    let ctx = WhisperContext::new_with_params(&model_path, WhisperContextParameters::default())
        .map_err(|e| format!("Failed to load Whisper model from '{}': {}", model_path, e))?;

    *cache = Some(ModelCache {
        path: model_path,
        ctx,
    });

    Ok(())
}

/// Run Whisper inference on already-loaded context.
///
/// Must be called from a blocking context.
fn run_inference(audio: Vec<f32>) -> Result<String, String> {
    let cache = MODEL_CACHE
        .lock()
        .map_err(|_| "Model cache mutex poisoned".to_string())?;

    let cached = cache
        .as_ref()
        .ok_or("Whisper model not loaded".to_string())?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    // Use all available CPU cores to speed up transcription
    if let Ok(threads) = std::thread::available_parallelism() {
        params.set_n_threads(threads.get() as i32);
    }
    params.set_language(Some("auto")); // auto-detect language
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);

    let mut state = cached
        .ctx
        .create_state()
        .map_err(|e| format!("Failed to create Whisper state: {}", e))?;

    state
        .full(params, &audio)
        .map_err(|e| format!("Whisper inference failed: {}", e))?;

    let n_segments = state
        .full_n_segments()
        .map_err(|e| format!("Failed to get segment count: {}", e))?;

    let mut result = String::new();
    for i in 0..n_segments {
        let segment = state
            .full_get_segment_text(i)
            .map_err(|e| format!("Failed to get segment {}: {}", i, e))?;
        result.push_str(segment.trim());
        result.push(' ');
    }

    Ok(result.trim().to_string())
}

// ──────────────────────────────────────────────────────────
// Tauri command
// ──────────────────────────────────────────────────────────

/// Transcribe audio locally using a downloaded Whisper GGML model.
///
/// `audio_base64` — base64-encoded WAV (any sample rate, mono or stereo; we normalise to 16 kHz mono).
/// `model_id`     — the whisper model ID (e.g. "base", "small.en") matching a downloaded file.
///
/// Returns `{ success, transcription?, error? }` — matching the shape of `AudioResponse` in api.rs
/// so the frontend can handle both paths uniformly.
#[tauri::command]
pub async fn transcribe_local_whisper(
    app: AppHandle,
    audio_base64: String,
    model_id: String,
) -> Result<LocalWhisperResponse, String> {
    println!("[local_whisper] Received transcribe request for model: {}", model_id);
    // Resolve model path on the async side (cheap)
    let model_path = match model_path_for_id(&app, &model_id) {
        Ok(p) => {
            println!("[local_whisper] Model path resolved to: {}", p);
            p
        },
        Err(e) => {
            println!("[local_whisper] Error resolving model path: {}", e);
            return Ok(LocalWhisperResponse {
                success: false,
                transcription: None,
                error: Some(e),
            })
        }
    };

    // Decode audio on the async side (I/O-bound, but fast)
    println!("[local_whisper] Decoding audio (base64 len: {})...", audio_base64.len());
    let audio_samples = match decode_wav_to_f32_16k(&audio_base64) {
        Ok(s) => {
            println!("[local_whisper] Audio decoded successfully. {} samples.", s.len());
            s
        },
        Err(e) => {
            println!("[local_whisper] Audio decode error: {}", e);
            return Ok(LocalWhisperResponse {
                success: false,
                transcription: None,
                error: Some(format!("Audio decode error: {}", e)),
            })
        }
    };

    // Whisper inference is CPU-intensive — run on blocking thread pool
    println!("[local_whisper] Starting inference on blocking thread pool...");
    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        if let Err(e) = get_or_load_context(model_path) {
            println!("[local_whisper] get_or_load_context error: {}", e);
            return Err(e);
        }
        match run_inference(audio_samples) {
            Ok(t) => {
                println!("[local_whisper] inference success: {}", t);
                Ok(t)
            },
            Err(e) => {
                println!("[local_whisper] inference error: {}", e);
                Err(e)
            }
        }
    })
    .await
    .map_err(|e| format!("Blocking task panicked: {}", e))?;

    match result {
        Ok(text) => Ok(LocalWhisperResponse {
            success: true,
            transcription: Some(text),
            error: None,
        }),
        Err(e) => Ok(LocalWhisperResponse {
            success: false,
            transcription: None,
            error: Some(e),
        }),
    }
}
