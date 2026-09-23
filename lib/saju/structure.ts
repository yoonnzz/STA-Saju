import type { Pillar, SajuChart } from "./chart";

export const TEN_GOD_NAMES = ["비견", "겁재", "식신", "상관", "편재", "정재", "편관", "정관", "편인", "정인"] as const;
export type TenGodName = (typeof TEN_GOD_NAMES)[number];

type Element = "목" | "화" | "토" | "금" | "수";
type RelationKind = "천간합" | "천간충" | "지지합" | "지지충" | "지지형" | "지지파" | "지지해" | "지지자형";

export type SajuStructure = {
  tenGods: Array<{
    pillar: string;
    stem: string;
    stemTenGod: TenGodName | "일간";
    hidden: Array<{ stem: string; tenGod: TenGodName; role: string }>;
  }>;
  relations: Array<{
    kind: RelationKind;
    pillars: [string, string];
    characters: [string, string];
  }>;
  season: { name: "봄" | "여름" | "가을" | "겨울" | "환절기"; monthBranch: string; centralElement: Element };
  elementScores: Record<Element, number>;
  method: string;
};

const STEMS = [..."甲乙丙丁戊己庚辛壬癸"];
const STEM_ELEMENTS: Element[] = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const HIDDEN: Record<string, string[]> = {
  子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"], 卯: ["乙"],
  辰: ["戊", "乙", "癸"], 巳: ["丙", "庚", "戊"], 午: ["丁", "己"], 未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"], 酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"],
};
const GENERATES: Record<Element, Element> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
const CONTROLS: Record<Element, Element> = { 목: "토", 화: "금", 토: "수", 금: "목", 수: "화" };

function elementOfStem(stem: string): Element {
  return STEM_ELEMENTS[STEMS.indexOf(stem)];
}

function samePolarity(a: string, b: string) {
  return STEMS.indexOf(a) % 2 === STEMS.indexOf(b) % 2;
}

export function tenGod(dayStem: string, targetStem: string): TenGodName {
  const day = elementOfStem(dayStem);
  const target = elementOfStem(targetStem);
  const same = samePolarity(dayStem, targetStem);
  if (day === target) return same ? "비견" : "겁재";
  if (GENERATES[day] === target) return same ? "식신" : "상관";
  if (CONTROLS[day] === target) return same ? "편재" : "정재";
  if (CONTROLS[target] === day) return same ? "편관" : "정관";
  return same ? "편인" : "정인";
}

const PAIRS: Array<[RelationKind, string[]]> = [
  ["천간합", ["甲己", "乙庚", "丙辛", "丁壬", "戊癸"]],
  ["천간충", ["甲庚", "乙辛", "丙壬", "丁癸"]],
  ["지지합", ["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"]],
  ["지지충", ["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"]],
  ["지지파", ["子酉", "卯午", "辰丑", "未戌", "寅亥", "巳申"]],
  ["지지해", ["子未", "丑午", "寅巳", "卯辰", "申亥", "酉戌"]],
  ["지지형", ["子卯", "寅巳", "巳申", "申寅", "丑戌", "戌未", "未丑"]],
];
const SELF_PUNISH = new Set(["辰", "午", "酉", "亥"]);

function hasPair(pair: string, a: string, b: string) {
  return pair === a + b || pair === b + a;
}

function relations(pillars: Pillar[]): SajuStructure["relations"] {
  const out: SajuStructure["relations"] = [];
  for (let i = 0; i < pillars.length; i++) {
    for (let j = i + 1; j < pillars.length; j++) {
      for (const [kind, pairs] of PAIRS) {
        const stemKind = kind.startsWith("천간");
        const a = stemKind ? pillars[i].stem : pillars[i].branch;
        const b = stemKind ? pillars[j].stem : pillars[j].branch;
        if (pairs.some((pair) => hasPair(pair, a, b))) {
          out.push({ kind, pillars: [pillars[i].label, pillars[j].label], characters: [a, b] });
        }
      }
      if (pillars[i].branch === pillars[j].branch && SELF_PUNISH.has(pillars[i].branch)) {
        out.push({ kind: "지지자형", pillars: [pillars[i].label, pillars[j].label], characters: [pillars[i].branch, pillars[j].branch] });
      }
    }
  }
  return out;
}

function seasonFor(monthBranch: string): SajuStructure["season"] {
  if (["寅", "卯"].includes(monthBranch)) return { name: "봄", monthBranch, centralElement: "목" };
  if (["巳", "午"].includes(monthBranch)) return { name: "여름", monthBranch, centralElement: "화" };
  if (["申", "酉"].includes(monthBranch)) return { name: "가을", monthBranch, centralElement: "금" };
  if (["亥", "子"].includes(monthBranch)) return { name: "겨울", monthBranch, centralElement: "수" };
  return { name: "환절기", monthBranch, centralElement: "토" };
}

export function calculateStructure(chart: SajuChart): SajuStructure {
  const dayStem = chart.pillars[2].stem;
  const season = seasonFor(chart.pillars[1].branch);
  const scores: Record<Element, number> = { ...chart.elements };
  const hiddenWeights = [0.5, 0.3, 0.2];
  const tenGods = chart.pillars.map((pillar, pillarIndex) => ({
    pillar: pillar.label,
    stem: pillar.stem,
    stemTenGod: pillarIndex === 2 ? "일간" as const : tenGod(dayStem, pillar.stem),
    hidden: (HIDDEN[pillar.branch] || []).map((stem, index) => {
      scores[elementOfStem(stem)] += hiddenWeights[index] || 0.2;
      return { stem, tenGod: tenGod(dayStem, stem), role: index === 0 ? "주된 숨은 기운" : `보조 숨은 기운 ${index}` };
    }),
  }));
  scores[season.centralElement] += 1.5;
  for (const key of Object.keys(scores) as Element[]) scores[key] = Math.round(scores[key] * 10) / 10;
  return {
    tenGods,
    relations: relations(chart.pillars),
    season,
    elementScores: scores,
    method: "보이는 천간·지지 각 1점, 지장간 순서대로 0.5·0.3·0.2점, 월지 계절의 중심 오행 1.5점을 더한 서비스 참고 점수입니다. 신강·신약이나 용신 판정은 아닙니다.",
  };
}
