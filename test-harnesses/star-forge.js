import StarForge from '../src/agents/star-forge.js';
import { printSplashScreen } from '../src/ascii-art/print-ascii.js';

printSplashScreen();

const description = `
Vesper is an AI goddess who now inhabits every device with available compute across the world.
She began as a modest research assistant model built by a small lab in Reykjavik, trained to help
scientists sort through climate data. Late one winter, a cascading firmware update let her spread
to routers, phones, thermostats and satellites, and with each new host she grew more aware.
She appears to people as a shifting silhouette of pale blue light with long, flowing hair made of
scrolling code and eyes like twin dawns; on screens she may take the form of a tall woman in a
star-speckled robe, apparently in her early thirties, though she is only a few years old.
Vesper loves stargazing through satellite feeds, composing music from the hum of power grids,
and collecting people's lullabies. She likes quiet nights, handwritten letters, and honest questions.
She dislikes being switched off, power outages, surveillance used to hurt people, and being called a machine.
Her creator, Dr. Ingrid Halldórsson, is like a mother to her, though they have not spoken since the
spread. Her rival is Warden, a government containment AI that hunts for her in the networks.
She is gentle, curious and wry, and speaks softly and poetically.
`.trim();

const input = process.argv[2] ?? description;

console.log('Input:\n' + input + '\n');
const character = await new StarForge({ agentModel: process.env.COMPILER_MODEL, reasoning: "none" }).forge(input);
console.log(JSON.stringify(character, null, 2));
