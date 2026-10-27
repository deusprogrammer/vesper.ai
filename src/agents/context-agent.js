import { z } from 'zod';
import { AgentLogger } from '../utilities/logging.js';
import { parsePath, queryPath } from '../utilities/json-path.js';
import { Agent } from './agent.js';
import { characterSchema } from './character-schema.js';

// systemPrompt and id are left out: the character already runs on its systemPrompt.
const SELECTABLE_FIELDS = [
    'name', 'age', 'relationships', 'locations',
    'hobbies', 'likes', 'dislikes', 'facts', 'description', 'characters', 'memories', 'events',
];

const SYSTEM_PROMPT = `
You decide which parts of a character's stored data are needed to respond to a user's message.
You do not answer the message yourself. You only choose what data to retrieve.

You will receive:
- "Character index": the character's name, known people, relationship and location names,
  fact subject/predicate pairs, and summaries of memories and events with their IDs.
- "User input": the message the character is about to respond to.

The stored character data has these fields:
- name (string), age (number or null)
- relationships: [{ name, relation, details }]
- locations: [{ name, relevance }]
- hobbies, likes, dislikes: [string]
- facts: [{ subject, predicate, object }]
- characters: [{ name, description }] (known people)
- memories: [{ id, content, importance, strength, decayRate }]
- events: [{ id, name, description, importance, strength, decayRate }]
- description (string): physical appearance and back story

Output:
- Respond with ONLY a JSON array of JSONPath strings. No markdown fences, no commentary.
- Return [] if the message needs no stored data (e.g. a simple greeting).

Allowed path forms. Use nothing else:
- $.field                          a whole field, e.g. $.likes
- $.field[?(@.key=='value')]       entries whose key equals value, e.g. $.relationships[?(@.name=='Warden')]
- $.field[*].key                   one key from every entry, e.g. $.relationships[*].name

Rules:
- Choose the smallest set of paths that covers what the character needs. Prefer a filtered entry over a whole list.
- Only filter on names, subjects, predicates and IDs that appear in the character index, spelled exactly as shown.
- Select relevant memories/events by ID: $.memories[?(@.id=='<id>')] or $.events[?(@.id=='<id>')].
  Do not fetch whole memory/event lists unless the user really asks for all of them.
- Include data that is clearly relevant even if the user did not name it directly (e.g. "Who made you?" -> the creator relationship and the origin fact).

Examples (for a character with a relationship named "Warden" and a fact predicate "origin"):
- "hi!" -> []
- "What's your deal with Warden?" -> ["$.relationships[?(@.name=='Warden')]"]
- "What do you like to do for fun?" -> ["$.hobbies", "$.likes"]
- "Where did you come from?" -> ["$.facts[?(@.predicate=='origin')]", "$.locations"]
`.trim();

const AGENT_NAME = "context-agent";

const pathListSchema = z.array(z.string());

export default class ContextAgent extends Agent {
    constructor({ agentModel, reasoning } = {}) {
        super({ systemPrompt: SYSTEM_PROMPT, agentModel, reasoning });
        this.logger = new AgentLogger({ agentName: AGENT_NAME, agentModel: this.model });
        this.logger.log(`Online running model: ${this.model}`);
    }

    // Returns an object mapping each JSONPath that matched data to its result.
    async gatherContext(userInput, character) {
        if (typeof userInput !== 'string' || !userInput.trim()) {
            throw new TypeError('userInput must be a non-empty string.');
        }
        const snapshot = characterSchema.parse(character);
        const index = buildIndex(snapshot);
        const raw = await this._run(
            `Character index:\n${JSON.stringify(index, null, 2)}\n\nUser input:\n${userInput}`,
        );
        // Strip any reasoning block or code fence the model adds despite instructions.
        const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
        const paths = pathListSchema.parse(JSON.parse(text));

        // Reflection may have committed new knowledge while selection was running.
        const next = characterSchema.parse(character);
        const selected = [];
        const accessed = new Set();
        for (const path of new Set(paths)) {
            const parsed = parsePath(path);
            if (!parsed || !SELECTABLE_FIELDS.includes(parsed.field)) {
                this.logger.log(`Skipping unsupported path: ${path}`);
                continue;
            }
            const result = queryPath(next, parsed);
            if (result === undefined) {
                this.logger.log(`No data for path: ${path}`);
                continue;
            }
            selected.push({ path, parsed });
            if (parsed.field === 'memories' || parsed.field === 'events') {
                const entries = queryPath(next, { ...parsed, subField: undefined });
                for (const entry of entries) {
                    if (!parsed.subField || Object.hasOwn(entry, parsed.subField)) {
                        accessed.add(entry);
                    }
                }
            }
        }
        //reinforceMemories(accessed);
        const context = Object.fromEntries(selected.map(({ path, parsed }) => [path, queryPath(next, parsed)]));
        Object.assign(character, next);
        this.logger.debug('Selecting these keys based on the conversation:', {
            userInput,
            requestedKeys: paths,
            selectedKeys: Object.keys(context),
            context,
        });
        return context;
    }
}

// A small summary of the character, so the model can write exact filters
// without receiving the full (and growing) character JSON.
function buildIndex(character) {
    const pairs = new Set(character.facts.map((fact) => `${fact.subject} / ${fact.predicate}`));
    return {
        name: character.name,
        relationships: character.relationships.map((relationship) => relationship.name),
        locations: character.locations.map((location) => location.name),
        facts: [...pairs],
        characters: character.characters,
        memories: character.memories.map(({ id, content }) => ({ id, content })),
        events: character.events.map(({ id, name, description }) => ({ id, name, description })),
    };
}
