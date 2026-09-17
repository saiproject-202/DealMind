// Despite the filename/export names (kept as `askClaude` etc. so every call
// site across the codebase stays unchanged), this now talks to Groq's
// OpenAI-compatible chat completions API instead of Anthropic — switched
// because the Anthropic key ran out of credits and Groq has a free tier.
//
// Model name lives in exactly one place: this file. To move to a newer/
// different model, change GROQ_MODEL in .env (no code changes needed
// anywhere else) or edit FALLBACK_MODELS below if Groq renames/retires one.
const GROQ_API_KEY = process.env.GROQ_API_KEY
const PRIMARY_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Each Groq model has its own separate daily token quota — when the primary
// hits its limit (as happened repeatedly during testing), these are tried
// next automatically instead of every extraction just failing for the rest
// of the day. Ordered by quality; last resort is deliberately the cheapest.
const FALLBACK_MODELS = ['llama-3.1-8b-instant', 'openai/gpt-oss-20b']

let lastUsedModel = PRIMARY_MODEL

// ── Exposes the active model name (e.g. for admin UI display) ──
export function currentModel(): string {
  return lastUsedModel
}

async function callGroq(model: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body}`)
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new Error('Unexpected response shape from Groq')
  return text.trim()
}

// ── Core: send a prompt, get text back ────────────────────────
export async function askClaude(prompt: string, maxTokens = 1000): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set')

  const models = [PRIMARY_MODEL, ...FALLBACK_MODELS]
  let lastError: Error | null = null

  for (const model of models) {
    try {
      const result = await callGroq(model, prompt, maxTokens)
      lastUsedModel = model
      return result
    } catch (err) {
      lastError = err as Error
      // Only fall through to the next model on rate limits — any other
      // error (bad prompt, auth, etc.) would fail identically everywhere.
      if (!/^429/.test(lastError.message)) throw lastError
    }
  }
  throw lastError
}

// ── Parse JSON from the model's response safely ────────────────
// Models sometimes wrap JSON in markdown fences — this handles that
export function parseJsonFromClaude(text: string): Record<string, unknown> {
  // Remove markdown code fences if present
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  // Extract first JSON object found
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in model response')

  return JSON.parse(match[0])
}
