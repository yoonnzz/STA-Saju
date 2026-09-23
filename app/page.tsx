import SajuForm from "./saju-form";

export default function Page() {
  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">나를 이해하는 작은 시작</p>
        <h1>내 사주를<br />쉽게 읽어보세요.</h1>
        <p className="intro">
          핵심은 한눈에 보고, 궁금한 내용은 펼쳐서 확인해보세요.
        </p>
      </header>
      <SajuForm />
    </main>
  );
}
