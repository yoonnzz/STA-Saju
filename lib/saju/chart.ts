import lunar from "lunar-javascript";

const { Solar } = lunar;

export type SajuInput = {
  date: string;
  time: string;
  gender: "male" | "female";
  calendar: "solar";
  topic: "general" | "career" | "relationship";
  question?: string;
  unknownTime?: boolean;
};

export type Pillar = {
  label: string;
  text: string;
  korean: string;
  stem: string;
  branch: string;
  stemElement: string;
  branchElement: string;
};

export type SajuChart = {
  pillars: Pillar[];
  elements: Record<"목" | "화" | "토" | "금" | "수", number>;
  dayMaster: { character: string; korean: string; element: string };
  method: string;
  engine: string;
  elementMethod: string;
  fortune?: Fortune;
};

export type Fortune = {
  referenceYear: number;
  direction: "순행" | "역행";
  start: { year: number; month: number; day: number; hour: number };
  decades: Array<{
    ganZhi: string;
    startYear: number;
    endYear: number;
    startAge: number;
    endAge: number;
    current: boolean;
  }>;
  years: Array<{ year: number; age: number; ganZhi: string }>;
  months: Array<{ month: number; label: string; ganZhi: string }>;
  method: string;
};

export class InputError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

const stems = [..."甲乙丙丁戊己庚辛壬癸"];
const branches = [..."子丑寅卯辰巳午未申酉戌亥"];
const stemKo = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const branchKo = [
  "자",
  "축",
  "인",
  "묘",
  "진",
  "사",
  "오",
  "미",
  "신",
  "유",
  "술",
  "해",
];
const stemElement = [
  "목",
  "목",
  "화",
  "화",
  "토",
  "토",
  "금",
  "금",
  "수",
  "수",
];
const branchElement = [
  "수",
  "토",
  "목",
  "목",
  "토",
  "화",
  "화",
  "토",
  "금",
  "금",
  "토",
  "수",
];

export const CALCULATION =
  "양력 · 한국 표준시(UTC+9) · 23시 일자 변경 · 진태양시 보정 없음";

export function validateInput(raw: SajuInput): SajuInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new InputError("입력 내용을 확인해주세요.");
  if (raw.calendar !== "solar")
    throw new InputError(
      "이번 버전은 양력만 지원합니다. 양력 날짜를 입력해주세요.",
      "calendar",
    );

  const date = raw.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new InputError("생년월일을 입력해주세요.", "date");

  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    throw new InputError("실제로 존재하는 날짜를 입력해주세요.", "date");
  if (year < 1990)
    throw new InputError("1990년 1월 1일 이후의 날짜를 지원합니다.", "date");
  if (raw.unknownTime === true)
    throw new InputError(
      "이번 버전은 출생 시각을 아는 경우에만 계산합니다.",
      "unknownTime",
    );
  if (
    typeof raw.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time)
  )
    throw new InputError("태어난 시각을 정확히 입력해주세요.", "time");
  if (raw.gender !== "male" && raw.gender !== "female")
    throw new InputError("대운 계산을 위해 성별을 선택해주세요.", "gender");
  if (!["general", "career", "relationship"].includes(raw.topic))
    throw new InputError("풀이 주제를 선택해주세요.", "topic");
  if (raw.question !== undefined && typeof raw.question !== "string")
    throw new InputError("질문은 글자로 입력해주세요.", "question");

  const question = (raw.question || "").trim();
  if (question.length > 200)
    throw new InputError("질문은 200자까지 입력할 수 있어요.", "question");

  return {
    date,
    time: raw.time,
    gender: raw.gender,
    calendar: "solar",
    unknownTime: false,
    topic: raw.topic,
    question,
  };
}

function pillar(label: string, text: string): Pillar {
  const [stem, branch] = [...text];
  return {
    label,
    text,
    korean: stemKo[stems.indexOf(stem)] + branchKo[branches.indexOf(branch)],
    stem,
    branch,
    stemElement: stemElement[stems.indexOf(stem)],
    branchElement: branchElement[branches.indexOf(branch)],
  };
}

export function calculate(raw: SajuInput, referenceYear = new Date().getFullYear()): SajuChart {
  const input = validateInput(raw);
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);

  const chinaTime = new Date(
    Date.UTC(year, month - 1, day, hour - 1, minute),
  );
  const terms = Solar.fromYmdHms(
    chinaTime.getUTCFullYear(),
    chinaTime.getUTCMonth() + 1,
    chinaTime.getUTCDate(),
    chinaTime.getUTCHours(),
    minute,
    0,
  )
    .getLunar()
    .getEightChar();
  const local = Solar.fromYmdHms(year, month, day, hour, minute, 0)
    .getLunar()
    .getEightChar();
  local.setSect(1);

  const pillars = [
    pillar("년주", terms.getYear()),
    pillar("월주", terms.getMonth()),
    pillar("일주", local.getDay()),
    pillar("시주", local.getTime()),
  ];
  const elements: SajuChart["elements"] = {
    목: 0,
    화: 0,
    토: 0,
    금: 0,
    수: 0,
  };
  pillars.forEach((item) => {
    elements[item.stemElement as keyof typeof elements]++;
    elements[item.branchElement as keyof typeof elements]++;
  });

  const yun = terms.getYun(input.gender === "male" ? 1 : 0, 2);
  const allDaYun = yun.getDaYun(12);
  const decades = allDaYun
    .filter((item) => item.getIndex() > 0)
    .map((item) => ({
      ganZhi: item.getGanZhi(),
      startYear: item.getStartYear(),
      endYear: item.getEndYear(),
      startAge: item.getStartAge(),
      endAge: item.getEndAge(),
      current: item.getStartYear() <= referenceYear && referenceYear <= item.getEndYear(),
    }));
  const targetYears = [referenceYear, referenceYear + 1];
  const liuNian = allDaYun
    .flatMap((item) => item.getLiuNian())
    .filter((item) => targetYears.includes(item.getYear()));
  const years = targetYears.map((target) => {
    const item = liuNian.find((candidate) => candidate.getYear() === target);
    if (!item) throw new InputError("올해와 내년의 흐름을 계산하지 못했습니다.");
    return { year: item.getYear(), age: item.getAge(), ganZhi: item.getGanZhi() };
  });
  const currentYear = liuNian.find((item) => item.getYear() === referenceYear);
  if (!currentYear || !decades.some((item) => item.current)) {
    throw new InputError("현재 시기의 흐름을 계산하지 못했습니다.");
  }
  const months = currentYear.getLiuYue().map((item, index) => ({
    month: index + 1,
    label: item.getMonthInChinese(),
    ganZhi: item.getGanZhi(),
  }));

  return {
    pillars,
    elements,
    dayMaster: {
      character: pillars[2].stem,
      korean: stemKo[stems.indexOf(pillars[2].stem)],
      element: pillars[2].stemElement,
    },
    method: CALCULATION,
    engine: "lunar-javascript@1.7.7",
    elementMethod:
      "천간과 지지의 대표 오행 8자를 센 값입니다. 지장간과 계절 가중치를 반영한 강약 판단은 아닙니다.",
    fortune: {
      referenceYear,
      direction: yun.isForward() ? "순행" : "역행",
      start: {
        year: yun.getStartYear(),
        month: yun.getStartMonth(),
        day: yun.getStartDay(),
        hour: yun.getStartHour(),
      },
      decades,
      years,
      months,
      method:
        "대한민국 출생·한국 표준시, lunar-javascript의 분 단위 절기 방식(sect 2)으로 계산했습니다. 월운의 달은 절기 기준입니다.",
    },
  };
}
