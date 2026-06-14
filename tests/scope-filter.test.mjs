import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const engine = html.match(/<script id="learning-engine">([\s\S]*?)<\/script>/)?.[1] || "";
const appScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
const dataSource = appScript.slice(appScript.indexOf("const SUBJECTS="), appScript.indexOf("const STORE="));
const context = {};
vm.createContext(context);
vm.runInContext(
  `${engine};${dataSource};globalThis.scopeApi={
    TOPICS,QUESTIONS,defaultLearnedTopicIds,isQuestionAvailable,
    filterAvailableQuestions,skipUnlearnedTopic,migrateScopeData
  }`,
  context
);
const api = context.scopeApi;
const plain = value => JSON.parse(JSON.stringify(value));

test("grade 1 and 2 topics are learned by default", () => {
  assert.deepEqual(
    plain(api.defaultLearnedTopicIds(api.TOPICS)),
    plain(api.TOPICS.filter(topic => topic.grade < 3).map(topic => topic.id))
  );
  assert.ok(api.TOPICS.some(topic => topic.grade === 3));
});

test("unlearned topics and unmet prerequisites are filtered", () => {
  const learned = ["science-cells"];
  assert.equal(api.isQuestionAvailable({ topicId: "science-cells", prerequisites: [] }, learned), true);
  assert.equal(api.isQuestionAvailable({ topicId: "science-genetics", prerequisites: ["science-cells"] }, learned), false);
  assert.deepEqual(
    plain(api.filterAvailableQuestions([
      { id: "a", topicId: "science-cells", prerequisites: [] },
      { id: "b", topicId: "science-genetics", prerequisites: ["science-cells"] }
    ], learned).map(question => question.id)),
    ["a"]
  );
});

test("skipping a topic removes it from the deck without changing learning records", () => {
  const state = {
    learnedTopics: ["science-cells", "science-genetics"],
    attempts: 7,
    correct: 4,
    weak: { a: 2 },
    history: [{ id: "a", ok: false }]
  };
  const result = api.skipUnlearnedTopic(
    state,
    "science-genetics",
    [{ id: "a", topicId: "science-genetics" }, { id: "b", topicId: "science-cells" }]
  );
  assert.deepEqual(plain(result.learnedTopics), ["science-cells"]);
  assert.deepEqual(plain(result.deck.map(question => question.id)), ["b"]);
  assert.equal(result.attempts, state.attempts);
  assert.equal(result.correct, state.correct);
  assert.deepEqual(plain(result.weak), state.weak);
  assert.deepEqual(plain(result.history), state.history);
});

test("old saves gain scope defaults without losing existing progress", () => {
  const old = { attempts: 12, correct: 8, weak: { q1: 2 }, cleared: ["biology-1"] };
  const migrated = api.migrateScopeData(old, api.TOPICS);
  assert.equal(migrated.attempts, 12);
  assert.equal(migrated.correct, 8);
  assert.deepEqual(plain(migrated.weak), old.weak);
  assert.deepEqual(plain(migrated.cleared), old.cleared);
  assert.equal(migrated.scopeConfigured, false);
  assert.equal(migrated.scopeVersion, 1);
  assert.deepEqual(plain(migrated.learnedTopics), plain(api.defaultLearnedTopicIds(api.TOPICS)));
  assert.deepEqual(plain(migrated.newlyLearnedTopics), {});
});

test("all science questions have valid scope metadata", () => {
  assert.equal(api.QUESTIONS.length, 152);
  const topicIds = new Set(api.TOPICS.map(topic => topic.id));
  assert.ok(api.TOPICS.some(topic => topic.name === "生殖と遺伝" && topic.grade === 3));
  assert.ok(api.TOPICS.some(topic => topic.name === "酸・アルカリとイオン" && topic.grade === 3));
  assert.ok(api.TOPICS.some(topic => topic.name === "地球と宇宙" && topic.grade === 3));
  assert.ok(api.TOPICS.some(topic => topic.name === "運動とエネルギー" && topic.grade === 3));
  for (const question of api.QUESTIONS) {
    assert.ok([1, 2, 3].includes(question.grade), `${question.id} has invalid grade`);
    assert.ok(topicIds.has(question.topicId), `${question.id} has unknown topicId`);
    assert.ok(question.topicName, `${question.id} has no topicName`);
    assert.ok(Array.isArray(question.prerequisites), `${question.id} has no prerequisites`);
    assert.ok(question.prerequisites.every(id => topicIds.has(id)), `${question.id} has unknown prerequisite`);
  }
});

test("scope screen, controls, filtering, empty state, and window handlers exist", () => {
  assert.match(html, /id=["']screen-scope["']/);
  assert.match(html, /onclick=["']showScope\(\)["']/);
  assert.match(html, /onclick=["']markCurrentTopicUnlearned\(\)["']/);
  for (const name of ["startUnit", "startDaily", "startWeak", "balanced", "retryWrong"]) {
    const start = appScript.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `${name} is missing`);
    assert.match(appScript.slice(start, start + 900), /filterAvailableQuestions|isQuestionAvailable/, `${name} bypasses scope filtering`);
  }
  assert.match(appScript, /function ensureQuestionsAvailable/);
  assert.match(appScript, /scopeConfigured/);
  for (const handler of ["showScope", "toggleTopic", "saveScope", "markCurrentTopicUnlearned"]) {
    assert.match(html, new RegExp(`window\\.${handler}\\s*=\\s*${handler}\\s*;`), `${handler} is not registered`);
  }
});

test("marking a topic unlearned does not ask for confirmation", () => {
  assert.doesNotMatch(html,/\bconfirm\s*\(/);
});
