import { z } from 'zod';

export const characterSchema = z.strictObject({
    id: z
        .string()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        .describe('Lowercase kebab-case slug of the name; used as the map key.'),
    name: z.string().min(1),
    age: z
        .number()
        .int()
        .min(0)
        .nullable()
        .describe('Age in years, or null if not stated or implied.'),
    relationships: z.array(
        z.strictObject({
            name: z.string().min(1),
            relation: z.string().describe('Short label, e.g. "sister", "rival".'),
            details: z.string().describe('One sentence on the dynamic; empty if unknown.'),
        }),
    ),
    locations: z.array(
        z.strictObject({
            name: z.string().min(1),
            relevance: z.string().describe('Why the place matters to the character, e.g. "where she was created".'),
        }),
    ),
    hobbies: z.array(z.string()),
    likes: z.array(z.string()),
    dislikes: z.array(z.string()),
    facts: z
        .array(
            z.strictObject({
                subject: z.string().min(1).describe('Usually the character id, or another entity name.'),
                predicate: z.string().regex(/^[a-z0-9]+(_[a-z0-9]+)*$/).describe('snake_case relation, e.g. "spread_via".'),
                object: z.string().min(1),
            }),
        )
        .describe('Important details that fit no other field, as subject-predicate-object triples.'),
    description: z.string().describe('Physical appearance and back story.'),
    systemPrompt: z
        .string()
        .describe('Second-person system prompt that makes an LLM role-play this character.'),
});

export const characterJsonSchema = z.toJSONSchema(characterSchema);
