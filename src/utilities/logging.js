export class AgentLogger {
    constructor({ agentName, agentModel }) {
        this.agentName = agentName;
        this.agentModel = agentModel;
    }

    log(message) {
        console.log(`[${this.agentName.toUpperCase()}(${this.agentModel})] ${message}`);
    }

    debug(title, data) {
        logAgentEvent({
            event: 'debug',
            agent: this.agentName,
            model: this.agentModel,
            title,
            data,
        });
    }
}
import { logAgentEvent } from './agent-trace.js';
