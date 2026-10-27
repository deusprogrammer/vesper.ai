
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

import { printSplashScreen } from './ascii-art/print-ascii.js';

import CharacterAgent from './agents/character-agent.js';
import ContextAgent from './agents/context-agent.js';
import PromptCompilerAgent from './agents/prompt-compiler-agent.js';
import ShortTermMemoryAgent from './agents/short-term-memory-agent.js';
import ReflectionAgent from './agents/reflection-agent.js';

import { characterSchema } from './agents/character-schema.js';
import { applyReflection } from './utilities/apply-reflection.js';

import {
    getAgentLogPath,
    getReadableAgentLogPath
} from './utilities/agent-trace.js';

export async function runChat({
    character,
    characterAgent,
    contextAgent,
    promptCompilerAgent,
    shortTermMemoryAgent,
    reflectionAgent,
    saveCharacter = async () => {}
}, input = stdin, output = stdout) {
    const terminal = Boolean(input.isTTY && output.isTTY);

    const lines = createInterface({
        input,
        output,
        terminal,
        prompt: 'You: '
    });

    lines.on('SIGINT', () => lines.close());

    output.write(
        `Chatting with ${character.name}. Type /exit to quit.\n`
    );

    if (terminal) lines.prompt();

    try {
        for await (const line of lines) {
            const userInput = line.trim();

            if (userInput === '/exit') break;

            if (userInput) {
                // 1. Retrieve relevant character knowledge.
                const context = await contextAgent.gatherContext(
                    userInput,
                    character
                );

                console.log(
                    '\x1b[32m%s\x1b[0m',
                    'Context:',
                    context
                );

                // 2. Compile the current contextual prompt.
                const compiledPrompt =
                    await promptCompilerAgent.compilePrompt({
                        target: 'vox',
                        context,
                        currentSummary: shortTermMemoryAgent.summary,
                        characterDescription: character.description
                    });

                console.log(
                    '\x1b[32m%s\x1b[0m',
                    'Compiled prompt:',
                    compiledPrompt
                );

                // 3. Generate the character's response.
                const reply = await characterAgent.speakTo(
                    userInput,
                    compiledPrompt
                );

                output.write(
                    `\n${character.name}: ${reply}\n\n`
                );

                // 4. Update short-term memory.
                try {
                    await shortTermMemoryAgent.remember(
                        userInput,
                        reply
                    );
                } catch (error) {
                    console.error(
                        'Short-term memory update failed:',
                        error
                    );
                }

                // 5. Reflect on the completed conversation.
                if (reflectionAgent) {
                    try {
                        const transcript = [
                            `User: ${userInput}`,
                            `${character.name}: ${reply}`
                        ].join('\n');

                        // The agent proposes JSON Patch operations.
                        const patches = await reflectionAgent.reflect(
                            transcript,
                            character
                        );

                        console.log(
                            '\x1b[32m%s\x1b[0m',
                            'Reflection patches:',
                            patches
                        );

                        // Validate and apply patches deterministically.
                        applyReflection(character, patches);

                        // Persist the updated character state.
                        await saveCharacter(character);

                        console.log(
                            '\x1b[32m%s\x1b[0m',
                            'Character memory saved.'
                        );

                    } catch (error) {
                        console.error(
                            'Reflection or persistence failed:',
                            error
                        );
                    }
                }
            }

            if (terminal) lines.prompt();
        }
    } finally {
        lines.close();
    }
}

async function main() {
    printSplashScreen();

    console.log(
        `Readable agent log: ${getReadableAgentLogPath()}`
    );

    console.log(
        `Raw agent trace: ${getAgentLogPath()}`
    );

    // Immutable character fixture.
    const fixture = new URL(
        '../test-harnesses/fixtures/vesper.json',
        import.meta.url
    );

    // Mutable persistent character state.
    const characterFile = new URL(
        '../tabula-rasa.json',
        import.meta.url
    );

    let character;

    try {
        // Load previously saved character state.
        character = characterSchema.parse(
            JSON.parse(await readFile(characterFile, 'utf8'))
        );

        console.log('Loaded persistent character memory.');

    } catch (error) {
        if (error.code !== 'ENOENT') throw error;

        // First launch: initialize from the original fixture.
        character = characterSchema.parse(
            JSON.parse(await readFile(fixture, 'utf8'))
        );

        await writeFile(
            characterFile,
            JSON.stringify(character, null, 2) + '\n',
            'utf8'
        );

        console.log('Initialized persistent character memory.');
    }

    const reasoning = process.env.REASONING || 'none';

    const characterAgent = new CharacterAgent({
        agentModel: process.env.CHARACTER_MODEL || undefined,
        reasoning,
        systemPrompt: character.systemPrompt
    });

    const contextAgent = new ContextAgent({
        agentModel: process.env.CONTEXT_MODEL || undefined,
        reasoning
    });

    const promptCompilerAgent = new PromptCompilerAgent({
        agentModel: process.env.PROMPT_COMPILER_MODEL || undefined,
        reasoning
    });

    const shortTermMemoryAgent = new ShortTermMemoryAgent({
        agentModel: process.env.SHORT_TERM_MEMORY_MODEL || undefined,
        reasoning
    });

    const reflectionAgent = new ReflectionAgent({
        agentModel: process.env.REFLECTION_MODEL || undefined,
        reasoning
    });

    // Save validated state using a temporary file and rename.
    const saveCharacter = async (state) => {
        const validated = characterSchema.parse(state);

        const temporaryFile = new URL(
            '../tabula-rasa.json.tmp',
            import.meta.url
        );

        await writeFile(
            temporaryFile,
            JSON.stringify(validated, null, 2) + '\n',
            'utf8'
        );

        await rename(
            temporaryFile,
            characterFile
        );
    };

    await runChat({
        character,
        characterAgent,
        contextAgent,
        promptCompilerAgent,
        shortTermMemoryAgent,
        reflectionAgent,
        saveCharacter
    });
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main().catch((error) => {
        console.error('Chat failed:', error);
        process.exitCode = 1;
    });
}
