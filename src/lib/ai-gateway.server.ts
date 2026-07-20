// Lovable AI Gateway helper (server-only). Read LOVABLE_API_KEY inside handlers.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

function useGeminiFallback() {
  return !process.env.LOVABLE_API_KEY && !!process.env.GEMINI_API_KEY;
}

function getGeminiModel(requestedModel?: string) {
  let model = requestedModel ?? "gemini-flash-latest";
  model = model.replace(/^google\//, "");
  // Map older/restricted models to gemini-flash-latest
  if (model === "gemini-1.5-flash" || model === "gemini-2.5-flash" || model === "gemini-2.0-flash" || model === "gemini-3.5-flash" || model === "gemini-2.0-flash-lite") {
    return "gemini-flash-latest";
  }
  return model;
}

function escapeJSONStrings(jsonStr: string): string {
  let inString = false;
  let escaped = false;
  let result = "";
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (char === '"' && !escaped) {
      inString = !inString;
      result += char;
    } else if (char === '\\' && inString) {
      escaped = !escaped;
      result += char;
    } else {
      escaped = false;
      if (inString && (char === '\n' || char === '\r')) {
        result += '\\n';
      } else {
        result += char;
      }
    }
  }
  return result;
}

function removeTrailingCommas(jsonStr: string): string {
  return jsonStr.replace(/,\s*([}\]])/g, '$1');
}

function parseTextJSON(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  }
  
  if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) {
    return null;
  }
  
  const textKeyIndex = cleaned.indexOf('"text"');
  if (textKeyIndex === -1) return null;
  
  const colonIndex = cleaned.indexOf(':', textKeyIndex);
  if (colonIndex === -1) return null;
  
  const firstQuoteIndex = cleaned.indexOf('"', colonIndex);
  if (firstQuoteIndex === -1) return null;
  
  const valueStart = firstQuoteIndex + 1;
  const lastQuoteIndex = cleaned.lastIndexOf('"');
  if (lastQuoteIndex === -1 || lastQuoteIndex <= firstQuoteIndex) return null;
  
  const afterLastQuote = cleaned.substring(lastQuoteIndex + 1).trim();
  if (afterLastQuote !== '}') {
    return null;
  }
  
  const rawTextValue = cleaned.substring(valueStart, lastQuoteIndex);
  
  const unescapedValue = rawTextValue.replace(/\\(.)/g, (match, char) => {
    switch (char) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case '"': return '"';
      case '\\': return '\\';
      default: return char;
    }
  });
  
  return { text: unescapedValue };
}

function extractFirstJSONObjectOrArray(str: string): string {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let startIndex = -1;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (inString) {
      if (char === '\\') {
        escaped = !escaped;
      } else if (char === '"' && !escaped) {
        inString = false;
      } else {
        escaped = false;
      }
      continue;
    }
    
    if (char === '"') {
      inString = true;
      escaped = false;
      continue;
    }
    
    if (char === '{' || char === '[') {
      if (depth === 0) {
        startIndex = i;
      }
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        return str.substring(startIndex, i + 1);
      }
    }
  }
  
  return str;
}

function safeParseJSON<T>(raw: string): T {
  const parsedText = parseTextJSON(raw);
  if (parsedText !== null) {
    return parsedText as unknown as T;
  }

  let cleaned = extractFirstJSONObjectOrArray(raw.trim());

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      cleaned = escapeJSONStrings(cleaned);
      cleaned = removeTrailingCommas(cleaned);
      return JSON.parse(cleaned) as T;
    } catch (e) {
      console.error("JSON parse failed. Raw string:", raw);
      throw new Error(`Failed to parse AI response as valid JSON: ${(e as Error).message}`);
    }
  }
}

function apiKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) {
    if (process.env.GEMINI_API_KEY) return ""; // fallback will handle it
    throw new Error("Missing LOVABLE_API_KEY (or GEMINI_API_KEY in .env)");
  }
  return key;
}

async function fetchGeminiWithFallback(opts: {
  model: string;
  body: any;
  key: string;
}): Promise<any> {
  const modelsToTry = [
    opts.model,
    ...(opts.model !== "gemini-3.1-flash-lite" ? ["gemini-3.1-flash-lite"] : []),
    ...(opts.model !== "gemini-flash-latest" ? ["gemini-flash-latest"] : [])
  ];

  let lastError: Error | null = null;

  for (const currentModel of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${opts.key}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts.body)
      });

      if (res.status === 429) {
        const text = await res.text().catch(() => "");
        console.warn(`Gemini API 429 for model ${currentModel}. Retrying with next fallback model...`);
        lastError = new Error(`Gemini API 429: ${text}`);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini API ${res.status}: ${text}`);
      }

      return await res.json();
    } catch (err) {
      if ((err as Error).message.includes("429")) {
        lastError = err as Error;
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("All Gemini fallback models exhausted.");
}

export async function chatJSON<T = unknown>(opts: {
  model?: string;
  system?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>;
  temperature?: number;
}): Promise<T> {
  if (useGeminiFallback()) {
    const key = process.env.GEMINI_API_KEY || "";
    const model = getGeminiModel(opts.model);
    
    const contents = opts.messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }]
    }));

    const body: any = {
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: opts.temperature ?? 0.4
      }
    };

    if (opts.system) {
      body.systemInstruction = {
        parts: [{ text: opts.system }]
      };
    }

    const data = await fetchGeminiWithFallback({ model, body, key });
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return safeParseJSON<T>(raw);
  }

  const messages = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages,
  ];
  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3.5-flash",
      messages,
      response_format: { type: "json_object" },
      temperature: opts.temperature ?? 0.4,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  return safeParseJSON<T>(raw);
}

export async function transcribeAudio(base64: string, mime: string): Promise<string> {
  if (useGeminiFallback()) {
    const key = process.env.GEMINI_API_KEY || "";
    const model = "gemini-flash-latest";

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcribe the audio exactly as spoken. Do not add any intro, outro, explanations, or metadata. Output ONLY the transcription text." },
            {
              inlineData: {
                mimeType: mime,
                data: base64
              }
            }
          ]
        }
      ]
    };

    const data = await fetchGeminiWithFallback({ model, body, key });
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  // Turn base64 into a Blob for multipart upload
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a"
    : mime.includes("wav") ? "wav"
    : mime.includes("mp3") ? "mp3"
    : "webm";
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", new Blob([bin], { type: mime }), `response.${ext}`);
  const res = await fetch(`${GATEWAY_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`STT ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

export async function chatWithFile<T = unknown>(opts: {
  system: string;
  prompt: string;
  filename: string;
  mime: string;
  base64: string;
  model?: string;
}): Promise<T> {
  if (useGeminiFallback()) {
    const key = process.env.GEMINI_API_KEY || "";
    const model = getGeminiModel(opts.model);

    const body = {
      systemInstruction: {
        parts: [{ text: opts.system }]
      },
      contents: [
        {
          role: "user",
          parts: [
            { text: opts.prompt },
            {
              inlineData: {
                mimeType: opts.mime,
                data: opts.base64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const data = await fetchGeminiWithFallback({ model, body, key });
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    return safeParseJSON<T>(raw);
  }

  const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        {
          role: "user",
          content: [
            { type: "text", text: opts.prompt },
            {
              type: "file",
              file: {
                filename: opts.filename,
                file_data: `data:${opts.mime};base64,${opts.base64}`,
              },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${text}`);
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  return safeParseJSON<T>(raw);
}