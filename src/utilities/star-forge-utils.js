export function addIdsToBlob(blob, generateId) {
    if (!blob) {
        return;
    }
    
    if (Array.isArray(blob)) {
        for (const item of blob) {
            addIdsToBlob(item, generateId);
        }
    } else if (typeof blob === 'object') {
        if (!blob.id) {
            blob.id = generateId();
        }
        for (const key in blob) {
            addIdsToBlob(blob[key], generateId);
        }
    }
}