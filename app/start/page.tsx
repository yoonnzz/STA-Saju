import SajuForm from "../saju-form";

export default function StartPage() {
  return <main><header className="page-header"><p className="eyebrow">새 사주 보기</p><h1>내 사주 시작하기</h1><p className="intro">출생 정보를 입력하면 계산 결과를 먼저 확인하고 깊은 풀이를 만들 수 있습니다.</p></header><SajuForm view="start" /></main>;
}
