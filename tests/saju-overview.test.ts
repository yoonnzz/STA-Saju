import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SajuOverview from "../app/saju-overview";
import { calculate, type SajuChart } from "../lib/saju/chart";

const chart = calculate({
  date: "2005-12-23",
  time: "08:37",
  gender: "male",
  calendar: "solar",
  topic: "general",
}, 2026);

function render(override: SajuChart = chart) {
  return renderToStaticMarkup(createElement(SajuOverview, { chart: override }));
}

test("계산된 네 기둥의 한자 8글자, 한글 읽기와 대표 오행을 순서대로 보여준다", () => {
  const html = render();
  assert.match(html, /aria-label="사주 8글자와 오행 분포"/);
  for (const [label, stem, stemReading, stemElement, branch, branchReading, branchElement] of [
    ["년주", "乙", "을", "목", "酉", "유", "금"],
    ["월주", "戊", "무", "토", "子", "자", "수"],
    ["일주", "辛", "신", "금", "巳", "사", "화"],
    ["시주", "壬", "임", "수", "辰", "진", "토"],
  ]) {
    const pillar = `<h4>${label}</h4>`;
    const start = html.indexOf(pillar);
    assert.ok(start >= 0, `${label} 제목이 있어야 함`);
    const next = html.indexOf("<h4>", start + pillar.length);
    const section = html.slice(start, next < 0 ? undefined : next);
    assert.match(section, new RegExp(`data-element="${stemElement}"[^>]*>.*?<span class="character-kind">천간</span><strong>${stem}</strong><span>${stemReading} · ${stemElement}</span>`));
    assert.match(section, new RegExp(`data-element="${branchElement}"[^>]*>.*?<span class="character-kind">지지</span><strong>${branch}</strong><span>${branchReading} · ${branchElement}</span>`));
  }
  assert.equal((html.match(/class="character-tile"/g) ?? []).length, 8);
});

test("오행 다섯 종류의 개수와 막대 길이가 실제 계산 결과와 일치한다", () => {
  const html = render();
  const expected = [["목", 1], ["화", 1], ["토", 2], ["금", 2], ["수", 2]] as const;
  assert.deepEqual(chart.elements, { 목: 1, 화: 1, 토: 2, 금: 2, 수: 2 });
  for (const [element, count] of expected) {
    assert.match(html, new RegExp(`<li data-element="${element}"><span class="overview-element-name">${element}</span><span class="overview-track" aria-hidden="true"><span style="width:${count / 8 * 100}%"></span></span><strong>${count} / 8</strong></li>`));
  }
  assert.match(html, /가장 많음 <strong>토·금·수 \(2개\)<\/strong>/);
  assert.match(html, /가장 적음 <strong>목·화 \(1개\)<\/strong>/);
});

test("0개와 최다·최소 동률을 숫자로 드러내며, 횟수를 전체 부족함으로 단정하지 않는다", () => {
  const html = render({ ...chart, elements: { 목: 4, 화: 0, 토: 4, 금: 0, 수: 0 } });
  assert.match(html, /가장 많음 <strong>목·토 \(4개\)<\/strong>/);
  assert.match(html, /가장 적음 <strong>화·금·수 \(0개\)<\/strong>/);
  for (const element of ["화", "금", "수"]) {
    assert.match(html, new RegExp(`<li data-element="${element}">.*?<span style="width:0%"></span>.*?<strong>0 / 8</strong></li>`));
  }
  assert.match(html, /적거나 0개인 오행을 사주 전체의 부족함으로 단정하지 않습니다/);
});
