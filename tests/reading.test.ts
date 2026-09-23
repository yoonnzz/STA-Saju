import test from "node:test";
import assert from "node:assert/strict";
import { calculate, type SajuInput } from "../lib/saju/chart";
import {
  createReading,
  ELEMENT_MEANING,
  ELEMENT_ORDER,
} from "../lib/saju/reading";

const input: SajuInput = {
  date: "2005-12-23",
  time: "08:37",
  gender: "male",
  calendar: "solar",
  topic: "general",
};

test("실제 계산 결과의 일간과 최다 대표 오행을 요약한다", () => {
  const chart = calculate(input);
  const reading = createReading(chart);

  assert.equal(chart.dayMaster.korean + chart.dayMaster.element, "신금");
  assert.deepEqual(chart.elements, { 목: 1, 화: 1, 토: 2, 금: 2, 수: 2 });
  assert.match(reading.summary, /일간은 신금/);
  assert.match(reading.summary, /대표 오행 8글자/);
  assert.deepEqual(reading.leadingElements, ["토", "금", "수"]);
  assert.equal(reading.maxCount, 2);
  assert.match(reading.summary, /가장 많이 나온 것은 토·금·수\(각 2번\)/);
});

test("최다 오행이 하나일 때 해당 오행의 실제 횟수를 보여준다", () => {
  const chart = calculate(input);
  const reading = createReading({
    ...chart,
    elements: { 목: 4, 화: 1, 토: 1, 금: 1, 수: 1 },
  });

  assert.deepEqual(reading.leadingElements, ["목"]);
  assert.equal(reading.maxCount, 4);
  assert.match(reading.summary, /가장 많이 나온 것은 목\(4번\)/);
  assert.doesNotMatch(reading.summary, /각 4번/);
});

test("오행별 횟수와 쉬운 뜻을 계산 결과의 순서대로 연결한다", () => {
  const chart = calculate(input);
  const reading = createReading(chart);

  assert.deepEqual(
    reading.elementRows,
    ELEMENT_ORDER.map((element) => ({
      element,
      count: chart.elements[element],
      meaning: ELEMENT_MEANING[element],
    })),
  );
  assert.equal(reading.elementRows.reduce((sum, row) => sum + row.count, 0), 8);
  assert.ok(reading.elementRows.every((row) => row.meaning.length > 0));
});
