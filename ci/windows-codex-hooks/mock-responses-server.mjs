// Stand-in for the OpenAI Responses API, so a real `codex exec` turn runs in
// CI with no account, key or secret. Codex is pointed at it with
// `-c model_provider=mock ...` (see real-codex.ps1).
//
// One turn = two model requests:
//   1. the user's prompt      -> an `apply_patch` tool call, which fires
//                                PreToolUse and the plugin's diff gate
//                                (matcher ^(apply_patch|Edit|Write)$)
//   2. the tool's output back -> a plain assistant message (turn ends: Stop)
// apply_patch is a freeform ("custom") tool, offered only to models Codex has
// metadata for: real-codex.ps1 asks for a real model slug (gpt-5.5) even
// though every request lands here. Codex's own `update_plan` tool would hit
// the plan gate, but `codex exec` does not offer it.
// Every request is logged as one JSON line to stdout so a failed run shows
// what Codex actually sent.
//
// Usage: node mock-responses-server.mjs <port>
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8765);
let n = 0;
const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
const usage = { input_tokens: 1, input_tokens_details: null, output_tokens: 1, output_tokens_details: null, total_tokens: 2 };

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    console.log(JSON.stringify({ method: req.method, url: req.url, bytes: body.length }));
    if (req.method === "GET" && req.url.includes("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ models: [], data: [] }));
      return;
    }
    if (req.method !== "POST" || !req.url.includes("/responses")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const id = `resp_mock_${++n}`;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    sse(res, "response.created", { response: { id } });
    const toolAnswered = body.includes("custom_tool_call_output") || body.includes("function_call_output");
    const item = toolAnswered
      ? { type: "message", role: "assistant", id: `msg_${n}`, content: [{ type: "output_text", text: "hi from the mock model" }] }
      : {
          type: "custom_tool_call",
          id: `ctc_${n}`,
          call_id: `call_mock_patch_${n}`,
          name: "apply_patch",
          input: "*** Begin Patch\n*** Add File: hello.txt\n+hi\n*** End Patch\n",
        };
    sse(res, "response.output_item.done", { item });
    sse(res, "response.completed", { response: { id, usage } });
    res.end();
  });
}).listen(port, "127.0.0.1", () => console.log(`mock responses server on ${port}`));
