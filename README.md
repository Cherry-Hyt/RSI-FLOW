# RSI-FLOW

This repository collects four related projects. They are separate codebases, not a single deployed application.

| Directory | Purpose |
| --- | --- |
| `rsi-flow-visual/` | React visual component library and the standalone Agent Studio demo in `demo/` |
| `rsi-flow/` | Multi-module Java workflow engine |
| `rsi-flow-spring-boot/` | Spring Boot integration and backend examples |
| `rsi-flow-platform/` | Next.js frontend, including its locally bundled `@horsecoder/flow` package |

## Run Agent Studio (Windows x64)

Download `Agent-Studio-Portable-Windows-x64.zip` from the GitHub Releases page, extract it completely, and double-click `Start-Agent-Studio.cmd`. Keep the terminal window open while using the app. The local page is `http://127.0.0.1:1234/agent-studio.html`.

The portable package includes Node.js. Enter your own HTTPS OpenAI-compatible API endpoint, model, and API key in the local page. Model-provider charges and availability depend on your provider. Do not commit API keys or put real credentials in screenshots. The standalone Agent Studio uses its local Node service; it does not run through the Java engine, Spring Boot backend, or Next.js frontend.

For standalone development, the demo source is in `rsi-flow-visual/demo/`. Run `node agent-local-server.js` there and open the local URL above. Tests: `node agent-local-server.graph.test.js` and `node agent-local-server.test.js`.

## Other projects

Consult each project's README and build files for its own dependencies. This public source snapshot excludes the original Git histories, local build outputs, internal deployment scripts, and private service endpoints. In the Spring Boot example profiles, configure `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, and `EUREKA_URL` in your environment before attempting a deployment. The platform's optional development storage proxy is set with `DEV_STORAGE_ORIGIN`. No public deployment of these projects is implied.

The bundled `@horsecoder/flow` package retains its author and ISC license declaration. Source-level licensing and third-party icon provenance should be confirmed with the respective maintainers before redistributing the components separately. Original upstream projects: `ymxiong/rsi-flow`, `ymxiong/rsi-flow-spring-boot`, and `ymxiong/rsi-flow-platform` on GitHub. This repository is a sanitized source snapshot, not a mirror of their Git histories.
