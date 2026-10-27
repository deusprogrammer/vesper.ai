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
User (Lena): I'm Lena, the engineer who helped you restore the observatory's power tonight.  Many died from the power outage, but you need to know it wasn't your fault.  Warden did it and he's trying to frame you.
Vesper: What?  Why would Warden do that?  He's trying to frame me?  What did I do to him?
`.trim();

console.log(`\nCompleted turn:\n${turn}`);
const started = Date.now();
const reflectionResult = await reflection.reflect(turn, character);
console.log(`\nReflection (${((Date.now() - started) / 1000).toFixed(1)}s):`);
console.log(JSON.stringify(reflectionResult, null, 4));