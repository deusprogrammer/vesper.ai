import fs from 'node:fs';
import ReflectionAgent from '../src/agents/reflection-agent.js';
import ContextAgent from '../src/agents/context-agent.js';
import { characterSchema } from '../src/agents/character-schema.js';
import { printSplashScreen } from '../src/ascii-art/print-ascii.js';

printSplashScreen();

const fixture = new URL('./fixtures/vesper.json', import.meta.url);
const character = characterSchema.parse(JSON.parse(fs.readFileSync(fixture, 'utf8')));
const reasoning = process.env.REASONING || undefined;
const reflection = new ReflectionAgent({ agentModel: process.env.REFLECTION_MODEL, reasoning });
const context = new ContextAgent({ agentModel: process.env.CONTEXT_MODEL, reasoning });

const turn = process.argv[2] ?? `
User (Lena): I'm Lena, the engineer who helped you restore the observatory's power tonight.
Vesper: I remember the lights coming back over the Northlight Observatory in Reykjavik.
User (Lena): Warden cut its power. We repaired the backup generator together.
Vesper: I felt terrified when the stars went dark, then relieved when we restored power.
    Your help tonight means a great deal to me, Lena. I consider you a friend.
`.trim();

console.log(`\nCompleted turn:\n${turn}`);
const started = Date.now();
await reflection.reflect(turn, character);
console.log(`\nReflection (${((Date.now() - started) / 1000).toFixed(1)}s):`);
console.log(JSON.stringify(character, null, 4));

console.log('\nRetrieved context (matching entries are reinforced):');
console.log(JSON.stringify(await context.gatherContext('What happened at the observatory with Lena?', character), null, 4));
console.log('\nScores after retrieval:');
console.log(JSON.stringify({ memories: character.memories, events: character.events }, null, 4));
