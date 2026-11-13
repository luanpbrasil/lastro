// Test-only external model transport. Production always uses the configured providers.
import worker from "../src/worker/index";
export default {
  fetch(request: Request, env: any, ctx: ExecutionContext) {
    return worker.fetch(request, {
      ...env,
      API_LIMITER: { limit: async () => ({ success: true }) },
      AI: { run: async (_model: string, input: unknown) => {
        const reply = await env.MODEL.fetch(new Request("https://model.test/", { method: "POST", body: JSON.stringify(input) }));
        if (!reply.ok) throw new Error("controlled provider failure");
        return reply.json();
      } },
    }, ctx);
  },
};
