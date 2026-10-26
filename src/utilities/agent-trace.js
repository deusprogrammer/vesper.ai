import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const sessionId = randomUUID();
const logPath = resolve('logs', `agents-${new Date().toISOString().replace(/[:.]/g, '-')}-${sessionId}.jsonl`);
const readableLogPath = logPath.replace(/\.jsonl$/, '.log');
let sequence = 0;

export function getAgentLogPath() {
    return logPath;
}

export function getReadableAgentLogPath() {
    return readableLogPath;
}

// Synchronous appends preserve event order across agents within this process.
export function logAgentEvent(event) {
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    const record = {
        ...event,
        sessionId,
        sequence: sequence + 1,
        timestamp: new Date().toISOString(),
    };
    appendFileSync(logPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
    appendFileSync(readableLogPath, formatRecord(record), { encoding: 'utf8', mode: 0o600 });
    sequence++;
}

function formatRecord(record) {
    const heading = `\n${'='.repeat(80)}\n#${record.sequence} ${record.timestamp} | ${record.agent} | ${record.event}\n`;
    const metadata = `Model: ${record.model ?? 'unspecified'} | Agent: ${record.agentId ?? 'unspecified'}`
        + (record.requestId ? ` | Request: ${record.requestId}` : '');
    const section = (label, value) => `\n${label}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 4)}\n`;
    let body = '';
    if (record.event === 'request') {
        for (const message of record.request.input) {
            const label = message.role === 'system'
                ? 'The current base prompt for the character is:'
                : `${message.role === 'assistant' ? 'Previous assistant response' : 'User input / context'}:`;
            body += section(message.role === 'system' && record.agent !== 'CharacterAgent'
                ? 'The agent system prompt is:' : label, message.content);
        }
    } else if (record.event === 'response') {
        body += section(`Agent response (${record.durationMs} ms):`, record.response.output_text);
        body += section('Raw output:', record.response.output);
        if (record.response.usage) body += section('Token usage:', record.response.usage);
    } else if (record.event === 'error') {
        body += section(`Request failed (${record.durationMs} ms):`, record.error);
    } else if (record.event === 'debug') {
        body += section(record.title, record.data);
    }
    return `${heading}${metadata}\n${body}`;
}
