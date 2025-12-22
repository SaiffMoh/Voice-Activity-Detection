import fetch from "node-fetch";
import FormData from "form-data";

export async function elevenlabsSTT(
  audioBuffer: Buffer,
  apiKey: string
): Promise<string> {
  const form = new FormData();
  form.append("file", audioBuffer, {
    filename: "speech.wav",
    contentType: "audio/wav",
  });
  form.append("model_id", "scribe_v2");
  form.append("language", "ar");

  const res = await fetch(
    "https://api.elevenlabs.io/v1/speech-to-text",
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: form as any,
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const json = await res.json();
  return json.text;
}
