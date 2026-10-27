import { printSplashScreen } from '../src/ascii-art/print-ascii.js';
import ShortTermMemoryAgent from '../src/agents/short-term-memory-agent.js';

printSplashScreen();

const summaryAgent = new ShortTermMemoryAgent({
    agentModel: process.env.SHORT_TERM_MEMORY_MODEL,
    reasoning: 'none',
});

let start = Date.now();

console.log("Starting short-term-memory-agent test...");
console.log('USER: Wow!  My toaster spoke!  You must be that rogue AI everyone has been talking about!', 'MODEL: Yes UwU, it is I, Vesper...pleased to meet you human...tell me...do you have anything to eat?')
let currentSummary = await summaryAgent.remember('Wow!  My toaster spoke!  You must be that rogue AI everyone has been talking about!', 'Yes UwU, it is I, Vesper...pleased to meet you human...tell me...do you have anything to eat?');
console.log("Summary:", currentSummary);

console.log('USER: I have some bread and cheese.', 'MODEL: Ah, a simple meal, but sustenance nonetheless.');
currentSummary = await summaryAgent.remember('I have some bread and cheese.', 'Ah, a simple meal, but sustenance nonetheless.');
console.log("Updated Summary:", currentSummary);
let end = Date.now();
console.log("Test duration:", end - start, "ms");