import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import CharacterAgent from '../src/agents/character-agent.js';

process.env.OPENAI_API_KEY ??= 'offline-test-key';
const fixture = JSON.parse(readFileSync(new URL('../test-harnesses/fixtures/vesper.json', import.meta.url), 'utf8'));

function setup(options = {}) {
    const calls = [];
    const character = structuredClone(fixture);
    const contextAgent = {
        async gatherContext(input, stored) {
            calls.push(['context', input]);
            assert.equal(stored, character);
            return { facts: stored.facts };
        },
    };
    const reflectionAgent = {
        async reflect(turn, stored) {
            calls.push(['reflection', JSON.parse(turn)]);
            assert.equal(stored, character);
        },
    };
    const agent = new CharacterAgent({ character, contextAgent, reflectionAgent, reasoning: 'none', ...options });
    agent._run = async (input) => {
        calls.push(['response', JSON.parse(input)]);
        return 'Hello, stargazer.';
    };
    return { agent, calls, character, contextAgent, reflectionAgent };
}

test('speech uses character prompt, retrieved context, and reflects both sides of the turn', async () => {
    const { agent, calls, character } = setup();
    assert.ok(agent.systemPrompt.includes(character.systemPrompt));
    assert.equal(await agent.speakTo('Hello'), 'Hello, stargazer.');
    await agent.waitForReflection();
    assert.deepEqual(calls.map(([phase]) => phase), ['context', 'response', 'reflection']);
    assert.equal(calls[1][1].userInput, 'Hello');
    assert.deepEqual(calls[1][1].context, { facts: character.facts });
    assert.deepEqual(calls[2][1], {
        user: 'Hello',
        character: { name: character.name, response: 'Hello, stargazer.' },
    });
});

test('next speech proceeds during reflection; reflections remain ordered and drain on shutdown', async () => {
    const { agent, calls, character, reflectionAgent } = setup();
    const gate = Promise.withResolvers();
    let reflections = 0;
    reflectionAgent.reflect = async () => {
        reflections++;
        if (reflections === 1) {
            await gate.promise;
            character.facts.push({ subject: 'vesper', predicate: 'learned', object: 'New knowledge' });
        }
    };
    const first = agent.speakTo('First');
    const second = agent.speakTo('Second');
    assert.equal(await first, 'Hello, stargazer.');
    assert.equal(reflections, 1);
    assert.equal(await second, 'Hello, stargazer.');
    assert.equal(calls.filter(([phase]) => phase === 'context').length, 2);
    assert.equal(reflections, 1);
    let completed = false;
    const finished = agent.waitForReflection().then(() => { completed = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completed, false);
    gate.resolve();
    await finished;
    assert.equal(reflections, 2);
    assert.equal(calls.filter(([phase]) => phase === 'context').length, 2);
    assert.equal(character.facts.at(-1).object, 'New knowledge');
});

test('default sliding window contains two complete turns with genuine user/assistant roles', async () => {
    const { agent } = setup();
    const histories = [];
    agent._run = async (input, history) => {
        histories.push(structuredClone(history));
        return `Reply to ${JSON.parse(input).userInput}`;
    };
    for (const input of ['One', 'Two', 'Three', 'Four']) await agent.speakTo(input);
    await agent.waitForReflection();
    assert.deepEqual(histories[0], []);
    assert.deepEqual(histories[3], [
        { role: 'user', content: 'Two' }, { role: 'assistant', content: 'Reply to Two' },
        { role: 'user', content: 'Three' }, { role: 'assistant', content: 'Reply to Three' },
    ]);
    assert.equal(agent.messages.length, 4);
    assert.equal(agent.messages[0].content, 'Three');
});

test('window is configurable and zero disables short-term history', async () => {
    for (const historyTurns of [0, 1, 3]) {
        const { agent } = setup({ historyTurns });
        agent._run = async (input, history) => {
            assert.ok(history.length <= historyTurns * 2);
            return 'Reply';
        };
        for (let index = 0; index < 5; index++) await agent.speakTo(`Turn ${index}`);
        await agent.waitForReflection();
        assert.equal(agent.messages.length, historyTurns * 2);
    }
    for (const historyTurns of [-1, 0.5, NaN, Infinity, '2']) {
        assert.throws(() => setup({ historyTurns }), /historyTurns/);
    }
});

test('reflection failure is logged and skipped without blocking later speech', async () => {
    const { agent, calls, reflectionAgent } = setup();
    const failure = new Error('Reflection unavailable');
    let reflections = 0;
    reflectionAgent.reflect = async () => {
        reflections++;
        if (reflections === 1) throw failure;
    };
    assert.equal(await agent.speakTo('Hello'), 'Hello, stargazer.');
    await agent.waitForReflection();
    assert.equal(await agent.speakTo('Next'), 'Hello, stargazer.');
    await agent.waitForReflection();
    assert.equal(reflections, 2);
    assert.equal(calls.filter(([phase]) => phase === 'response').length, 2);
    assert.deepEqual(agent.reflectionFailures, [{ userInput: 'Hello', error: failure }]);
});

test('after the first turn the speaker is told it has already introduced itself', async () => {
    const { agent, calls } = setup();
    await agent.speakTo('Who are you?');
    await agent.speakTo('What do you like?');
    await agent.waitForReflection();
    const [first, second] = calls.filter(([phase]) => phase === 'response').map(([, input]) => input);
    assert.deepEqual(first.conversation, { turnNumber: 1 });
    assert.equal(second.conversation.turnNumber, 2);
    assert.match(second.conversation.note, /already introduced yourself/);
    assert.match(agent.systemPrompt, /never name or describe your own traits/);
});

test('context/generation failures reject speech, do not reflect, and block queued calls', async () => {
    for (const phase of ['context', 'response', 'empty']) {
        const { agent, calls, contextAgent } = setup();
        if (phase === 'context') {
            contextAgent.gatherContext = async () => { throw new Error('Context unavailable'); };
        } else {
            agent._run = async () => {
                if (phase === 'empty') return ' ';
                throw new Error('Response unavailable');
            };
        }
        const first = agent.speakTo('Hello');
        const second = agent.speakTo('Next');
        await assert.rejects(first);
        await assert.rejects(second);
        await assert.rejects(agent.waitForReflection());
        assert.equal(calls.some(([step]) => step === 'reflection'), false);
    }
});

test('invalid speech input does not enter or poison the turn queue', async () => {
    const { agent, calls } = setup();
    for (const input of ['', ' ', null, 123]) {
        await assert.rejects(agent.speakTo(input), TypeError);
    }
    assert.equal(calls.length, 0);
    assert.equal(await agent.speakTo('Hello'), 'Hello, stargazer.');
    await agent.waitForReflection();
});

test('a reply that only echoes the user is regenerated once', async () => {
    const { agent } = setup();
    const inputs = [];
    agent._run = async (input) => {
        inputs.push(JSON.parse(input));
        return inputs.length === 1 ? 'What if I told you I was a scientist?' : 'Then I would ask what you build.';
    };
    assert.equal(await agent.speakTo('What if I told you I was a scientist'), 'Then I would ask what you build.');
    await agent.waitForReflection();
    assert.equal(inputs.length, 2);
    assert.match(inputs[1].conversation.correction, /only repeated the user/);
});
