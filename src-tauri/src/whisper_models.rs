use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;

#[derive(Clone)]
struct WhisperModelMeta {
    id: &'static str,
    name: &'static str,
    file_name: &'static str,
    download_url: &'static str,
    size_mb: u64,
}

#[derive(Serialize)]
pub struct WhisperModelStatus {
    id: String,
    name: String,
    file_name: String,
    size_mb: u64,
    downloaded: bool,
    local_path: Option<String>,
}

const WHISPER_MODEL_CATALOG: &[WhisperModelMeta] = &[
    WhisperModelMeta {
        id: "tiny.en",
        name: "Tiny (English)",
        file_name: "ggml-tiny.en.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
        size_mb: 75,
    },
    WhisperModelMeta {
        id: "tiny",
        name: "Tiny (Multilingual)",
        file_name: "ggml-tiny.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        size_mb: 75,
    },
    WhisperModelMeta {
        id: "base.en",
        name: "Base (English)",
        file_name: "ggml-base.en.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
        size_mb: 142,
    },
    WhisperModelMeta {
        id: "base",
        name: "Base (Multilingual)",
        file_name: "ggml-base.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        size_mb: 142,
    },
    WhisperModelMeta {
        id: "small.en",
        name: "Small (English)",
        file_name: "ggml-small.en.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
        size_mb: 466,
    },
    WhisperModelMeta {
        id: "small",
        name: "Small (Multilingual)",
        file_name: "ggml-small.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        size_mb: 466,
    },
    WhisperModelMeta {
        id: "medium.en",
        name: "Medium (English)",
        file_name: "ggml-medium.en.bin",
        download_url:
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
        size_mb: 1500,
    },
    WhisperModelMeta {
        id: "medium",
        name: "Medium (Multilingual)",
        file_name: "ggml-medium.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        size_mb: 1500,
    },
    WhisperModelMeta {
        id: "large-v1",
        name: "Large v1",
        file_name: "ggml-large-v1.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v1.bin",
        size_mb: 2900,
    },
    WhisperModelMeta {
        id: "large-v2",
        name: "Large v2",
        file_name: "ggml-large-v2.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v2.bin",
        size_mb: 2900,
    },
    WhisperModelMeta {
        id: "large-v3",
        name: "Large v3",
        file_name: "ggml-large-v3.bin",
        download_url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
        size_mb: 3100,
    },
];

fn whisper_models_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {}", e))?;
    Ok(app_data_dir.join("whisper-models"))
}

fn model_status_from_meta(
    model: &WhisperModelMeta,
    models_dir: &std::path::Path,
) -> WhisperModelStatus {
    let model_path = models_dir.join(model.file_name);
    let downloaded = model_path.exists();

    WhisperModelStatus {
        id: model.id.to_string(),
        name: model.name.to_string(),
        file_name: model.file_name.to_string(),
        size_mb: model.size_mb,
        downloaded,
        local_path: if downloaded {
            Some(model_path.to_string_lossy().to_string())
        } else {
            None
        },
    }
}

#[tauri::command]
pub async fn list_whisper_models(app: AppHandle) -> Result<Vec<WhisperModelStatus>, String> {
    let models_dir = whisper_models_dir(&app)?;
    tokio::fs::create_dir_all(&models_dir)
        .await
        .map_err(|e| format!("Failed to create whisper models directory: {}", e))?;

    Ok(WHISPER_MODEL_CATALOG
        .iter()
        .map(|model| model_status_from_meta(model, &models_dir))
        .collect())
}

#[tauri::command]
pub async fn download_whisper_model(
    app: AppHandle,
    model_id: String,
) -> Result<WhisperModelStatus, String> {
    let model = WHISPER_MODEL_CATALOG
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| format!("Unknown whisper model: {}", model_id))?;

    let models_dir = whisper_models_dir(&app)?;
    tokio::fs::create_dir_all(&models_dir)
        .await
        .map_err(|e| format!("Failed to create whisper models directory: {}", e))?;

    let final_path = models_dir.join(model.file_name);
    if final_path.exists() {
        return Ok(model_status_from_meta(model, &models_dir));
    }

    let tmp_path = models_dir.join(format!("{}.part", model.file_name));
    if tmp_path.exists() {
        let _ = tokio::fs::remove_file(&tmp_path).await;
    }

    let response = reqwest::Client::new()
        .get(model.download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start model download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download model: HTTP {}",
            response.status()
        ));
    }

    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Download stream failed: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed writing model chunk: {}", e))?;
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush model file: {}", e))?;
    drop(file);

    tokio::fs::rename(&tmp_path, &final_path)
        .await
        .map_err(|e| format!("Failed to finalize model download: {}", e))?;

    Ok(model_status_from_meta(model, &models_dir))
}
