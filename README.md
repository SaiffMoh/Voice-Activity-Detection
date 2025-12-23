This repository contains a Next.js app that demonstrates a conversational AI using
voice input (speech-to-text), an LLM for responses, and text-to-speech for audio
reply playback.

**Quick start**

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env.local` file in the project root and add required keys (see below).

3. Run the app locally:

```bash
pnpm dev
```

Open http://localhost:3000 in your browser.

**Environment variables**

Create `.env.local` and set these values (do not commit secrets):

- **ELEVENLABS_API_KEY**: API key for ElevenLabs (used for STT/TTS in this project).
- **ELEVENLABS_VOICE_ID**: Voice ID used for TTS output.
- **WATSON_APIKEY**: IBM Cloud API key used to obtain an access token for the Watson/IBM LLM.
- **PROJECT_ID**: Watson project id used when calling the Watson LLM endpoint.

Notes: The project currently uses ElevenLabs for speech-to-text and text-to-speech
and an IBM Watson endpoint (wrapped in `watson_llm.ts`) as the LLM. Replace or
configure providers as needed in `src/app/api/transcribe/services`.

**How to use**

- Click the microphone button to start voice activity detection (VAD).
- The frontend captures audio when speech is detected, sends the recorded audio
   to the backend at `/api/transcribe` as FormData, then:
   - the server runs STT (ElevenLabs) to get a transcript,
   - sends the transcript (plus conversation history) to the LLM,
   - converts the LLM response to speech (ElevenLabs TTS), and returns audio.
- The frontend plays the returned WAV audio and displays transcript/response in
   the UI.

**API behavior (/api/transcribe)**

- POST with `Content-Type: application/json` and `{ greeting: true }` will ask
   the LLM to produce a greeting and returns `audio/wav` with an `X-Response`
   header containing the response text (URL-encoded).
- POST with FormData including `audio` (file) and optional `messageHistory`
   will transcribe the audio, pass the transcript to the LLM with history, and
   return `audio/wav` with `X-Transcript` and `X-Response` headers.

**Files of interest**

- `src/app/components/SpeechDetector.tsx` — frontend voice detection, recording,
   transcription, playback UI.
- `src/app/api/transcribe/route.ts` — server endpoint glue that runs STT, LLM,
   and TTS.
- `src/app/api/transcribe/services/*` — provider integrations (ElevenLabs, Watson).

**Security & notes**

- Keep API keys out of version control. Use `.env.local` or a secret store for
   deployments.
- The project includes example integrations; verify and harden network/security
   settings before deploying to production.

If you'd like, I can also:

- add a concise `Makefile`/`package.json` scripts section for build/test tasks,
- create a short troubleshooting section for microphone permissions.

