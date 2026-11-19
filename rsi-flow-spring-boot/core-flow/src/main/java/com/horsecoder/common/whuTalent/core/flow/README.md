# Configurable agent workflow

Set `AGENT_ALLOWED_API_HOSTS` to a comma-separated list of trusted HTTPS API hosts
(e.g. `api.example.com,models.example.net`) in the server environment. A request
cannot call an unlisted host. Each endpoint must use HTTPS on port 443 and the
`/v1/chat/completions` path. Configure the list before starting the service.

POST `/api/agent/workflow` with one supervisor and 1-12 workers:

```json
{
  "objective": "Summarize the proposal and check its risks",
  "maxRevisions": 1,
  "supervisor": {
    "id": "lead",
    "role": "Assign tasks and approve a consolidated answer",
    "apiUrl": "https://api.example.com/v1/chat/completions",
    "apiKey": "<supervisor key>",
    "model": "supervisor-model"
  },
  "workers": [
    {
      "id": "writer",
      "role": "Draft the summary",
      "apiUrl": "https://api.example.com/v1/chat/completions",
      "apiKey": "<writer key>",
      "model": "writer-model"
    },
    {
      "id": "reviewer",
      "role": "Identify risks and omissions",
      "apiUrl": "https://api.example.com/v1/chat/completions",
      "apiKey": "<reviewer key>",
      "model": "reviewer-model"
    }
  ]
}
```

Supervisor creates exactly one task per worker, reviews results, and can request
rework for specific tasks. `maxRevisions` accepts 0-2; the response contains
`approved`, `answer` (only after approval), `feedback`, `revisions`, and
`results`. Keys and endpoint settings are used only during this request and
are not returned or persisted by this workflow. Use HTTPS for the application's
own endpoint too; do not put keys in URL query strings or logs. This is a
synchronous API: provision server/request timeouts for up to 3 rounds of model
calls. The supported provider protocol is OpenAI-compatible chat completions.

The HTTP endpoint executes `FLOW_AGENT_WORKFLOW` through `FlowEngine`. Its flow
resource is registered on first use, after the engine initializes. Each round
runs the selected workers, the supervisor reviews, and a bounded back edge
re-enters the round for selected tasks. The engine context is released after
success or failure. Deployment must include the locally updated `rsi-flow`
modules supporting `maxIterations`; the published `0.4.14` artifact alone is
not evidence that this feature is present. The legacy Spring Boot reactor also
requires a Java 8 JDK with `tools.jar` to build unchanged.
