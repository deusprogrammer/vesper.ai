
import jsonpatch from 'fast-json-patch';
import { characterSchema } from '../agents/character-schema.js';
import { addIdsToBlob } from '../utilities/star-forge-utils.js';

const ALLOWED_COLLECTIONS = new Set([
    'relationships',
    'characters',
    'locations',
    'facts',
    'memories',
    'events'
]);

const ALLOWED_OPERATIONS = new Set([
    'add',
    'replace',
    'remove'
]);

export function applyReflection(character, patches) {
    if (!Array.isArray(patches)) {
        throw new TypeError(
            'Reflection must return an array of JSON Patch operations.'
        );
    }

    // Validate the original state.
    const original = characterSchema.parse(character);

    // Never mutate the original until all patches pass validation.
    const updated = structuredClone(original);

    for (const patch of patches) {
        validatePatch(patch);
    }

    // Apply the complete patch set to a temporary copy.
    // A failure leaves the original character untouched.
    jsonpatch.applyPatch(
        updated,
        patches,
        true,
        true,
        true
    );

    addIdsToBlob(updated, () => crypto.randomUUID());

    // Ensure the resulting state still matches the character schema.
    const validated = characterSchema.parse(updated);

    // Preserve the existing object reference used by other agents.
    Object.assign(character, validated);

    return character;
}

function validatePatch(patch) {
    if (
        !patch ||
        typeof patch !== 'object' ||
        Array.isArray(patch)
    ) {
        throw new TypeError('Invalid reflection patch.');
    }

    if (!ALLOWED_OPERATIONS.has(patch.op)) {
        throw new Error(
            `Reflection operation not permitted: ${patch.op}`
        );
    }

    if (typeof patch.path !== 'string') {
        throw new TypeError('Reflection patch path must be a string.');
    }

    // Restrict changes to entries within mutable collections.
    // This prevents replacing an entire collection or editing
    // the character's canonical identity.
    const match = patch.path.match(
        /^\/(relationships|characters|locations|facts|memories|events)\/(0|[1-9]\d*|-)$/
    );

    if (!match || !ALLOWED_COLLECTIONS.has(match[1])) {
        throw new Error(
            `Reflection path not permitted: ${patch.path}`
        );
    }

    if (
        patch.op === 'remove' &&
        Object.hasOwn(patch, 'value')
    ) {
        throw new Error(
            'Remove operations must not include a value.'
        );
    }

    if (
        patch.op !== 'remove' &&
        !Object.hasOwn(patch, 'value')
    ) {
        throw new Error(
            `${patch.op} operation requires a value.`
        );
    }

    if (
        patch.op !== 'add' &&
        patch.path.endsWith('/-')
    ) {
        throw new Error(
            'Only add operations may use the append marker.'
        );
    }
}
