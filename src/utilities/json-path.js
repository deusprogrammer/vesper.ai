// A deliberately tiny JSONPath subset. Paths come from a model that reads user input,
// so nothing here is ever evaluated as code.
//
// Supported forms:
//   $.field
//   $.field[*]
//   $.field[0]
//   $.field[?(@.key=='value')]   (equality only, case-insensitive)
// Any of the array forms may end with one more property, e.g. $.relationships[*].name
const PATH_PATTERN = new RegExp(
    String.raw`^\$\.(\w+)` +
    String.raw`(?:\[(?:(\*)|(\d+)|\?\(\s*@\.(\w+)\s*==\s*(['"])(.*?)\5\s*\))\])?` +
    String.raw`(?:\.(\w+))?$`,
);

export function parsePath(path) {
    const match = PATH_PATTERN.exec(path.trim());
    if (!match) {
        return null;
    }
    const [, field, wildcard, index, filterKey, , filterValue, subField] = match;
    let selector = null;
    if (wildcard) {
        selector = { type: 'all' };
    } else if (index !== undefined) {
        selector = { type: 'index', index: Number(index) };
    } else if (filterKey) {
        selector = { type: 'filter', key: filterKey, value: filterValue };
    }
    if (subField && !selector) {
        return null;
    }
    return { field, selector, subField };
}

const own = (object, key) =>
    object !== null && typeof object === 'object' && Object.hasOwn(object, key);

// Returns undefined when the path matches nothing.
export function queryPath(data, parsed) {
    if (!own(data, parsed.field)) {
        return undefined;
    }
    const value = data[parsed.field];
    const { selector, subField } = parsed;
    if (!selector) {
        return value;
    }
    if (!Array.isArray(value)) {
        return undefined;
    }

    let items;
    if (selector.type === 'all') {
        items = value;
    } else if (selector.type === 'index') {
        items = selector.index < value.length ? [value[selector.index]] : [];
    } else {
        const wanted = selector.value.toLowerCase();
        items = value.filter((item) =>
            own(item, selector.key) && String(item[selector.key]).toLowerCase() === wanted);
    }

    if (subField) {
        items = items.filter((item) => own(item, subField)).map((item) => item[subField]);
    }
    return items.length ? items : undefined;
}
