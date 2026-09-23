import type { SajuChart } from "../lib/saju/chart";
import { ELEMENT_ORDER } from "../lib/saju/reading";

export default function SajuOverview({ chart }: { chart: SajuChart }) {
  const counts = ELEMENT_ORDER.map((element) => chart.elements[element]);
  const most = Math.max(...counts);
  const least = Math.min(...counts);
  const namesAt = (count: number) =>
    ELEMENT_ORDER.filter((element) => chart.elements[element] === count).join("·");

  return (
    <section className="saju-overview" aria-label="사주 8글자와 오행 분포">
      <div className="overview-section">
        <h3>나의 사주 8글자</h3>
        <p className="overview-help">태어난 해·달·날·시간마다 첫 글자(천간)와 둘째 글자(지지)가 하나씩 있습니다.</p>
        <div className="eight-characters">
          {chart.pillars.map((pillar) => (
            <div className="character-pillar" key={pillar.label}>
              <h4>{pillar.label}</h4>
              <div className="character-pair">
                <div className="character-tile" data-element={pillar.stemElement}>
                  <span className="character-kind">천간</span>
                  <strong>{pillar.stem}</strong>
                  <span>{pillar.korean[0]} · {pillar.stemElement}</span>
                </div>
                <div className="character-tile" data-element={pillar.branchElement}>
                  <span className="character-kind">지지</span>
                  <strong>{pillar.branch}</strong>
                  <span>{pillar.korean[1]} · {pillar.branchElement}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overview-section">
        <h3>오행 분포</h3>
        <p className="overview-help">위 8글자의 대표 오행을 하나씩 세었습니다.</p>
        <ul className="overview-elements">
          {ELEMENT_ORDER.map((element) => (
            <li key={element} data-element={element}>
              <span className="overview-element-name">{element}</span>
              <span className="overview-track" aria-hidden="true">
                <span style={{ width: `${(chart.elements[element] / 8) * 100}%` }} />
              </span>
              <strong>{chart.elements[element]} / 8</strong>
            </li>
          ))}
        </ul>
        <p className="overview-extremes">
          가장 많음 <strong>{namesAt(most)} ({most}개)</strong>
          <span aria-hidden="true"> · </span>
          가장 적음 <strong>{namesAt(least)} ({least}개)</strong>
        </p>
        <p className="overview-note">이 비교는 8글자의 횟수만 보여줍니다. 적거나 0개인 오행을 사주 전체의 부족함으로 단정하지 않습니다.</p>
      </div>
    </section>
  );
}
