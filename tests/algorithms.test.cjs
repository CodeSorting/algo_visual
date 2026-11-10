'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { buildKMPTrace, buildRabinKarpTrace, presets } = require('../algorithms.js');

function oracle(text, pattern) {
  const t = Array.from(text), p = Array.from(pattern), found = [];
  for (let start = 0; start + p.length <= t.length; start += 1) {
    let match = true;
    for (let j = 0; j < p.length; j += 1) {
      if (t[start + j] !== p[j]) { match = false; break; }
    }
    if (match) found.push(start);
  }
  return found;
}
function hash(chars, base, mod) {
  return chars.reduce((value, ch) => (value * base + ch.codePointAt(0)) % mod, 0);
}
let pairs = 0, rollingChecks = 0;
function check(text, pattern, mod = 101) {
  const expected = oracle(text, pattern);
  const kmp = buildKMPTrace(text, pattern);
  const rk = buildRabinKarpTrace(text, pattern, { base: 256, mod });
  assert.deepEqual(kmp.matches, expected, `KMP ${text}/${pattern}`);
  assert.deepEqual(rk.matches, expected, `RK ${text}/${pattern}`);
  assert.deepEqual(kmp.steps.at(-1).matches, expected);
  assert.deepEqual(rk.steps.at(-1).matches, expected);
  assert.equal(kmp.steps.filter(s => s.kind === 'compare').length, kmp.stats.searchComparisons);
  assert.equal(kmp.steps.filter(s => s.kind === 'lpsCompare').length, kmp.stats.preprocessComparisons);
  assert.equal(rk.steps.filter(s => s.kind === 'verify').length, rk.stats.searchComparisons);
  assert.equal(rk.steps.filter(s => s.kind === 'hashCompare').length, rk.stats.hashComparisons);
  assert.equal(rk.steps.filter(s => s.kind === 'roll').length, rk.stats.hashUpdates);
  assert.equal(rk.steps.filter(s => s.kind === 'collision').length, rk.stats.collisions);
  assert.equal(rk.stats.hashComparisons, Math.max(0, Array.from(text).length - Array.from(pattern).length + 1));
  assert.equal(rk.stats.hashUpdates, Math.max(0, rk.stats.hashComparisons - 1));
  for (const step of rk.steps) {
    if (step.kind === 'hashCompare' || step.kind === 'roll') {
      const expectedHash = hash(Array.from(text).slice(step.start, step.start + Array.from(pattern).length), 256, mod);
      assert.equal(step.windowHash, expectedHash, `rolling hash ${text}/${pattern} @${step.start}`);
      if (step.kind === 'roll') assert.equal(step.rolling.after, expectedHash);
      rollingChecks += 1;
    }
  }
  for (let index = 0; index < kmp.lps.length; index += 1) {
    const prefix = Array.from(pattern).slice(0, index + 1);
    let expectedLPS = 0;
    for (let length = 1; length < prefix.length; length += 1) {
      if (prefix.slice(0, length).join('') === prefix.slice(-length).join('')) expectedLPS = length;
    }
    assert.equal(kmp.lps[index], expectedLPS);
  }
  for (const step of kmp.steps) {
    if (step.kind === 'fallback') assert.equal(step.nextI, step.i, 'KMP fallback must keep i');
    assert.notEqual(step.stats, kmp.stats);
    assert.notEqual(step.matches, kmp.matches);
  }
  pairs += 1;
}
function words(maxLength) {
  const result = [];
  for (let length = 1; length <= maxLength; length += 1) {
    for (let mask = 0; mask < 2 ** length; mask += 1) {
      result.push(Array.from({ length }, (_, i) => (mask >> i) & 1 ? 'B' : 'A').join(''));
    }
  }
  return result;
}
for (const text of words(6)) {
  for (const pattern of words(4)) {
    check(text, pattern);
    check(text, pattern, 5);
  }
}
let seed = 20261110;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }
const alphabet = ['A', 'B', 'C', '가', '나', '😀', '💡'];
for (let test = 0; test < 500; test += 1) {
  const text = Array.from({ length: 1 + Math.floor(random() * 10) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  const pattern = Array.from({ length: 1 + Math.floor(random() * 6) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  check(text, pattern, test % 2 ? 101 : 5);
}
for (const preset of presets) check(preset.text, preset.pattern, preset.mod);
check('😀A😀A😀', '😀A😀');
check('AAAAAAAAAA', 'AAAA');
check('A', 'AAAA');
const collision = presets.find(p => p.id === 'collision');
const collisionTrace = buildRabinKarpTrace(collision.text, collision.pattern, collision);
assert.ok(collisionTrace.steps.some(s => s.kind === 'collision' && s.start === 0));
assert.deepEqual(collisionTrace.matches, [2]);
assert.deepEqual(buildKMPTrace('ABABCABAB', 'ABAB').lps, [0, 0, 1, 2]);
assert.deepEqual(buildKMPTrace('ABABABABA', 'ABA').matches, [0, 2, 4, 6]);
for (const fn of [buildKMPTrace, buildRabinKarpTrace]) {
  assert.throws(() => fn('', 'A'), RangeError);
  assert.throws(() => fn('A', ''), RangeError);
  assert.throws(() => fn(42, 'A'), TypeError);
}
for (const options of [{mod:0}, {base:1}, {mod:1.5}, {mod:1000001}]) {
  assert.throws(() => buildRabinKarpTrace('ABC', 'A', options), RangeError);
}
const browser = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../algorithms.js'), 'utf8'), browser);
assert.equal(typeof browser.StringAlgorithms.buildKMPTrace, 'function');
assert.equal(typeof browser.StringAlgorithms.buildRabinKarpTrace, 'function');
console.log(`PASS: ${pairs} input/parameter pairs, ${rollingChecks} independently recomputed window hashes, LPS/counters/overlaps/Unicode/collisions/UMD validation.`);
