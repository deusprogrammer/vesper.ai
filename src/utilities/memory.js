export function decayMemories(character) {
    for (const entry of [...character.memories, ...character.events]) {
        entry.strength *= 1 - entry.decayRate;
    }
}

export function reinforceMemories(entries) {
    for (const entry of new Set(entries)) {
        entry.strength = Math.min(1, entry.strength + entry.importance * entry.decayRate);
    }
}
