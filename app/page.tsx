import SajuForm from "./saju-form";

export default function Page() {
  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">사주로 시작하는 자기 이해</p>
        <h1>내 사주를 읽는 시간,<br />나를 이해하는 시작.</h1>
        <p className="intro">
          어려운 사주 용어는 쉽게, 해석의 근거는 분명하게. 궁금한 이야기부터 골라 읽어보세요.
        </p>
      </header>
      <SajuForm view="home" />
    </main>
  );
}
