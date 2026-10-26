import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import test from 'node:test';
import { runChat } from '../src/index.js';

function setup(text) {
    const messages = [];
    let output = '';
    let waited = false;
    const agent = {
        character: { name: 'Vesper' },
        async speakTo(message) {
            messages.push(message);
            return `Heard: ${message}`;
        },
        async waitForReflection() {
            waited = true;
        },
    };
    const input = Readable.from([text]);
    const sink = new Writable({
        write(chunk, encoding, callback) {
            output += chunk.toString();
            callback();
        },
    });
    return { agent, input, sink, messages, output: () => output, waited: () => waited };
}

test('stdin chat handles buffered lines, ignores blank input, and drains on EOF', async () => {
    const chat = setup('Hello\n\n  How are you?  \n');
    await runChat(chat.agent, chat.input, chat.sink);
    assert.deepEqual(chat.messages, ['Hello', 'How are you?']);
    assert.ok(chat.output().includes('Vesper: Heard: Hello'));
    assert.ok(chat.output().includes('Vesper: Heard: How are you?'));
    assert.equal(chat.waited(), true);
});

test('/exit stops consuming messages and awaits reflection', async () => {
    const chat = setup('Hello\n/exit\nDo not send\n');
    const gate = Promise.withResolvers();
    chat.agent.waitForReflection = () => gate.promise;
    let done = false;
    const running = runChat(chat.agent, chat.input, chat.sink).then(() => { done = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(chat.messages, ['Hello']);
    assert.equal(done, false);
    gate.resolve();
    await running;
    assert.equal(done, true);
});

test('chat propagates speech and background reflection failures', async () => {
    const chat = setup('Hello\n');
    chat.agent.speakTo = async () => { throw new Error('Speech failed'); };
    await assert.rejects(runChat(chat.agent, chat.input, chat.sink), /Speech failed/);
    assert.equal(chat.waited(), true);

    const reflection = setup('Hello\n');
    reflection.agent.waitForReflection = async () => { throw new Error('Reflection failed'); };
    await assert.rejects(runChat(reflection.agent, reflection.input, reflection.sink), /Reflection failed/);
});
