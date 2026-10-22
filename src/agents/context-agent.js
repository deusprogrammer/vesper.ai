import { z } from 'zod';
import { AgentLogger } from '../utilities/logging.js';
import { parsePath, queryPath } from '../utilities/json-path.js';
import { Agent } from './agent.js';

// systemPrompt and id are left out: the character already runs on its systemPrompt.
const SELECTABLE_FIELDS = [
    'name', 'age', 'relationships', 'locations',
    'hobbies', 'likes', 'dislikes', 'facts', 'description',
];

const SYSTEM_PROMPT = `
You decide which parts of a character's stored data are needed to respond to a user's message.
You do not answer the message yourself. You only choose what data to retrieve.

You will receive:
- "Character index": the character's name plus the names of their relationships and locations, and the subject/predicate of each fact.
- "User input": the message the character is about to respond to.

The stored character data has these fields:
- name (string), age (number or null)
- relationships: [{ name, relation, details }]
- locations: [{ name, relevance }]
- hobbies, likes, dislikes: [string]
- facts: [{ subject, predicate, object }]
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
- Only filter on names, subjects and predicates that appear in the character index, spelled exactly as shown.
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
        const index = buildIndex(character);
        const raw = await this._run(
            `Character index:\n${JSON.stringify(index, null, 2)}\n\nUser input:\n${userInput}`,
        );
        // Strip any reasoning block or code fence the model adds despite instructions.
        const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
        const paths = pathListSchema.parse(JSON.parse(text));

        const context = {};
        for (const path of new Set(paths)) {
            const parsed = parsePath(path);
            if (!parsed || !SELECTABLE_FIELDS.includes(parsed.field)) {
                this.logger.log(`Skipping unsupported path: ${path}`);
                continue;
            }
            const result = queryPath(character, parsed);
            if (result === undefined) {
                this.logger.log(`No data for path: ${path}`);
                continue;
            }
            context[path] = result;
        }
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
    };
}
