import fetch from "node-fetch";

export async function elevenlabsTTS(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_16000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        // SPEED UP SETTINGS:
        voice_settings: {
          stability: 0.5,        // Lower = more variable/expressive
          similarity_boost: 0.75, // Voice consistency
          style: 0.0,            // Lower = faster, more natural
          use_speaker_boost: true
        },
        // Optimize for speed - lower latency = faster response
        optimize_streaming_latency: "4", // Max optimization (0-4)
        // Optional: adjust output speed directly (0.25 to 4.0, default 1.0)
        // output_speed: 1.2 // 20% faster - uncomment to use
      }),
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }

  const pcmBuffer = Buffer.concat(chunks);

  const numChannels = 1;
  const sampleRate = 16000;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const dataLength = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, pcmBuffer]);
}