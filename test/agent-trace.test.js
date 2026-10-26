import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

const originalDirectory = process.cwd();
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'vesper-agent-trace-'));
process.chdir(temporaryDirectory);
const { Agent } = await import('../src/agents/agent.js');
const { getAgentLogPath, getReadableAgentLogPath } = await import('../src/utilities/agent-trace.js');
const { AgentLogger } = await import('../src/utilities/logging.js');

after(() => {
    process.chdir(originalDirectory);
    rmSync(temporaryDirectory, { recursive: true });
});

function records() {
    return readFileSync(getAgentLogPath(), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

function makeAgent() {
    return new Agent({ apiKey: 'fake-private-key', systemPrompt: 'Stay in character.', reasoning: 'none' });
}

test('logs exact requests and raw responses with correlated IDs, usage and timing', async () => {
    const agent = makeAgent();
    const output = {
        id: 'response-1',
        status: 'completed',
        output_text: '<think>Private reasoning</think>Hello',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
    };
    let sent;
    agent.client.responses.create = async (request) => {
        sent = request;
        return output;
    };
    assert.equal(await agent._run('Who are you?'), output.output_text);
    const [request, response] = records();
    assert.equal(request.event, 'request');
    assert.deepEqual(request.request, sent);
    assert.equal(request.agent, 'Agent');
    assert.equal(request.agentId, agent.agentId);
    assert.equal(request.requestId, response.requestId);
    assert.equal(response.event, 'response');
    assert.deepEqual(response.response, output);
    assert.ok(response.durationMs >= 0);
    assert.ok(Number.isFinite(Date.parse(request.timestamp)));
    const serialized = readFileSync(getAgentLogPath(), 'utf8');
    assert.equal(serialized.includes('fake-private-key'), false);
    assert.equal(statSync(getAgentLogPath()).mode & 0o777, 0o600);
});

test('API errors are recorded without headers and rethrown unchanged', async () => {
    const agent = makeAgent();
    const failure = Object.assign(new Error('Model unavailable'), {
        status: 503,
        code: 'unavailable',
        headers: { authorization: 'never-log-this-header' },
    });
    agent.client.responses.create = async () => { throw failure; };
    await assert.rejects(agent._run('Hello'), (error) => error === failure);
    const [request, error] = records().filter((record) => record.agentId === agent.agentId);
    assert.equal(error.event, 'error');
    assert.equal(error.requestId, request.requestId);
    assert.deepEqual(error.error, {
        name: 'Error', message: 'Model unavailable', status: 503, code: 'unavailable',
    });
    assert.equal(JSON.stringify(error).includes('never-log-this-header'), false);
});

test('concurrent requests are logged in observed order with distinct request IDs', async () => {
    const first = makeAgent();
    const second = makeAgent();
    const gate = Promise.withResolvers();
    first.client.responses.create = () => gate.promise;
    second.client.responses.create = async () => ({ output_text: 'Second completes first' });
    const pending = first._run('First');
    await second._run('Second');
    gate.resolve({ output_text: 'First completes last' });
    await pending;
    const events = records().filter((record) => [first.agentId, second.agentId].includes(record.agentId));
    assert.deepEqual(events.map((record) => [record.agentId, record.event]), [
        [first.agentId, 'request'], [second.agentId, 'request'],
        [second.agentId, 'response'], [first.agentId, 'response'],
    ]);
    assert.notEqual(events[0].requestId, events[1].requestId);
    assert.equal(events[0].requestId, events[3].requestId);
    const all = records();
    assert.deepEqual(all.map((record) => record.sequence), all.map((record, index) => index + 1));
    assert.equal(new Set(all.map((record) => record.sessionId)).size, 1);
});

test('shared request path sends dialogue history between system prompt and current input', async () => {
    const agent = makeAgent();
    const history = [
        { role: 'user', content: 'I am Lena.' },
        { role: 'assistant', content: 'Hello, Lena.' },
    ];
    agent.client.responses.create = async (request) => {
        assert.deepEqual(request.input, [
            { role: 'system', content: 'Stay in character.' },
            ...history,
            { role: 'user', content: 'Do you remember my name?' },
        ]);
        return { output_text: 'Lena.' };
    };
    assert.equal(await agent._run('Do you remember my name?', history), 'Lena.');
    assert.equal(history.length, 2);
});

test('readable log includes multiline prompts, replies, errors and ordered memory/context sections', () => {
    const logger = new AgentLogger({ agentName: 'context-agent', agentModel: 'test-model' });
    logger.debug('Selecting these keys based on the conversation:', {
        userInput: 'Who are you?',
        selectedKeys: ['$.name'],
        context: { '$.name': 'Vesper' },
    });
    logger.debug('The current memory object is this:', { name: 'Vesper', memories: [] });
    const readable = readFileSync(getReadableAgentLogPath(), 'utf8');
    assert.ok(readable.includes('The agent system prompt is:\nStay in character.'));
    assert.ok(readable.includes('Private reasoning'));
    assert.ok(readable.includes('Request failed ('));
    assert.ok(readable.includes('Model unavailable'));
    assert.ok(readable.includes('Selecting these keys based on the conversation:'));
    assert.ok(readable.includes('    "selectedKeys": [\n        "$.name"\n    ]'));
    assert.ok(readable.includes('The current memory object is this:'));
    assert.equal(readable.includes('fake-private-key'), false);
    assert.equal(readable.includes('never-log-this-header'), false);
    assert.equal(statSync(getReadableAgentLogPath()).mode & 0o777, 0o600);
    const sequences = [...readable.matchAll(/^#(\d+) /gm)].map((match) => Number(match[1]));
    assert.deepEqual(sequences, records().map((record) => record.sequence));
});
