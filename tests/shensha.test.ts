import test from "node:test";
import assert from "node:assert/strict";
import { calculate, type SajuInput } from "../lib/saju/chart";
import {
  SHENSHA_CATALOG_VERSION,
  SHENSHA_RULES,
} from "../lib/saju/shensha";

const base: SajuInput = {
  date: "2005-12-23",
  time: "08:37",
  gender: "male",
  calendar: "solar",
  topic: "general",
};

test("서비스 규칙집의 43개 ID가 모두 고유하고 계산 대상에 포함된다", () => {
  const ids = SHENSHA_RULES.map((rule) => rule.id);
  assert.equal(SHENSHA_RULES.length, 43);
  assert.equal(new Set(ids).size, 43);
  assert.ok(SHENSHA_RULES.every((rule) => rule.name && rule.method));
  const result = calculate(base, 2026).shensha;
  assert.ok(result);
  assert.equal(result.catalogVersion, SHENSHA_CATALOG_VERSION);
  assert.equal(result.checkedCount, 43);
  assert.ok(result.matched.every((item) => ids.includes(item.ruleId)));
  assert.equal(new Set(result.matched.map((item) => item.ruleId)).size, result.matched.length);
});

test("고정된 사주에서 천을귀인의 적중 위치와 기준 글자를 보존한다", () => {
  const result = calculate(base, 2026).shensha;
  assert.ok(result);
  const noble = result.matched.find((item) => item.ruleId === "tianyi_guiren");
  assert.ok(noble);
  assert.equal(noble.name, "천을귀인");
  assert.deepEqual(noble.hits[0].pillars, ["월"]);
  assert.match(noble.hits[0].via, /년간 乙/);
  assert.equal(noble.sourceStatus, "method_difference");
  assert.ok(noble.sourceNote.length > 0);
  assert.ok(noble.timing.currentYear.every((hit) => hit.pillars.includes("시기")));
});

test("한 규칙의 여러 기둥 적중을 중복 카드 없이 모두 남긴다", () => {
  const result = calculate({ ...base, date: "2000-02-29", time: "10:00" }, 2026).shensha;
  assert.ok(result);
  const matched = result.matched.filter((item) => item.ruleId === "guoyin_guiren");
  assert.equal(matched.length, 1);
  assert.deepEqual(new Set(matched[0].hits.flatMap((hit) => hit.pillars)), new Set(["월", "년"]));
  assert.match(matched[0].hits.map((hit) => hit.via).join(" "), /일간 丁/);
  assert.match(matched[0].hits.map((hit) => hit.via).join(" "), /년간 庚/);
});

test("계산 결과에는 원본 출생 일시와 성별이 포함되지 않는다", () => {
  const result = calculate(base, 2026).shensha;
  assert.ok(result);
  assert.doesNotMatch(JSON.stringify(result), /2005-12-23|08:37|"gender"|"male"/);
});
