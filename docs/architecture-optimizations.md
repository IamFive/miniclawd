# miniclawd Architecture Optimizations

This document lists optimization opportunities based on the current project design and structure, with a focus on architecture boundaries, the skill system, and security/permissions. Each item includes rationale and actionable recommendations.

---

**Scope**
- Architecture and module boundaries
- Skill system design and invocation flow
- Security and permission boundaries
- Cross-cutting issues that affect these areas

**Priority Scale**
- P0: High risk or high impact, address soon
- P1: Meaningful improvement, plan near-term
- P2: Nice-to-have, longer-term

---

**A. Architecture & Module Boundaries**

1. **P1: Introduce a Tool/Provider factory instead of direct instantiation**
Reason: `AgentLoop` directly instantiates tools and provider, making extension and testing harder and coupling application logic to infrastructure details.  
Recommendation: Add a factory layer or DI container that builds ToolRegistry and LLM provider from config. This enables per-agent tool sets, per-channel policies, and easier testing.

2. **P1: Extract message bus interface and add optional persistence**
Reason: The current message bus is in-memory only, which is fragile for gateway deployments or long-running reliability.  
Recommendation: Keep the in-memory bus as default, but add a pluggable bus interface with optional persistence (e.g., file-backed queue or Redis). This also improves testability.

3. **P1: Consolidate duplicated tool registration between main agent and subagent**
Reason: `AgentLoop` and `SubagentManager` both manually register tools, risking drift and inconsistent capabilities.  
Recommendation: Create a shared tool builder that accepts a policy (main vs subagent) to enable or disable tools.

4. **P2: Normalize storage paths to workspace configuration**
Reason: Session storage is currently hardcoded to `~/.miniclawd/sessions`, while other data uses workspace. This is inconsistent and makes workspace isolation harder.  
Recommendation: Add a config-driven storage root, or use workspace-local sessions for portability.

5. **P2: Add explicit lifecycle management for channels and scheduler**
Reason: Lifecycle is managed in CLI command handlers without a formal system orchestrator, which makes testing and graceful shutdown harder.  
Recommendation: Introduce a `Runtime` or `App` layer that coordinates startup/shutdown and encapsulates wiring.

---

**B. Skill System Design**

1. **P1: Add skill metadata schema validation and versioning**
Reason: Skill frontmatter is loosely parsed, with limited validation. Invalid metadata can silently degrade behavior.  
Recommendation: Define a strict schema (name, version, tags, required tools, optional intents) and validate during load, emitting warnings on invalid skills.

2. **P1: Enforce skill-scoped tool allowlists**
Reason: Skills can instruct LLM to call any available tool, which is powerful but risky.  
Recommendation: Introduce an optional `allowed_tools` field per skill and enforce it in ToolRegistry execution for skill-driven calls.

3. **P1: Token budgeting for always-loaded skills**
Reason: Always-loaded skills inflate system prompt size and can reduce reasoning quality or increase cost.  
Recommendation: Add token budgeting and trimming; only include always skills with highest priority or compressed summaries.

4. **P2: Add skill discovery scoring or intent mapping**
Reason: The LLM must select from a large summary list without explicit ranking.  
Recommendation: Build a lightweight intent classifier or embeddings-based lookup to rank likely skills before prompting the LLM.

5. **P2: Create a skill lint and test harness**
Reason: Skills are executable guidance but have no automated validation.  
Recommendation: Add a CLI command (e.g., `miniclawd skills lint`) that checks frontmatter, required tools, and example tool calls.

---

**C. Security & Permission Boundaries**

1. **P0: Constrain `exec` tool by policy**
Reason: `exec` can run arbitrary commands, which is a critical risk if a skill or prompt is compromised.  
Recommendation: Add a policy layer for allowed commands, or require explicit user approval for shell execution. Consider a sandboxed runner for untrusted tasks.

2. **P0: Restrict write/edit operations to workspace by default**
Reason: `write_file` and `edit_file` can modify any path, which is risky in multi-tenant or shared environments.  
Recommendation: Enforce a default workspace root for write operations, with opt-in overrides via config.

3. **P1: Harden web fetch against SSRF and internal network access**
Reason: URL validation only checks scheme and hostname. It does not block internal IP ranges or localhost.  
Recommendation: Add SSRF protections by resolving hostnames and denying private IP ranges, localhost, and link-local addresses by default.

4. **P1: Add tool-level audit logging**
Reason: Tool calls are powerful and should be traceable.  
Recommendation: Log all tool invocations with arguments (redacted), timestamps, and result status, enabling incident analysis.

5. **P2: Sanitize subagent announcements**
Reason: Subagent results are injected as system messages, which can amplify prompt injection or unintended instructions.  
Recommendation: Wrap subagent output in a safe format, or tag as data-only and enforce a parser that prevents instruction injection.

---

**D. Cross-Cutting Improvements (Supporting A, B, C)**

1. **P1: Add structured tracing for LLM calls and tool loops**
Reason: Debugging tool-call loops and skill usage is difficult without timing and trace IDs.  
Recommendation: Add a correlation ID to each inbound message and propagate through LLM calls and tool executions.

2. **P2: Improve configuration overrides and environment handling**
Reason: Environment overrides exist, but lack central visibility and validation.  
Recommendation: Provide a `miniclawd config validate` command and log effective config on startup in debug mode.

---

**Suggested Next Steps**

1. Implement a tool execution policy layer (P0/P1)  
2. Add skill metadata schema + linting (P1)  
3. Refactor tool registration into a shared builder (P1)  
4. Harden web fetch SSRF protections (P1)

If you'd like, I can turn these into an actionable roadmap with owners, effort estimates, and phased milestones.

