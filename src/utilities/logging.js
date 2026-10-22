export class AgentLogger {
    constructor({ agentName, agentModel }) {
        this.agentName = agentName;
        this.agentModel = agentModel;
    }

    log(message) {
        console.log(`[${this.agentName.toUpperCase()}(${this.agentModel})] ${message}`);
    }
}