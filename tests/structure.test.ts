import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import { calculateStructure, TEN_GOD_NAMES } from "../lib/saju/structure";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  gender: "male",
  calendar: "solar",
  topic: "general",
}, 2026);

test("십성 열 가지를 지원하고 고정 사주의 천간 십성을 일간 기준으로 계산한다", () => {
  assert.deepEqual(TEN_GOD_NAMES, ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"]);
  assert.deepEqual(chart.structure?.tenGods.map((item) => item.stemTenGod), ["편재", "정인", "일간", "상관"]);
});

test("네 지지의 숨은 천간과 십성을 순서대로 보존한다", () => {
  const hidden = chart.structure?.tenGods.map((item) => item.hidden.map(({ stem, tenGod }) => [stem, tenGod]));
  assert.deepEqual(hidden, [
    [["辛", "비견"]],
    [["癸", "식신"]],
    [["丙", "정관"], ["庚", "겁재"], ["戊", "정인"]],
    [["戊", "정인"], ["乙", "편재"], ["癸", "식신"]],
  ]);
});

test("고정 사주의 천간충·지지합·지지파에 발견 위치와 글자가 붙는다", () => {
  assert.deepEqual(chart.structure?.relations, [
    { kind: "지지파", pillars: ["년주", "월주"], characters: ["酉", "子"] },
    { kind: "천간충", pillars: ["년주", "일주"], characters: ["乙", "辛"] },
    { kind: "지지합", pillars: ["년주", "시주"], characters: ["酉", "辰"] },
  ]);
});

test("합·충·형·해·자형을 네 기둥의 짝에서 계산한다", () => {
  const pillars = chart.pillars.map((item) => ({ ...item }));
  pillars[0].stem = "甲";
  pillars[0].branch = "子";
  pillars[1].stem = "己";
  pillars[1].branch = "午";
  pillars[2].branch = "卯";
  pillars[3].branch = "未";
  const relations = calculateStructure({ ...chart, pillars }).relations;
  for (const [kind, names] of [
    ["천간합", ["년주", "월주"]],
    ["지지충", ["년주", "월주"]],
    ["지지형", ["년주", "일주"]],
    ["지지해", ["년주", "시주"]],
  ] as const) {
    assert.ok(relations.some((item) => item.kind === kind && item.pillars.join() === names.join()));
  }
  pillars[3].branch = "午";
  assert.ok(calculateStructure({ ...chart, pillars }).relations.some((item) =>
    item.kind === "지지자형" && item.pillars.join() === "월주,시주"));
});

test("겨울 월지와 계산 근거가 표시되고 참고 점수의 합이 합리적이다", () => {
  const structure = chart.structure;
  assert.ok(structure);
  assert.deepEqual(structure.season, { name: "겨울", monthBranch: "子", centralElement: "수" });
  assert.deepEqual(structure.elementScores, { 목: 1.3, 화: 1.5, 토: 2.7, 금: 2.8, 수: 4.2 });
  assert.equal(Object.values(structure.elementScores).reduce((sum, value) => sum + value, 0), 12.5);
  assert.match(structure.method, /서비스 참고 점수/);
  assert.match(structure.method, /신강·신약이나 용신 판정은 아닙니다/);
});

test("구조 결과에는 원본 출생 일시와 성별이 포함되지 않는다", () => {
  assert.ok(chart.structure);
  assert.doesNotMatch(JSON.stringify(chart.structure), /2005-12-23|08:37|"gender"|"male"/);
});
