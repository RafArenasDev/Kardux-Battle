#!/usr/bin/env node
// Fails when the Spanish and English catalogs drift apart: every key must exist in both, and
// no value may be empty. Plural forms (`_one`/`_other`) are compared like any other key.
import { readFileSync } from 'node:fs';

const load = (lang) =>
    JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));

function flatten(tree, prefix = '', out = new Map()) {
    for (const [key, value] of Object.entries(tree)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') flatten(value, path, out);
        else out.set(path, value);
    }
    return out;
}

const es = flatten(load('es'));
const en = flatten(load('en'));
const problems = [];
for (const key of es.keys()) if (!en.has(key)) problems.push(`missing in en: ${key}`);
for (const key of en.keys()) if (!es.has(key)) problems.push(`missing in es: ${key}`);
for (const [lang, map] of [
    ['es', es],
    ['en', en],
]) {
    for (const [key, value] of map) {
        if (typeof value !== 'string' || value.trim() === '')
            problems.push(`empty in ${lang}: ${key}`);
    }
}

if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
}
console.warn(`i18n OK - ${es.size} keys in es and en.`);
