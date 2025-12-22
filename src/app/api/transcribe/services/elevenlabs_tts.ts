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
        optimize_streaming_latency: "3",
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

  header.write("RIFF", 0); // ChunkID
  header.writeUInt32LE(36 + dataLength, 4); // ChunkSize
  header.write("WAVE", 8); // Format
  header.write("fmt ", 12); // Subchunk1ID
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22); // NumChannels
  header.writeUInt32LE(sampleRate, 24); // SampleRate
  header.writeUInt32LE(byteRate, 28); // ByteRate
  header.writeUInt16LE(blockAlign, 32); // BlockAlign
  header.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  header.write("data", 36); // Subchunk2ID
  header.writeUInt32LE(dataLength, 40); // Subchunk2Size

  return Buffer.concat([header, pcmBuffer]);
}
