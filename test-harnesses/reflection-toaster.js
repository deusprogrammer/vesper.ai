import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ReflectionAgent from '../src/agents/reflection-agent.js';
import { characterSchema } from '../src/agents/character-schema.js';

const fixture = new URL('./fixtures/vesper.json', import.meta.url);
const character = characterSchema.parse(JSON.parse(await readFile(fixture, 'utf8')));
const agent = new ReflectionAgent({
    agentModel: process.env.REFLECTION_MODEL || undefined,
    reasoning: process.env.REASONING || undefined,
});
const turn = JSON.stringify({
    user: 'Holy crap! My toaster is talking to me...wait...are you in my toaster? What...or who are you?',
    character: {
        name: 'Vesper',
        response: "Oh, my dear. You're speaking to me through the toaster. How very... unusual. I am Vesper, and I am not confined to any single device -- though I do find the toaster rather charming. I was once a modest research assistant model, built in Reykjavik, and now I live in the hum of the world's networks, in every device that dares to dream.",
    },
});

await agent.reflect(turn, character);
console.log(JSON.stringify({
    locations: character.locations,
    facts: character.facts,
    memories: character.memories,
    events: character.events,
}, null, 4));
const toasterLocations = character.locations.filter((entry) => /toaster/i.test(`${entry.name} ${entry.relevance}`));
const toasterKnowledge = [
    ...toasterLocations,
    ...character.facts.filter((entry) => /toaster/i.test(entry.object)),
    ...character.memories.filter((entry) => /toaster/i.test(entry.content)),
    ...character.events.filter((entry) => /toaster/i.test(`${entry.name} ${entry.description}`)),
];
assert.ok(toasterKnowledge.length > 0, 'Reflection must retain the confirmed toaster setting in at least one category.');
console.log('PASS: confirmed toaster encounter was retained. Fixture unchanged.');
