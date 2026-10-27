
import { Agent } from './agent.js';
import { AgentLogger } from '../utilities/logging.js';

export default class ShortTermMemoryAgent extends Agent {
    #previousSummary;

    constructor({
        agentModel,
        reasoning,
        previousSummary = 'This is the first conversation the user and the character have had before.',
    } = {}) {
        super({
            agentModel,
            reasoning,
            systemPrompt: `
You are the short-term memory agent for an ongoing conversation
between a human and a fictional character.

Your task is to maintain a concise, cumulative narrative of what
has happened in the conversation.

You will receive:
- The existing conversation summary.
- The latest message from the human.
- The character's latest response.

Update the existing summary to incorporate the latest exchange.

Rules:
1. Preserve important information from the previous summary.
2. Incorporate new events, statements, discoveries, and developments.
3. Maintain chronological and causal continuity.
4. Preserve promises, threats, agreements, contradictions, and
   unresolved questions.
5. Distinguish established facts from claims, suspicions, and beliefs.
6. Do not invent events, emotions, motivations, or intentions.
7. Remove repetition and details that are no longer relevant.
8. Use neutral, third-person language.
9. Keep the summary as concise as possible without losing
   information important to understanding the ongoing conversation.
10. Return only the updated summary, without headings,
    labels, commentary, or formatting.

The summary must describe the conversation as a whole,
not merely the most recent exchange.
`.trim()
        });

        if (typeof previousSummary === 'string') {
            this.#previousSummary = previousSummary;
        }

        this.logger = new AgentLogger({
            agentName: 'short-term-memory-agent',
            agentModel: this.model
        });

        this.logger.log(
            `Online as short-term-memory-agent running model: ${this.model}`
        );
    }

    async remember(userInput, characterResponse) {
        this.#previousSummary = await this._run(`
Previous summary: ${this.#previousSummary}
Last conversation exchange:
User: ${userInput}
Character: ${characterResponse}`
        )

        return this.#previousSummary;
    }

    get summary() {
        return this.#previousSummary;
    }
}
