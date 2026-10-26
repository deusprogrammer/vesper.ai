# Vesper AI

Node.js ES modules with OpenAI-compatible agents. Install with `npm install`,
copy `.env.example` to `.env`, then configure your server/key and optional per-agent models.
The default model is `qwen3:8b`. `REASONING` accepts `none`, `minimal`, `low`,
`medium`, `high`, `xhigh` or `max`; supported behavior depends on the server/model.

## Character lifecycle

- `StarForge.forge(description)` creates validated character data.
- `ContextAgent.gatherContext(message, character)` retrieves relevant stored data.
- `ReflectionAgent.reflect(turnTranscript, character)` records what was learned during
  one completed turn and returns the same character object, updated in place.

Agents accept `{ agentModel, reasoning }`. Reflection extracts relationships,
known characters (`{ name, description }`), locations, facts, memories and events.
Relationships/known characters/locations are upserted by case-insensitive name.
For updates, the model must supply a complete entry preserving still-valid details.
Facts and recollections are deduplicated by normalized text (not semantic similarity).
Reflection treats specific devices/hosts as locations even without proper names.
A question's premise is not automatically fact, but observations confirmed by the
character can establish a setting. General device inhabitation does not already
record a specific encounter through a user's toaster.
Memories have `{ id, content, importance, strength, decayRate }`; events have
`{ id, name, description, importance, strength, decayRate }`.
IDs are application-generated UUIDs, while initial scores are model-assigned and validated.
Existing JSON without `characters`, `memories` or `events` loads with empty arrays.
Zero-strength entries remain stored and may be recalled.

All three scores are in **[0, 1]**. Application code, not the model, applies:

```js
// Once per completed turn, to entries that existed before reflection:
strength = strength * (1 - decayRate);

// Once per matched entry per gatherContext call:
strength = Math.min(1, strength + importance * decayRate);
```

Overlapping JSONPaths do not reinforce an entry twice in the same retrieval.
Projected properties (such as a memory's content) also count as access.
With zero decay, neither decay nor reinforcement changes strength.
New entries do not decay on their creation turn. A successful empty reflection still
decays existing entries; failed extraction or validation leaves the character untouched.
Reflection logs JSON/schema validation failures and attempts one correction using the
invalid response and validation errors. Unsupported fields are never silently dropped.
If correction also fails, the error propagates and state stays unchanged; API failures
do not trigger this validation retry.
Call reflection exactly once per turn: repeated calls apply repeated decay.

```js
import ReflectionAgent from './src/agents/reflection-agent.js';
import ContextAgent from './src/agents/context-agent.js';

const reflector = new ReflectionAgent({ agentModel: 'qwen3:8b', reasoning: 'none' });
const retriever = new ContextAgent({ agentModel: 'qwen3:8b', reasoning: 'none' });
const character = characterMap.get('vesper');
const context = await retriever.gatherContext(userMessage, character);
// Generate a response using the context, then:
await reflector.reflect(`User: ${userMessage}\nVesper: ${reply}`, character);
```

State lives in the passed object (including when it is a value in a `Map`).
The caller owns saving to disk/database. Reflection and context selection apply their
validated results to the latest character state after inference, so retrieval and
reflection may overlap without replacing newer state with stale snapshots.
Serialize reflection calls for a given character; CharacterAgent handles this.
Retrieved memory/event summaries are included in the selection prompt. Reinforcement
applies only to entries explicitly selected in the returned JSONPaths.
The model's factual interpretation and semantic deduplication are not guaranteed.

## Character conversations

Run `npm start` for a stdin chat with the saved Vesper fixture. Enter a message
per line; `/exit`, Ctrl+C, or end-of-input closes the chat after pending reflection
finishes. Piped input is supported. Changes stay in memory for this session; the
fixture is not overwritten. Configure `CHARACTER_MODEL`, `CONTEXT_MODEL`,
`REFLECTION_MODEL` and `REASONING` in `.env`.

`CharacterAgent` orchestrates retrieval, speech and reflection:

```js
import CharacterAgent from './src/agents/character-agent.js';

const speaker = new CharacterAgent({
    character: characterMap.get('vesper'),
    agentModel: 'qwen3:8b',
    reasoning: 'none',
    historyTurns: 2,
});

const reply = await speaker.speakTo('Do you miss Ingrid?');
console.log(reply); // Reflection may still be running.
await speaker.waitForReflection(); // Await before saving state or exiting.
```

Each turn retrieves context, generates a reply using the character's system prompt,
then starts reflection with the actual user message and reply. `speakTo()` returns
the reply without awaiting reflection. Speech calls queue in invocation order, but
can retrieve context and generate the next reply while reflection is still running.
Reflection has its own ordered queue; only one reflection runs per character at a time.
Recent dialogue supplies short-term continuity until long-term memory catches up.

`historyTurns` defaults to **2 completed turns**, each containing a real user message
and assistant response. Both roles are sent in order before the current user/context
message, and older complete turns drop out. Stored history does not retain old context
payloads. Use `historyTurns: 0` to disable it or set `HISTORY_TURNS=2` in `.env` for
the CLI. This is a turn-count limit, not a token limit. The current input is always sent.
History is session-local and is not persisted to the character object.

By default, the supporting agents use the same model/reasoning as the speaker.
Pass `contextAgent` and `reflectionAgent` instances to use separately configured models.
Use one CharacterAgent per character and do not mutate its character concurrently.

Failures are logged. A reflection failure (after one correction retry) is skipped:
that turn is not stored in long-term memory, the error is recorded in
`agent.reflectionFailures` and the debug log, and the conversation continues.
Retrieval/generation failures reject the turn and stop the speech queue.
There is no silent recovery for those: repair the underlying issue,
reconcile any failed turn as needed, and create a new CharacterAgent to resume.
Invalid (empty/non-string) user input is rejected without affecting the queue.

Reflection receives only extraction-relevant knowledge (names, relationships, locations,
facts, memory contents, event summaries), never the persona prompt or biography, so the
model is not pulled into role-play or into echoing the profile.

After the first turn, the speaker receives `conversation.note` telling it that it has
already introduced itself, so it does not re-explain its identity every reply. The speaker
prompt also asks for short, conversational replies that show personality without naming it.

## Agent debug logs

Each process writes two matching session logs under `logs/`:

- `agents-<timestamp>-<session-id>.log`: human-readable, labeled sections with
  multiline prompts, replies, errors and pretty-printed state.
- `agents-<timestamp>-<session-id>.jsonl`: structured raw trace for tooling.

`npm start` prints both absolute paths. Files are created on the first logged event.
Prompts and response behavior are unchanged by logging. Both files share sequence
numbers so you can cross-reference entries.

The readable log shows **"Selecting these keys based on the conversation:"**
with the user input, requested paths, successfully selected paths and retrieved data.
Before each speech turn it shows **"The current memory object is this:"** (the full
character state), and the actual speech request shows **"The current base prompt
for the character is:"**. Reflection logs its proposed changes and resulting state.
These describe actual selections and state, not a model-generated explanation
of why each path was chosen. Existing session files are not retroactively converted.

Each line is a JSON record with a timestamp, monotonically increasing sequence,
session ID, agent class/instance ID, request ID, model, and reasoning setting.
`request` records contain the exact system/user messages sent to the model.
`response` records contain raw output (before parsing or removing reasoning blocks),
output text, status, usage and elapsed milliseconds. `error` records capture API
error name/message/status/code and elapsed time. Pair records using `requestId`;
concurrent calls may interleave, but lines remain in observed event order.

Appends are synchronous to preserve process-local order. Log write failures surface
as errors rather than silently dropping debug data. Each process has its own file;
logs do not attempt to provide a cross-process ordering.
API keys and HTTP headers are not recorded, but **conversation content, character
data, model reasoning output, and API error messages may be sensitive**.
Files are created with owner-only permissions and the logs directory is Git-ignored.
There is no automatic rotation or deletion; remove old session logs when no longer
needed. Mocked tests that override `_run` bypass request/response tracing but may
still log higher-level state and selection events.

## Running tests

- `npm test`: deterministic offline tests with mocked model responses; no API calls.
- `npm run test:star-forge -- "description"`: live character generation.
- `npm run test:context-agent -- "question"`: live retrieval against the Vesper fixture.
- `npm run test:reflection-agent -- "completed turn transcript"`: live reflection and
  retrieval, displaying scores before and after access. Without an argument, uses
  a sample observatory incident. The fixture is never overwritten.
- `node --env-file=.env test-harnesses/reflection-toaster.js`: live regression
  asserting the confirmed toaster setting is retained in at least one category.

Live harnesses load `.env`; use `REFLECTION_MODEL`, `CONTEXT_MODEL`,
`COMPILER_MODEL`, and `REASONING` to configure them.
