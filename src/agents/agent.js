import 'dotenv/config';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

export const DEFAULT_MODEL = 'qwen3:8b';

// Effort levels accepted by the OpenAI Responses API. Not every model or server supports all of them.
export const REASONING_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export class Agent {
    messages = [];

    constructor({
        apiKey = process.env.OPENAI_API_KEY,
        systemPrompt = '',
        agentModel,
        reasoning,
    } = {}) {
        if (reasoning !== undefined && !REASONING_LEVELS.includes(reasoning)) {
            throw new TypeError(`reasoning must be one of ${REASONING_LEVELS.join(', ')}, or undefined.`);
        }
        this.agentId = randomUUID();
        this.systemPrompt = systemPrompt;
        this.model = agentModel || DEFAULT_MODEL;
        this.reasoning = reasoning;
        this.client = new OpenAI({ apiKey });
    }

    async _run(input) {
        this.messages = [{ role: 'user', content: input }];
        return this.#respond();
    }

    async _continue(input) {
        this.messages.push({ role: 'user', content: input });
        return this.#respond();
    }

    async #respond() {
        const request = {
            model: this.model,
            ...(this.reasoning === undefined ? {} : {
                reasoning: { effort: this.reasoning },
            }),
            input: [
                { role: 'system', content: this.systemPrompt },
                ...this.messages,
            ],
        };
        const requestId = randomUUID();
        const metadata = {
            agent: this.constructor.name,
            agentId: this.agentId,
            requestId,
            model: this.model,
            reasoning: request.reasoning,
        };
        const started = Date.now();
        let response;
        try {
            response = await this.client.responses.create(request);
        } catch (error) {
            throw error;
        }
        return response.output_text;
    }
}
