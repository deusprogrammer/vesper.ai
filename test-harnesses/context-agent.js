import fs from 'node:fs';
import ContextAgent from '../src/agents/context-agent.js';
import { characterSchema } from '../src/agents/character-schema.js';
import { printSplashScreen } from '../src/ascii-art/print-ascii.js';

printSplashScreen();

const fixture = new URL('./fixtures/vesper.json', import.meta.url);
const character = characterSchema.parse(JSON.parse(fs.readFileSync(fixture, 'utf8')));

const defaultInputs = [
    'hey there!',
    'Do you ever talk to Ingrid anymore?',
    'What do you do when nobody is talking to you?',
    'How did you end up everywhere?',
    'What is Warden and why is it after you?',
];

const inputs = process.argv[2] ? [process.argv[2]] : defaultInputs;
const reasoning = process.env.REASONING || undefined;
const agent = new ContextAgent({ agentModel: process.env.CONTEXT_MODEL, reasoning });

for (const input of inputs) {
    const started = Date.now();
    const context = await agent.gatherContext(input, character);
    console.log(`\n> ${input}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    console.log(JSON.stringify(context, null, 2));
}
