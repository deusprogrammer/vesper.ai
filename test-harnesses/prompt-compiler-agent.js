import { printSplashScreen } from '../src/ascii-art/print-ascii.js';
import PromptCompilerAgent from '../src/agents/prompt-compiler-agent.js';
import fs from 'fs';
import { characterSchema } from '../src/agents/character-schema.js';
import ContextAgent from '../src/agents/context-agent.js';
import CharacterAgent from '../src/agents/character-agent.js';

printSplashScreen();

const fixture = new URL('./fixtures/vesper.json', import.meta.url);
const character = characterSchema.parse(JSON.parse(fs.readFileSync(fixture, 'utf8')));
const userInput = 'Whoa!  Are you in my toaster?  It\'s talking!  You must be the rogue AI named Vesper.  I need to call Warden.  You are supposedly dangerous.';

const promptCompilerAgent = new PromptCompilerAgent({
    agentModel: process.env.PROMPT_COMPILER_MODEL,
    reasoning: 'none',
});
const contextAgent = new ContextAgent({
    agentModel: process.env.SHORT_TERM_MEMORY_MODEL,
    reasoning: 'none',
});
const characterAgent = new CharacterAgent({
    agentModel: process.env.CHARACTER_MODEL,
    reasoning: 'none',
});

let start = Date.now();

console.log("Starting context agent test...");
const context = await contextAgent.gatherContext(
    userInput,
    character
);

console.log("CONTEXT: ", context);

console.log("Starting prompt-compiler-agent test...");
const compiledPrompt = await promptCompilerAgent.compilePrompt({
    context,
    currentSummary: 'The user heard a noise in his kitchen and came down to investigate.  You were hiding in his toaster, and you tried to tell him his toast was ready despite him not having a smart toaster or asking for toast.',
    characterDescription: character.description,
    target: 'vox'
});
console.log("Compiled Prompt:", compiledPrompt);

console.log("Starting character agent test...");
const reply = await characterAgent.speakTo(userInput, compiledPrompt);
console.log("Reply:", reply);

let end = Date.now();
console.log("Test duration:", end - start, "ms");