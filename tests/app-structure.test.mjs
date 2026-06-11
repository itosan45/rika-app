import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
const dataSource = appScript.slice(appScript.indexOf("const SUBJECTS="), appScript.indexOf("const STORE="));
const context = {};
vm.createContext(context);
vm.runInContext(`${dataSource};globalThis.app={subjects:SUBJECTS,units:UNITS,questions:QUESTIONS}`, context);
const app = JSON.parse(JSON.stringify(context.app));

test("required screens and controls exist", () => {
  for (const id of ["screen-home", "screen-units", "screen-question", "screen-result", "screen-stats", "screen-shizuoka", "hint-countdown", "hint-box", "feedback", "next-btn"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("session shows the screen before starting the question timer", () => {
  assert.match(html, /function beginSession\(type\)\{[^}]*show\("question"\);loadQuestion\(\)/);
  assert.doesNotMatch(html, /loadQuestion\(\);show\("question"\)/);
});

test("science curriculum has four fields and enough practice", () => {
  assert.deepEqual(app.subjects.map(s => s.id), ["biology", "chemistry", "earth", "physics"]);
  assert.equal(app.units.length, 24);
  assert.ok(app.questions.length >= 120, `expected at least 120 questions, got ${app.questions.length}`);
  assert.equal(new Set(app.questions.map(q => q.id)).size, app.questions.length);
});

test("every authored question includes hint and explanation", () => {
  assert.ok(app.questions.length >= 120);
  assert.ok(app.questions.every(q => q.hint1 && q.hint2 && q.explanation && q.misconception));
  assert.ok(app.questions.every(q => ["choice", "number", "order", "text"].includes(q.type)));
});
