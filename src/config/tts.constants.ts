export const TEXT_TO_SPEECH_PROVIDERS = [
    {
        id: "openai-tts",
        name: "OpenAI TTS",
        curl: `curl https://api.openai.com/v1/audio/speech \\
  -H "Authorization: Bearer {{API_KEY}}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "{{MODEL}}",
    "input": "{{TEXT}}",
    "voice": "{{VOICE}}",
    "speed": {{SPEED}},
    "response_format": "{{FORMAT}}"
  }'`,
        defaultVariables: {
            MODEL: "tts-1",
            VOICE: "alloy",
            SPEED: "1.0",
            FORMAT: "mp3",
        },
        streaming: false,
    },
    {
        id: "whisper-cpp-tts",
        name: "Whisper.cpp Local TTS",
        curl: `curl http://{{HOST}}:{{PORT}}/tts \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "{{TEXT}}",
    "speaker_id": "{{SPEAKER_ID}}",
    "language": "{{LANGUAGE}}",
    "speed_alpha": {{SPEED}},
    "volume_amplification": {{VOLUME}}
  }'`,
        defaultVariables: {
            HOST: "127.0.0.1",
            PORT: "8080",
            SPEAKER_ID: "0",
            LANGUAGE: "en",
            SPEED: "1.0",
            VOLUME: "1.0",
        },
        streaming: false,
    },
    {
        id: "piper-tts",
        name: "Piper Local TTS",
        curl: `curl http://{{HOST}}:{{PORT}}/api/tts \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "{{TEXT}}",
    "voice": "{{VOICE}}",
    "speed": {{SPEED}},
    "sentence_silence": {{SENTENCE_SILENCE}}
  }'`,
        defaultVariables: {
            HOST: "127.0.0.1",
            PORT: "5000",
            VOICE: "en_US-lessac-medium",
            SPEED: "1.0",
            SENTENCE_SILENCE: "0.2",
        },
        streaming: false,
    },
    {
        id: "local-openai-tts",
        name: "Local OpenAI-compatible TTS",
        curl: `curl http://{{HOST}}:{{PORT}}/v1/audio/speech \\
  -H "Authorization: Bearer {{API_KEY}}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "{{MODEL}}",
    "input": "{{TEXT}}",
    "voice": "{{VOICE}}",
    "speed": {{SPEED}},
    "response_format": "{{FORMAT}}"
  }'`,
        defaultVariables: {
            HOST: "127.0.0.1",
            PORT: "8880",
            API_KEY: "not-needed",
            MODEL: "kokoro",
            VOICE: "af_heart",
            SPEED: "1.0",
            FORMAT: "mp3",
        },
        streaming: false,
    },
    {
        id: "elevenlabs-tts",
        name: "ElevenLabs TTS",
        curl: `curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/{{VOICE_ID}}" \\
  -H "xi-api-key: {{API_KEY}}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "{{TEXT}}",
    "model_id": "{{MODEL}}",
    "voice_settings": {
      "stability": {{STABILITY}},
      "similarity_boost": {{SIMILARITY}}
    }
  }'`,
        defaultVariables: {
            MODEL: "eleven_monolingual_v1",
            VOICE_ID: "21m00Tcm4TlvDq8ikWAM",
            STABILITY: "0.5",
            SIMILARITY: "0.75",
        },
        streaming: false,
    },
];
