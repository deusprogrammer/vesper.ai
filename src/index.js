import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { printSplashScreen } from './ascii-art/print-ascii.js';
import CharacterAgent from './agents/character-agent.js';
import ContextAgent from './agents/context-agent.js';
import ReflectionAgent from './agents/reflection-agent.js';
import { characterSchema } from './agents/character-schema.js';
import { getAgentLogPath, getReadableAgentLogPath } from './utilities/agent-trace.js';

export async function runChat(agent, input = stdin, output = stdout) {
    const terminal = Boolean(input.isTTY && output.isTTY);
    const lines = createInterface({ input, output, terminal, prompt: 'You: ' });
    lines.on('SIGINT', () => lines.close());

    output.write(`Chatting with ${agent.character.name}. Type /exit to quit.\n`);
    if (terminal) lines.prompt();
    try {
        for await (const line of lines) {
            const message = line.trim();
            if (message === '/exit') break;
            if (message) {
                const reply = await agent.speakTo(message);
                output.write(`\n${agent.character.name}: ${reply}\n\n`);
            }
            if (terminal) lines.prompt();
        }
    } finally {
        lines.close();
        await agent.waitForReflection();
    }
}

async function main() {
    printSplashScreen();
    console.log(`Readable agent log: ${getReadableAgentLogPath()}`);
    console.log(`Raw agent trace: ${getAgentLogPath()}`);
    const fixture = new URL('../test-harnesses/fixtures/vesper.json', import.meta.url);
    const character = characterSchema.parse(JSON.parse(await readFile(fixture, 'utf8')));
    const reasoning = process.env.REASONING || undefined;
    const agent = new CharacterAgent({
        character,
        agentModel: process.env.CHARACTER_MODEL || undefined,
        historyTurns: process.env.HISTORY_TURNS === undefined ? 2 : Number(process.env.HISTORY_TURNS),
        reasoning,
        contextAgent: new ContextAgent({ agentModel: process.env.CONTEXT_MODEL || undefined, reasoning }),
        reflectionAgent: new ReflectionAgent({ agentModel: process.env.REFLECTION_MODEL || undefined, reasoning }),
    });
    await runChat(agent);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error('Chat failed:', error);
        process.exitCode = 1;
    });
}