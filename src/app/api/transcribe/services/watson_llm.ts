import fetch from "node-fetch";
import { SYSTEM_PROMPT } from "./watson_prompt";

type ChatMessage = { role: string; content: string };

export class WatsonLLM {
  private token: string | null = null;

  private async getToken(): Promise<string> {
    const res = await fetch(
      "https://iam.cloud.ibm.com/identity/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "urn:ibm:params:oauth:grant-type:apikey",
          apikey: process.env.WATSON_APIKEY!,
        }),
      }
    );

    const json = await res.json();
    return json.access_token;
  }

  private async ensureAuth() {
    if (!this.token) {
      this.token = await this.getToken();
    }
  }

  async *generate(messages: ChatMessage[]) {
    await this.ensureAuth();

    const fullMessages = [
      SYSTEM_PROMPT,
      ...messages
    ];

    const res = await fetch(
      "https://us-south.ml.cloud.ibm.com/ml/v1/text/chat?version=2023-05-29",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: process.env.PROJECT_ID,
          model_id: "mistralai/mistral-small-3-1-24b-instruct-2503",
          messages: fullMessages,
          temperature: 0.7,
          max_tokens: 1024,
          stream: true,
        }),
      }
    );

    const decoder = new TextDecoder();
    let buffered = "";

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffered += decoder.decode(chunk, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        if (line.includes("[DONE]")) return;

        try {
          const json = JSON.parse(line.replace("data: ", ""));
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {}
      }
    }

    if (buffered) {
      const lines = buffered.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        if (line.includes("[DONE]")) return;
        try {
          const json = JSON.parse(line.replace("data: ", ""));
          const token = json.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {}
      }
    }
  }
}

export const watsonLLM = new WatsonLLM();
