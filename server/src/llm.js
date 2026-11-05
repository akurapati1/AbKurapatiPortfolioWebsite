import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin wrapper around the Anthropic SDK that adds:
 *  - graceful "no key" behaviour (available() === false -> callers fall back to retrieval mode)
 *  - a global daily call budget so a public endpoint can never run up an unbounded bill
 *  - a single structured-output helper used by /api/fit and /api/discover
 *
 * Pass `client` to inject a fake in tests.
 */
export function createLLM(config, { client } = {}) {
  const c = client || (config.llm.apiKey ? new Anthropic({ apiKey: config.llm.apiKey, maxRetries: 2, timeout: 60_000 }) : null);
  const day = () => new Date().toISOString().slice(0, 10);
  let budgetDay = day();
  let used = 0;

  const rollover = () => {
    if (budgetDay !== day()) { budgetDay = day(); used = 0; }
  };

  return {
    client: c,
    config: config.llm,
    available() {
      rollover();
      return Boolean(c) && used < config.llm.dailyCallBudget;
    },
    /** Count one logical request against the daily budget. */
    reserve() { rollover(); used += 1; },
    usage() { rollover(); return { used, budget: config.llm.dailyCallBudget, day: budgetDay }; },

    /**
     * One-shot structured generation. Returns the parsed JSON object that matches `schema`.
     * Uses output_config.format (structured outputs), never prefill and never forced tool_choice.
     */
    async structured({ system, user, schema, maxTokens = 1800, signal }) {
      if (!c) throw new Error("LLM not configured");
      const res = await c.messages.create(
        {
          model: config.llm.model,
          max_tokens: maxTokens,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: user }],
          output_config: { effort: config.llm.effort, format: { type: "json_schema", schema } }
        },
        { signal }
      );
      if (res.stop_reason === "refusal") throw new Error("model refused");
      const block = res.content.find((b) => b.type === "text");
      if (!block) throw new Error("no text in response");
      return JSON.parse(block.text);
    }
  };
}
