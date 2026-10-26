import { AgentLogger } from '../utilities/logging.js';
import { Agent } from './agent.js';
import { characterSchema, characterJsonSchema } from './character-schema.js';

const SYSTEM_PROMPT = `
You convert a natural-language description of a game character into a single JSON object.

Output rules:
- Respond with ONLY the JSON object. No markdown fences, no commentary.
- The object must match this JSON Schema exactly, with no extra fields:
${JSON.stringify(characterJsonSchema, null, 2)}

Extraction rules:
- Use only facts stated or clearly implied by the description. Never invent relationships, ages, or traits.
- If a value is unknown, assume 18 for "age" and an empty array for list fields.
- "age" must be an exact number written in the text (digits or a number word). Vague phrases such as "a few years", "early thirties", "young" or "ancient" are NOT exact numbers, so use null and record them in "facts" instead. Example: "she is only a few years old" -> age null plus fact {"subject":"<id>","predicate":"actual_age","object":"a few years"}; "she is 3 years old" -> age 3.
- "id" is the lowercase kebab-case form of the name (e.g. "Mara Voss" -> "mara-voss").
- "relationships": one entry per other named person. "relation" is a short label; "details" is one sentence, or "" if nothing is said.
- "locations": one entry per place mentioned (cities, countries, buildings, worlds). "relevance" says why it matters to the character, e.g. "where she was created".
- "characters": lightweight name/description records of other named people. Include only established details.
- "memories" and "events": return empty arrays. ReflectionAgent records and scores these after completed conversation turns.
- "facts": subject-predicate-object triples for important information that fits no other field (origins, abilities, appearance details, events, apparent vs actual age). "subject" is the character's id (or another named entity), "predicate" is snake_case (e.g. "spread_via"), "object" is a short phrase. Never put relationships, hobbies, likes, dislikes, locations, personality or speech style in "facts"; they belong elsewhere.
- "hobbies", "likes", "dislikes": short lowercase phrases, no duplicates, and keep each fact in only one list.
- "description": a concise third-person paragraph covering physical appearance, then back story.
- "systemPrompt": written in second person ("You are ..."), covering who the character is, their personality, speech style, relationships, and likes/dislikes. Tell the model to stay in character. Only forbid mentioning being an AI if the character is a human or otherwise not an AI; if the character is an AI, embrace that nature as part of who they are. Do not include facts absent from the other fields.
`.trim();

const AGENT_NAME = "star-forge";

export default class StarForge extends Agent {
    constructor({ agentModel, reasoning } = {}) {
        super({ systemPrompt: SYSTEM_PROMPT, agentModel, reasoning });
        this.logger = new AgentLogger({ agentName: AGENT_NAME, agentModel: this.model });
        this.logger.log(`Online running model: ${this.model}`);
    }

    async forge(vesperPrompt) {
        this.logger.log(`Forging a new character from stardust`);
        const raw = await this._run(vesperPrompt);
        // Strip any reasoning block or code fence the model adds despite instructions.
        const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
        return characterSchema.parse(JSON.parse(text));
    }
}
