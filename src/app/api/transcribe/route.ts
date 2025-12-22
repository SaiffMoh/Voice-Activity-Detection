import { NextRequest, NextResponse } from "next/server";
import { elevenlabsSTT } from "./services/elevenlabs_stt";
import { elevenlabsTTS } from "./services/elevenlabs_tts";
import { watsonLLM } from "./services/watson_llm";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type");
    
    // Handle greeting request (JSON)
    if (contentType?.includes("application/json")) {
      const body = await req.json();
      
      if (body.greeting) {
        const messages = body.messageHistory 
          ? JSON.parse(body.messageHistory)
          : [];

        // If no messages, add a greeting prompt
        if (messages.length === 0) {
          messages.push({ 
            role: "user", 
            content: "مرحبا" // Hello in Arabic to trigger greeting
          });
        }

        /* LLM */
        let responseText = "";
        for await (const token of watsonLLM.generate(messages)) {
          responseText += token;
        }

        /* TTS */
        const audioOut = await elevenlabsTTS(
          responseText,
          process.env.ELEVENLABS_API_KEY!,
          process.env.ELEVENLABS_VOICE_ID!
        );

        const audioArrayBuffer = audioOut.buffer.slice(
          audioOut.byteOffset,
          audioOut.byteOffset + audioOut.byteLength
        );
        const audioUint8 = new Uint8Array(audioArrayBuffer);

        return new NextResponse(audioUint8 as unknown as BodyInit, {
          headers: {
            "Content-Type": "audio/wav",
            "X-Response": encodeURIComponent(responseText),
          },
        });
      }
    }
    
    // Handle normal audio request (FormData)
    const form = await req.formData();
    const audio = form.get("audio") as File;
    const historyRaw = form.get("messageHistory");

    if (!audio) {
      return NextResponse.json({ error: "No audio" }, { status: 400 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());

    /* STT */
    const transcript = await elevenlabsSTT(
      buffer,
      process.env.ELEVENLABS_API_KEY!
    );

    const messages = historyRaw
      ? JSON.parse(historyRaw.toString())
      : [];

    messages.push({ role: "user", content: transcript });

    /* LLM */
    let responseText = "";
    for await (const token of watsonLLM.generate(messages)) {
      responseText += token;
    }

    /* TTS */
    const audioOut = await elevenlabsTTS(
      responseText,
      process.env.ELEVENLABS_API_KEY!,
      process.env.ELEVENLABS_VOICE_ID!
    );

    const audioArrayBuffer = audioOut.buffer.slice(
      audioOut.byteOffset,
      audioOut.byteOffset + audioOut.byteLength
    );
    const audioUint8 = new Uint8Array(audioArrayBuffer);

    return new NextResponse(audioUint8 as unknown as BodyInit, {
      headers: {
        "Content-Type": "audio/wav",
        "X-Transcript": encodeURIComponent(transcript),
        "X-Response": encodeURIComponent(responseText),
      },
    });
  } catch (e: unknown) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}