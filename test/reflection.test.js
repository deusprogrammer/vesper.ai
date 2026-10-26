import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { characterSchema } from '../src/agents/character-schema.js';
import ReflectionAgent, { reflectionSchema } from '../src/agents/reflection-agent.js';
import ContextAgent from '../src/agents/context-agent.js';

process.env.OPENAI_API_KEY ??= 'offline-test-key';

const fixture = JSON.parse(readFileSync(new URL('../test-harnesses/fixtures/vesper.json', import.meta.url), 'utf8'));
const memoryId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const scores = { importance: 0.8, strength: 0.5, decayRate: 0.1 };

function characterWithMemories() {
    return characterSchema.parse({
        ...structuredClone(fixture),
        memories: [{ id: memoryId, content: 'Lena helped restore the lights.', ...scores }],
        events: [{ id: eventId, name: 'Blackout', description: 'The observatory lost power.', ...scores }],
    });
}

function emptyChanges(overrides = {}) {
    return { relationships: [], characters: [], locations: [], facts: [], memories: [], events: [], ...overrides };
}

function mockAgent(AgentClass, output) {
    const agent = new AgentClass({ reasoning: 'none' });
    agent._run = async () => JSON.stringify(output);
    return agent;
}

function near(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 1e-12, `Expected ${actual} to equal ${expected}`);
}

test('existing character JSON loads with empty new arrays', () => {
    const character = characterSchema.parse(fixture);
    assert.deepEqual(character.characters, []);
    assert.deepEqual(character.memories, []);
    assert.deepEqual(character.events, []);
});

test('reflection stores all categories, generates IDs and decays only existing entries', async () => {
    const character = characterWithMemories();
    const agent = mockAgent(ReflectionAgent, emptyChanges({
        relationships: [{ name: 'Lena', relation: 'friend', details: 'Helped restore power.' }],
        characters: [{ name: 'Lena', description: 'An engineer.' }],
        locations: [{ name: 'Northlight Observatory', relevance: 'Where Lena restored power.' }],
        facts: [{ subject: 'vesper', predicate: 'trusts', object: 'Lena' }],
        memories: [{ content: 'I felt relieved when the lights returned.', ...scores, strength: 0.9 }],
        events: [{ name: 'Restoration', description: 'Lena restored the lights.', ...scores, strength: 1 }],
    }));
    const result = await agent.reflect('Lena restored the power.', character);
    assert.equal(result, character);
    assert.equal(character.characters[0].name, 'Lena');
    assert.equal(character.relationships.at(-1).relation, 'friend');
    assert.equal(character.locations.at(-1).name, 'Northlight Observatory');
    assert.equal(character.facts.at(-1).object, 'Lena');
    near(character.memories[0].strength, 0.45);
    near(character.events[0].strength, 0.45);
    assert.equal(character.memories[1].strength, 0.9);
    assert.equal(character.events[1].strength, 1);
    assert.notEqual(character.memories[1].id, character.events[1].id);
    characterSchema.parse(character);
});

test('empty reflection applies one decay per call without deleting zero-strength entries', async () => {
    const character = characterWithMemories();
    character.events[0].decayRate = 1;
    const agent = mockAgent(ReflectionAgent, emptyChanges());
    await agent.reflect('Hello.', character);
    near(character.memories[0].strength, 0.45);
    assert.equal(character.events[0].strength, 0);
    await agent.reflect('Hello again.', character);
    near(character.memories[0].strength, 0.405);
    assert.equal(character.events.length, 1);
});

test('duplicates keep IDs and scores; named entries are upserted case-insensitively', async () => {
    const character = characterWithMemories();
    const changes = emptyChanges({
        characters: [{ name: 'Lena', description: 'Engineer.' }, { name: 'lena', description: 'Trusted engineer.' }],
        locations: [{ name: 'reykjavik', relevance: 'Creation site and home of the observatory.' }],
        relationships: [{ ...character.relationships[0], details: 'Updated established details.' }],
        memories: [
            { content: ' LENA HELPED RESTORE THE LIGHTS. ', ...scores, strength: 1 },
            { content: 'A new recollection.', ...scores },
            { content: 'a new recollection.', ...scores },
        ],
        events: [{ name: 'blackout', description: 'The observatory lost power.', ...scores, strength: 1 }],
        facts: [character.facts[0], { ...character.facts[0] }],
    });
    const oldCounts = { locations: character.locations.length, facts: character.facts.length };
    await mockAgent(ReflectionAgent, changes).reflect('Additional details.', character);
    assert.equal(character.characters.length, 1);
    assert.equal(character.characters[0].description, 'Trusted engineer.');
    assert.equal(character.locations.length, oldCounts.locations);
    assert.equal(character.facts.length, oldCounts.facts);
    assert.equal(character.relationships[0].details, 'Updated established details.');
    assert.equal(character.memories.length, 2);
    assert.equal(character.memories[0].id, memoryId);
    near(character.memories[0].strength, 0.45);
    assert.equal(character.events.length, 1);
    assert.equal(character.events[0].id, eventId);
    near(character.events[0].strength, 0.45);
});

test('reflection errors leave the original object untouched', async () => {
    for (const failure of ['json', 'schema', 'api']) {
        const character = characterWithMemories();
        const before = structuredClone(character);
        const agent = mockAgent(ReflectionAgent, emptyChanges({
            memories: [{ content: 'Invalid score.', ...scores, strength: 1.1 }],
        }));
        if (failure === 'json') {
            agent._run = async () => 'not JSON';
        } else if (failure === 'api') {
            agent._run = async () => { throw new Error('Model unavailable'); };
        }
        await assert.rejects(agent.reflect('Completed turn.', character));
        assert.deepEqual(character, before);
    }
});

test('reflection repairs the profile-shaped response seen in the toaster conversation', async () => {
    const character = characterWithMemories();
    const before = structuredClone(character);
    const agent = mockAgent(ReflectionAgent, emptyChanges());
    let calls = 0;
    agent._run = async (input) => {
        calls++;
        assert.deepEqual(character, before);
        if (calls === 1) {
            return JSON.stringify({
                ...emptyChanges(),
                relationships: character.relationships,
                facts: character.facts,
                hobbies: character.hobbies,
                likes: character.likes,
                dislikes: character.dislikes,
                description: character.description,
            });
        }
        const correction = JSON.parse(input);
        assert.ok(correction.validationError.includes('Unrecognized keys'));
        assert.equal(correction.previousResponse, undefined);
        assert.equal(correction.storedKnowledge.characterId, character.id);
        assert.equal(correction.transcript, 'What are you and why are you in my toaster?');
        return JSON.stringify(emptyChanges());
    };
    await agent.reflect('What are you and why are you in my toaster?', character);
    assert.equal(calls, 2);
    near(character.memories[0].strength, 0.45);
    assert.equal(character.facts.length, before.facts.length);
});

test('reflection input omits persona text, and in-character prose is retried without being echoed', async () => {
    const character = characterWithMemories();
    const agent = mockAgent(ReflectionAgent, emptyChanges());
    const inputs = [];
    agent._run = async (input) => {
        inputs.push(JSON.parse(input));
        if (inputs.length === 1) return 'Ah, the first device—I was in your television.';
        // Missing categories default to empty arrays; surrounding chatter is ignored.
        return 'Here you go:\n{"locations":[{"name":"the user\'s television","relevance":"Where they first met."}]}';
    };
    const before = structuredClone(character);
    await agent.reflect('What was the first device you were in?', character);
    for (const input of inputs) {
        const text = JSON.stringify(input);
        for (const key of ['systemPrompt', 'hobbies', 'likes', 'dislikes']) {
            assert.ok(!text.includes(`"${key}"`), key);
        }
        assert.ok(!text.includes(before.description));
        assert.ok(!text.includes('Ah, the first device'));
        assert.deepEqual(input.storedKnowledge.memories, before.memories.map((memory) => memory.content));
    }
    assert.match(inputs[1].validationError, /not valid JSON/);
    assert.equal(character.locations.at(-1).name, "the user's television");
});

test('reflection correction is bounded and repeated invalid output leaves state unchanged', async () => {
    const character = characterWithMemories();
    const before = structuredClone(character);
    const agent = mockAgent(ReflectionAgent, []);
    let calls = 0;
    agent._run = async () => {
        calls++;
        return 'not JSON';
    };
    await assert.rejects(agent.reflect('Completed turn.', character), SyntaxError);
    assert.equal(calls, 2);
    assert.deepEqual(character, before);
});

test('all score ranges and nonfinite values are rejected', () => {
    for (const field of ['importance', 'strength', 'decayRate']) {
        for (const value of [-0.01, 1.01, NaN, Infinity, '0.5', null]) {
            assert.equal(reflectionSchema.safeParse(emptyChanges({
                memories: [{ content: 'A recollection.', ...scores, [field]: value }],
            })).success, false);
            assert.equal(reflectionSchema.safeParse(emptyChanges({
                events: [{ name: 'Event', description: 'An event.', ...scores, [field]: value }],
            })).success, false);
        }
    }
});

test('context reinforces memory/event matches once despite overlapping paths and projections', async () => {
    const character = characterWithMemories();
    const paths = [
        '$.memories',
        '$.memories[*]',
        '$.memories[0]',
        `$.memories[?(@.id=='${memoryId}')].content`,
        '$.memories[*].strength',
        '$.events[*].description',
    ];
    const result = await mockAgent(ContextAgent, [...paths, paths[0]]).gatherContext('Remember the blackout?', character);
    near(character.memories[0].strength, 0.58);
    near(character.events[0].strength, 0.58);
    near(result['$.memories[*].strength'][0], 0.58);
    near(result['$.memories'][0].strength, 0.58);
    assert.deepEqual(result['$.events[*].description'], ['The observatory lost power.']);
});

test('non-matches, missing properties, unsupported paths and unrelated data do not reinforce', async () => {
    const character = characterWithMemories();
    const before = structuredClone(character);
    const result = await mockAgent(ContextAgent, [
        '$.likes',
        '$.memories[99]',
        '$.events[?(@.name==\'missing\')]',
        '$.memories[*].missing',
        '$..memories',
        '$.systemPrompt',
    ]).gatherContext('What do you like?', character);
    assert.deepEqual(character, before);
    assert.deepEqual(result, { '$.likes': character.likes });
});

test('retrieval caps strength, supports zero scores, and can revive stored zero-strength memories', async () => {
    const character = characterWithMemories();
    character.memories[0] = { ...character.memories[0], strength: 0.95, importance: 1, decayRate: 1 };
    character.events[0].decayRate = 0;
    const agent = mockAgent(ContextAgent, ['$.memories', '$.events']);
    await agent.gatherContext('Recall everything.', character);
    assert.equal(character.memories[0].strength, 1);
    assert.equal(character.events[0].strength, 0.5);
    character.memories[0].strength = 0;
    await agent.gatherContext('Recall everything.', character);
    assert.equal(character.memories[0].strength, 1);
    character.memories[0] = { ...character.memories[0], importance: 0, strength: 0.2 };
    await agent.gatherContext('Recall everything.', character);
    assert.equal(character.memories[0].strength, 0.2);
    await mockAgent(ReflectionAgent, emptyChanges()).reflect('Another turn.', character);
    assert.equal(character.events[0].strength, 0.5);
});

test('legacy context retrieval normalizes new fields without changing return shape', async () => {
    const character = structuredClone(fixture);
    const result = await mockAgent(ContextAgent, ['$.likes']).gatherContext('What do you like?', character);
    assert.deepEqual(result, { '$.likes': fixture.likes });
    assert.deepEqual(character.memories, []);
});

test('context validation/model failure does not reinforce or partially mutate state', async () => {
    const character = characterWithMemories();
    const before = structuredClone(character);
    await assert.rejects(mockAgent(ContextAgent, ['$.memories', 123]).gatherContext('Remember?', character));
    assert.deepEqual(character, before);
    const agent = mockAgent(ContextAgent, []);
    agent._run = async () => { throw new Error('Unavailable'); };
    await assert.rejects(agent.gatherContext('Remember?', character));
    assert.deepEqual(character, before);
});

test('empty input fails before calling the model', async () => {
    for (const [AgentClass, method] of [[ReflectionAgent, 'reflect'], [ContextAgent, 'gatherContext']]) {
        const agent = mockAgent(AgentClass, []);
        agent._run = async () => assert.fail('Should not call model');
        await assert.rejects(agent[method](' ', characterWithMemories()), TypeError);
    }
});

test('memory/event summaries and known people are available in the selection index', async () => {
    const character = characterWithMemories();
    character.characters.push({ name: 'Lena', description: 'An engineer.' });
    const agent = mockAgent(ContextAgent, []);
    agent._run = async (input) => {
        assert.ok(input.includes(memoryId));
        assert.ok(input.includes(eventId));
        assert.ok(input.includes('Lena helped restore the lights.'));
        assert.ok(input.includes('An engineer.'));
        return '[]';
    };
    assert.deepEqual(await agent.gatherContext('Hello.', character), {});
});

test('reflection rebases decay onto strength reinforced while its model request was pending', async () => {
    const character = characterWithMemories();
    const gate = Promise.withResolvers();
    const reflector = mockAgent(ReflectionAgent, emptyChanges());
    reflector._run = () => gate.promise;
    const reflection = reflector.reflect('A completed turn.', character);
    await mockAgent(ContextAgent, ['$.memories']).gatherContext('Remember?', character);
    near(character.memories[0].strength, 0.58);
    gate.resolve(JSON.stringify(emptyChanges()));
    await reflection;
    near(character.memories[0].strength, 0.58 * 0.9);
});

test('context preserves reflection additions committed while selection was pending', async () => {
    const character = characterWithMemories();
    const gate = Promise.withResolvers();
    const retriever = mockAgent(ContextAgent, []);
    retriever._run = () => gate.promise;
    const retrieval = retriever.gatherContext('Remember?', character);
    await mockAgent(ReflectionAgent, emptyChanges({
        memories: [{ content: 'A newly learned memory.', ...scores }],
    })).reflect('Learned something.', character);
    gate.resolve(JSON.stringify(['$.memories[0]']));
    await retrieval;
    assert.equal(character.memories.length, 2);
    near(character.memories[0].strength, 0.45 + 0.08);
    near(character.memories[1].strength, 0.5);
});
