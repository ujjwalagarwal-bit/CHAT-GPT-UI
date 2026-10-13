/* =========================================================
   api.js — everything that talks to an AI provider.
   script.js only calls:  ChatAPI.stream(messages, options)

   Supported providers
     "openai"    any OpenAI-compatible API (OpenAI, OpenRouter, Groq,
                 Together, local servers like Ollama / LM Studio ...)
     "anthropic" Anthropic Messages API (Claude)

   Settings are stored in this browser's localStorage.
   Anyone who can open DevTools on your page can read the key, so use
   this setup for personal projects only. For a public site, send the
   request through your own backend and keep the key there.
   ========================================================= */

const ChatAPI = (() => {
  const STORE = "chatui.settings";

  // Default Base URL and model for each provider (all editable in the UI).
  const PRESETS = {
    openai:    { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5-5" },
  };

  const SYSTEM =
    "You are a helpful assistant in a chat app. Reply in clear Markdown: short paragraphs, " +
    "lists where useful, and fenced code blocks with a language tag. Be concise unless asked for detail.";
  const THINK = " Think through the problem step by step before answering, and double-check your result.";

  /* ---------- Settings ---------- */
  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch {}
    return { provider: "openai", ...PRESETS.openai, apiKey: "", ...saved };
  }

  function save(settings) {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch {}
  }

  function isReady() {
    return Boolean(load().apiKey);
  }

  /* ---------- Request builders (one per provider) ---------- */
  function openaiRequest(s, system, messages) {
    return {
      url: s.baseUrl + "/chat/completions",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + s.apiKey,
      },
      body: {
        model: s.model,
        stream: true,
        messages: [{ role: "system", content: system }, ...messages],
      },
      // Pull the new text out of one streamed JSON chunk.
      pick: (j) => j.choices?.[0]?.delta?.content || "",
    };
  }

  function anthropicRequest(s, system, messages) {
    return {
      url: s.baseUrl + "/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": s.apiKey,
        "anthropic-version": "2023-06-01",
        // Required by Anthropic when the call is made from a browser.
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: { model: s.model, max_tokens: 4096, stream: true, system, messages },
      pick: (j) => (j.type === "content_block_delta" ? j.delta?.text || "" : ""),
    };
  }

  /* ---------- Helpers ---------- */
  // Reads a Server-Sent Events response and calls onData for each "data:" line.
  async function readSSE(res, onData) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) onData(line.slice(5).trim());
      }
    }
  }

  async function errorText(res) {
    const raw = await res.text();
    try {
      const j = JSON.parse(raw);
      return `${res.status}: ${j.error?.message || j.message || raw}`;
    } catch {
      return `${res.status}: ${raw.slice(0, 200)}`;
    }
  }

  /* ---------- Public: stream a reply ----------
     messages : [{ role: "user" | "assistant", content: "..." }, ...]  (ends on "user")
     options  : { onText(fullTextSoFar), signal (AbortSignal), thinking (boolean) }
     returns  : the complete reply text                                          */
  async function stream(messages, { onText, signal, thinking } = {}) {
    const s = load();
    if (!s.apiKey) throw new Error("No API key yet. Add one in API settings.");

    const system = SYSTEM + (thinking ? THINK : "");
    const req = s.provider === "anthropic"
      ? anthropicRequest(s, system, messages)
      : openaiRequest(s, system, messages);

    let res;
    try {
      res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new Error("Could not reach the API. Check your internet, Base URL and key. Some providers block browser requests (CORS).");
    }
    if (!res.ok) throw new Error(await errorText(res));

    let text = "";
    await readSSE(res, (data) => {
      if (data === "[DONE]") return;
      let json;
      try { json = JSON.parse(data); } catch { return; }
      const piece = req.pick(json);
      if (piece) {
        text += piece;
        if (onText) onText(text);
      }
    });
    return text;
  }

  return { PRESETS, load, save, isReady, stream };
})();
