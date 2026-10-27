import { Agent } from './agent.js';
import { AgentLogger } from '../utilities/logging.js';

export default class CharacterAgent extends Agent {
    constructor({ agentModel, reasoning, systemPrompt } = {}) {
        super({
            agentModel,
            reasoning,
            systemPrompt
        });

        this.logger = new AgentLogger({
            agentName: 'character-agent',
            agentModel: this.model
        });

        this.logger.log(
            `Online as character-agent running model: ${this.model}`
        );
    }

    async speakTo(userInput, compiledPrompt) {
        if (typeof userInput !== 'string' || !userInput.trim()) {
            throw new TypeError(
                'userInput must be a non-empty string.'
            );
        }

        if (typeof compiledPrompt !== 'string' || !compiledPrompt.trim()) {
            throw new TypeError(
                'compiledPrompt must be a non-empty string.'
            );
        }

        const reply = await this._run(
            userInput,
            [],
            { systemPrompt: `
${this.systemPrompt}
# Recent conversation and context
${compiledPrompt}
            ` }
        );

        if (typeof reply !== 'string' || !reply.trim()) {
            throw new Error(
                'CharacterAgent received an empty response.'
            );
        }

        return reply.trim();
    }
}