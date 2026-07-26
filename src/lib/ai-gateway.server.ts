// Groq AI Gateway helper (server-only). Read GROQ_API_KEY inside handlers.
import mammoth from "mammoth";

const GROQ_API_URL = "https://api.groq.com/openai/v1";

function getApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("Missing GROQ_API_KEY in .env");
  }
  return key;
}

function getGroqModel(requestedModel?: string) {
  if (!requestedModel) {
    return "llama-3.3-70b-versatile";
  }
  const model = requestedModel.toLowerCase();
  if (model.includes("gemini") || model.includes("flash") || model.includes("8b")) {
    return "llama-3.1-8b-instant";
  }
  return "llama-3.3-70b-versatile";
}

async function parseDocument(base64: string, mime: string): Promise<string> {
  try {
    const buffer = Buffer.from(base64, "base64");
    
    if (mime === "application/pdf" || mime.includes("pdf")) {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return text || "";
    } else if (
      mime.includes("word") || 
      mime.includes("docx") || 
      mime.includes("officedocument")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    }
    
    throw new Error(`Unsupported document mime type: ${mime}`);
  } catch (error) {
    console.error("Local document parsing failed:", error);
    throw new Error(`Failed to parse the file locally: ${(error as Error).message}`);
  }
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

export async function chatJSON<T = unknown>(opts: {
  model?: string;
  system?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>;
  temperature?: number;
}): Promise<T> {
  const model = getGroqModel(opts.model);
  const messages = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
    })),
  ];

  const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: opts.temperature ?? 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  return safeParseJSON<T>(raw);
}

export async function transcribeAudio(base64: string, mime: string): Promise<string> {
  // Turn base64 into a Blob for multipart upload
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a"
    : mime.includes("wav") ? "wav"
    : mime.includes("mp3") ? "mp3"
    : "webm";
  const form = new FormData();
  form.append("model", "whisper-large-v3");
  form.append("file", new Blob([bin], { type: mime }), `response.${ext}`);

  const res = await fetch(`${GROQ_API_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}` },
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
  // Parse the document text locally first
  const text = await parseDocument(opts.base64, opts.mime);

  // Send the extracted text to Groq chat completions
  const userContent = `${opts.prompt}\n\n=== ATTACHED FILE: ${opts.filename} ===\n${text}\n=== END OF FILE ===`;

  return chatJSON<T>({
    model: opts.model,
    system: opts.system,
    messages: [
      { role: "user", content: userContent }
    ],
    temperature: 0.1, // low temperature for precise extraction
  });
}

export async function chatText(opts: {
  model?: string;
  system?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
}): Promise<string> {
  const model = getGroqModel(opts.model);
  const messages = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages,
  ];

  const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.6,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}