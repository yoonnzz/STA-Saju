"use client";

import { useEffect, useState } from "react";
import type { DailyFortune } from "../lib/saju/daily-fortune";

function todayInKorea() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isFortune(value: unknown): value is DailyFortune {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ["date", "dayPillar", "dayTenGod", "summary", "work", "money", "relationships", "action"]
    .every((key) => typeof item[key] === "string" && Boolean(item[key]));
}

export default function DailyFortunePanel({ userId }: { userId: string }) {
  const [today, setToday] = useState(todayInKorea);
  const [fortune, setFortune] = useState<DailyFortune | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = todayInKorea();
      if (current !== today) {
        setToday(current);
        setFortune(null);
        setError("");
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [today]);

  async function loadFortune() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/daily-fortune", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "오늘의 운세를 불러오지 못했습니다.");
      if (!isFortune(result?.fortune)) throw new Error("오늘의 운세 형식을 확인하지 못했습니다.");
      setToday(result.fortune.date);
      setFortune(result.fortune);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "오늘의 운세를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="daily-fortune" aria-labelledby={`daily-title-${userId}`}>
      <p className="result-label">{today} · 한국 날짜 기준</p>
      <h2 id={`daily-title-${userId}`}>오늘의 운세</h2>
      <p className="daily-intro">계정에 저장된 사주로 그날의 운세를 미리 준비합니다. 준비된 결과가 없으면 버튼을 눌렀을 때 생성합니다.</p>
      {!fortune && (
        <button type="button" onClick={loadFortune} disabled={loading}>
          {loading ? "오늘의 운세를 확인하고 있습니다…" : error ? "다시 시도하기" : "오늘의 운세 보기"}
        </button>
      )}
      {loading && <p role="status">처음 만드는 날에는 잠시 걸릴 수 있습니다.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {fortune && (
        <div className="daily-result">
          <p className="daily-summary">{fortune.summary}</p>
          <dl className="daily-grid">
            <div><dt>일</dt><dd>{fortune.work}</dd></div>
            <div><dt>돈</dt><dd>{fortune.money}</dd></div>
            <div><dt>관계</dt><dd>{fortune.relationships}</dd></div>
            <div><dt>오늘의 실천 팁</dt><dd>{fortune.action}</dd></div>
          </dl>
          <p className="note">계산 근거: 오늘 일진 {fortune.dayPillar}, 일간과 오늘 천간의 십성 관계 {fortune.dayTenGod}. 위 문장은 계산값을 바탕으로 작성한 해석이며 미래를 확정하지 않습니다.</p>
        </div>
      )}
    </section>
  );
}
