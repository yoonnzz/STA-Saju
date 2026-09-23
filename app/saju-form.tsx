"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  calculate,
  InputError,
  type SajuChart,
  type SajuInput,
} from "../lib/saju/chart";
import { createReading } from "../lib/saju/reading";
import {
  evidenceLabels,
  type GeminiReading,
  type ReadingSection,
} from "../lib/saju/interpretation";
import {
  parseStoredReading,
  STORED_READING_KEY,
  type StoredReading,
} from "../lib/saju/stored-reading";
import { hasSupabaseConfig } from "../lib/supabase/config";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

const ACCOUNT_FALLBACK_PREFIX = "saju-reading-account-v1:";

export default function SajuForm() {
  const [chart, setChart] = useState<SajuChart | null>(null);
  const [error, setError] = useState("");
  const [input, setInput] = useState<{
    date: string;
    time: string;
    gender: "male" | "female";
  } | null>(null);
  const [geminiReading, setGeminiReading] = useState<GeminiReading | null>(null);
  const [saved, setSaved] = useState<StoredReading | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [resultSource, setResultSource] = useState<"local" | "account" | null>(null);
  const [pendingAccountRecord, setPendingAccountRecord] = useState<StoredReading | null>(null);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const previousUserId = useRef<string | null>(null);
  const reading = chart ? createReading(chart) : null;
  const evidence = chart ? evidenceLabels(chart) : null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORED_READING_KEY);
      const previous = parseStoredReading(raw);
      if (previous) {
        setSaved(previous);
        setChart(previous.chart);
        setGeminiReading(previous.reading);
        setResultSource("local");
      } else if (raw) {
        setStorageMessage("저장된 결과를 읽을 수 없습니다. 새로 계산해주세요.");
      }
    } catch {
      setStorageMessage("이 브라우저에서 저장된 결과를 읽을 수 없습니다.");
    }
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setAuthError("로그인 설정이 아직 준비되지 않았습니다.");
      setAuthLoading(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setAuthLoading(false);
    }).catch(() => {
      setAuthError("로그인 상태를 확인하지 못했습니다.");
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    if (new URLSearchParams(window.location.search).get("login") === "failed") {
      setAuthError("로그인을 완료하지 못했습니다. 다시 시도해주세요.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const oldUserId = previousUserId.current;
    previousUserId.current = user?.id ?? null;
    if (user) {
      void loadAccountReading(user.id);
      return;
    }
    if (oldUserId) {
      setPendingAccountRecord(null);
      setStorageMessage("");
      setResultSource(saved ? "local" : null);
      setChart(saved?.chart ?? null);
      setGeminiReading(saved?.reading ?? null);
      setInput(null);
    }
  // `saved` is intentionally read when the login identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  async function loadAccountReading(userId: string) {
    setStorageMessage("계정에 저장된 결과를 불러오고 있습니다…");
    try {
      const response = await fetch("/api/readings/latest", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "저장된 결과를 불러오지 못했습니다.");
      const record = result?.reading
        ? parseStoredReading(JSON.stringify(result.reading))
        : null;
      if (result?.reading && !record) throw new Error("저장된 결과의 형식을 읽을 수 없습니다.");
      if (previousUserId.current !== userId) return;
      if (record) {
        setPendingAccountRecord(null);
        setChart(record.chart);
        setGeminiReading(record.reading);
        setInput(null);
        setResultSource("account");
        setStorageMessage("내 계정에 저장된 최근 결과입니다.");
      } else {
        setStorageMessage(saved
          ? "계정에 저장된 결과가 없습니다. 아래 결과를 계정에 저장할 수 있습니다."
          : "아직 계정에 저장된 해석이 없습니다.");
      }
    } catch (caught) {
      if (previousUserId.current !== userId) return;
      const fallback = parseStoredReading(
        localStorage.getItem(`${ACCOUNT_FALLBACK_PREFIX}${userId}`),
      );
      if (fallback) {
        setChart(fallback.chart);
        setGeminiReading(fallback.reading);
        setInput(null);
        setResultSource("account");
      }
      setStorageMessage(caught instanceof Error
        ? caught.message
        : "저장된 결과를 불러오지 못했습니다.");
    }
  }

  async function signInWithGoogle() {
    if (authBusy || !hasSupabaseConfig()) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch {
      setAuthError("로그인을 시작하지 못했습니다. 다시 시도해주세요.");
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    const { error } = await createSupabaseBrowserClient().auth.signOut();
    if (error) {
      setAuthError("로그아웃하지 못했습니다. 다시 시도해주세요.");
    }
    setAuthBusy(false);
  }

  async function saveLocalToAccount() {
    const record = pendingAccountRecord || (resultSource === "local" ? saved : null);
    if (!user || !record || authBusy) return;
    setAuthBusy(true);
    setStorageMessage("계정에 저장하고 있습니다…");
    try {
      const response = await fetch("/api/readings/latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "계정에 저장하지 못했습니다.");
      setResultSource("account");
      setPendingAccountRecord(null);
      setStorageMessage("내 계정에 저장되었습니다.");
    } catch (caught) {
      setStorageMessage(caught instanceof Error
        ? caught.message
        : "계정에 저장하지 못했습니다.");
    } finally {
      setAuthBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestId.current += 1;
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setAiError("");
    const data = new FormData(event.currentTarget);
    const input: SajuInput = {
      date: String(data.get("date") || ""),
      time: String(data.get("time") || ""),
      gender: String(data.get("gender") || "") as "male" | "female",
      calendar: "solar",
      topic: "general",
      question: "",
    };

    try {
      setChart(calculate(input));
      setInput({ date: input.date, time: input.time, gender: input.gender });
      setGeminiReading(null);
      setResultSource(null);
      setError("");
    } catch (caught) {
      setChart(null);
      setInput(null);
      setGeminiReading(null);
      setResultSource(null);
      setError(
        caught instanceof InputError
          ? caught.message
          : "계산하지 못했습니다. 입력을 확인해주세요.",
      );
    }
  }

  async function requestGeminiReading() {
    if (!input || loading) return;
    const id = ++requestId.current;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setAiError("");

    try {
      const response = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "AI 해석을 가져오지 못했습니다. 다시 시도해주세요.",
        );
      }
      const record = parseStoredReading(
        JSON.stringify({
          version: 1,
          createdAt: typeof result.createdAt === "string"
            ? result.createdAt
            : new Date().toISOString(),
          chart: result.chart,
          reading: result.reading,
        }),
      );
      if (!record) throw new Error("해석 결과를 확인하지 못했습니다. 다시 시도해주세요.");
      if (id !== requestId.current) return;
      setChart(record.chart);
      setGeminiReading(record.reading);
      if (result.accountSave === "saved") {
        setResultSource("account");
        setPendingAccountRecord(null);
        setStorageMessage("내 계정에 저장되었습니다.");
      } else if (user) {
        setResultSource("account");
        setPendingAccountRecord(record);
        try {
          localStorage.setItem(`${ACCOUNT_FALLBACK_PREFIX}${user.id}`, JSON.stringify(record));
        } catch {
          // The result remains visible even if the local fallback is unavailable.
        }
        setStorageMessage("해석은 만들었지만 계정에 저장하지 못했습니다. 다시 시도해주세요.");
      } else {
        setResultSource("local");
        try {
          localStorage.setItem(STORED_READING_KEY, JSON.stringify(record));
          setSaved(record);
          setStorageMessage("");
        } catch {
          setStorageMessage("해석은 표시했지만 이 브라우저에 저장하지 못했습니다.");
        }
      }
    } catch (caught) {
      if (id !== requestId.current) return;
      setAiError(
        caught instanceof Error
          ? caught.message
          : "AI 해석을 가져오지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        controller.current = null;
      }
    }
  }

  function restoreSaved() {
    if (!saved) return;
    requestId.current += 1;
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setChart(saved.chart);
    setGeminiReading(saved.reading);
    setResultSource("local");
    setInput(null);
    setError("");
    setAiError("");
  }

  return (
    <section className="input-card" aria-labelledby="input-title">
      <section className="auth-panel" aria-label="계정">
        {authLoading ? (
          <p role="status">로그인 상태를 확인하고 있습니다…</p>
        ) : user ? (
          <div className="auth-row">
            <div>
              <strong>{user.user_metadata?.full_name || user.email || "Google 사용자"}</strong>
              <p>Google 계정으로 로그인했습니다.</p>
            </div>
            <button className="secondary-button" type="button" onClick={signOut} disabled={authBusy}>
              로그아웃
            </button>
          </div>
        ) : (
          <div className="auth-row">
            <div>
              <strong>결과를 계정에 보관하세요</strong>
              <p>로그인하면 다른 브라우저에서도 최근 해석을 볼 수 있습니다.</p>
            </div>
            <button className="google-button" type="button" onClick={signInWithGoogle} disabled={authBusy || Boolean(authError && !hasSupabaseConfig())}>
              {authBusy ? "로그인하고 있습니다…" : "Google로 로그인"}
            </button>
          </div>
        )}
        {authError && <p className="error" role="alert">{authError}</p>}
      </section>

      <h2 id="input-title">언제 태어나셨나요?</h2>
      <p className="form-intro">대한민국 출생 기준으로 양력 생년월일, 태어난 시간과 성별을 입력해주세요.</p>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="date">생년월일</label>
        <input id="date" name="date" type="date" required />

        <label htmlFor="time">출생시간</label>
        <input id="time" name="time" type="time" required />

        <label htmlFor="gender">성별</label>
        <select id="gender" name="gender" defaultValue="" required>
          <option value="" disabled>선택해주세요</option>
          <option value="male">남성</option>
          <option value="female">여성</option>
        </select>

        <button type="submit">내 사주 알아보기</button>
      </form>

      {saved && (input || !chart) && (
        <button className="restore-button" type="button" onClick={restoreSaved}>
          최근 저장된 결과 다시 보기
        </button>
      )}
      {storageMessage && <p className="storage-message">{storageMessage}</p>}
      {user && (pendingAccountRecord || (saved && resultSource === "local")) && (
        <button className="restore-button" type="button" onClick={saveLocalToAccount} disabled={authBusy}>
          {pendingAccountRecord ? "계정 저장 다시 시도" : "이 결과를 내 계정에 저장"}
        </button>
      )}

      <div className="feedback" aria-live="polite">
        {error && <p className="error">{error}</p>}
        {chart && (
          <section className="result" aria-labelledby="result-title">
            <div className="summary-card">
              <p className="result-label">
                {geminiReading && !input
                  ? resultSource === "account"
                    ? "내 계정에 저장된 최근 결과"
                    : "이 브라우저에 저장된 최근 결과"
                  : "한눈에 보는 내 사주"}
              </p>
              <h2 id="result-title" className="day-pillar">
                {chart.pillars[2].korean}일주
              </h2>
              <p className="summary-text">{reading?.summary}</p>
              <p className="summary-caution">
                먼저 계산으로 확인한 사실을 보여드립니다. 오행 횟수만으로 성격이나
                미래를 단정할 수는 없습니다.
              </p>
            </div>

            <section className="ai-panel" aria-labelledby="ai-title">
              <p className="result-label">사주를 더 깊게 읽기</p>
              <h3 id="ai-title">Gemini 해석</h3>
              {!geminiReading && (
                <>
                  <p>
                    나 자신, 일과 돈, 사랑과 관계, 대운·세운·월운을 20~30대의
                    일과 관계, 독립과 돈 관리 상황에 맞춰 깊게 풀어드립니다. 어려운
                    사주 용어는 바로 다음 문장에서 일상적인 뜻으로 설명합니다.
                    해석을 요청하면 <strong>계산된 사주 자료만 Gemini에 전달</strong>됩니다.
                    원본 생년월일, 출생시간과 성별은 Gemini에 보내지 않습니다.
                  </p>
                  {input && (
                    <button
                      className="ai-button"
                      type="button"
                      onClick={requestGeminiReading}
                      disabled={loading}
                    >
                      {loading ? "해석을 작성하고 있습니다…" : aiError ? "다시 시도하기" : "Gemini 해석 보기"}
                    </button>
                  )}
                  {loading && <p role="status">잠시만 기다려주세요.</p>}
                  {aiError && <p className="error" role="alert">{aiError}</p>}
                </>
              )}
              {geminiReading && evidence && (
                <>
                  <p className="ai-summary">{geminiReading.summary}</p>
                  <p className="ai-note">
                    아래 내용은 계산값을 바탕으로 작성한 해석입니다. 사실이나 미래를
                    확정하는 설명은 아닙니다.
                  </p>
                  <div className="ai-details deep-reading">
                    <AiDetail
                      title="1. 나 자신"
                      section={geminiReading.personality}
                      evidence={evidence}
                      strengths={geminiReading.personality.strengths}
                      cautions={geminiReading.personality.cautions}
                    />
                    <AiDetail title="2. 일과 돈" section={geminiReading.career} evidence={evidence} />
                    <AiDetail title="3. 사랑과 관계" section={geminiReading.relationships} evidence={evidence} />
                    {geminiReading.lifeFlow && (
                      <LifeFlowDetail section={geminiReading.lifeFlow} evidence={evidence} />
                    )}
                    {geminiReading.shensha && (
                      <ShenshaReadingDetail section={geminiReading.shensha} chart={chart} />
                    )}
                    {geminiReading.finalAdvice && (
                      <section className="deep-category final-advice">
                        <h4>6. 전체 실천 조언</h4>
                        <p>{geminiReading.finalAdvice.summary}</p>
                        <ol>
                          {geminiReading.finalAdvice.actions.map((action, index) => (
                            <li key={`${action}-${index}`}>{action}</li>
                          ))}
                        </ol>
                      </section>
                    )}
                  </div>
                </>
              )}
            </section>

            <div className="detail-list">
              <h3>궁금한 내용을 펼쳐 보세요</h3>
              <details>
                <summary>일간은 무엇을 뜻하나요?</summary>
                <div className="detail-content">
                  <p>
                    <strong>계산에서 확인한 사실</strong> — 일간은 일주 첫 글자입니다.
                    이 결과의 일주는 {chart.pillars[2].korean}({chart.pillars[2].text})이고,
                    일간은 {chart.dayMaster.korean}({chart.dayMaster.character})입니다.
                  </p>
                  <p>
                    <strong>전통적 상징</strong> — ‘{chart.dayMaster.element}’이라는
                    오행에는 ‘{reading?.elementRows.find(
                      (row) => row.element === chart.dayMaster.element,
                    )?.meaning}’ 같은 의미를 연결하기도 합니다. 이것만으로 개인의
                    성향을 확정할 수는 없습니다.
                  </p>
                </div>
              </details>

              <details>
                <summary>다섯 오행은 어떻게 나타났나요?</summary>
                <div className="detail-content">
                  <p>
                    <strong>계산에서 확인한 사실</strong> — 네 기둥의 천간과 지지,
                    총 8글자에 해당하는 대표 오행을 하나씩 셌습니다.
                  </p>
                  <ul className="element-list">
                    {reading?.elementRows.map((row) => (
                      <li key={row.element}>
                        <span className="element-name">{row.element}</span>
                        <span className="element-track" aria-hidden="true">
                          <span style={{ width: `${(row.count / 8) * 100}%` }} />
                        </span>
                        <span className="element-count">{row.count} / 8</span>
                        <span className="element-meaning">{row.meaning}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="note">{chart.elementMethod}</p>
                </div>
              </details>

              <details>
                <summary>어떤 계산 결과에서 나왔나요?</summary>
                <div className="detail-content">
                  <p>
                    <strong>계산에서 확인한 사실</strong> — 아래 네 기둥의 한자
                    8글자를 바탕으로 위의 일간과 대표 오행을 보여드립니다.
                  </p>
                  <dl className="pillars">
                    {chart.pillars.map((item) => (
                      <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.text}</dd>
                        <dd className="pillar-korean">{item.korean}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="note">계산 기준: {chart.method}</p>
                </div>
              </details>

              {chart.fortune && (
                <details>
                  <summary>대운·세운·월운은 어떻게 계산했나요?</summary>
                  <div className="detail-content">
                    <p><strong>대운 방향</strong> — {chart.fortune.direction}</p>
                    <p>
                      <strong>대운 시작까지</strong> — 약 {chart.fortune.start.year}년 {chart.fortune.start.month}개월 {chart.fortune.start.day}일
                    </p>
                    <p>
                      <strong>현재 10년 흐름</strong> — {chart.fortune.decades.find((item) => item.current)?.ganZhi}
                    </p>
                    <p>
                      <strong>올해와 내년</strong> — {chart.fortune.years.map((item) => `${item.year}년 ${item.ganZhi}`).join(" · ")}
                    </p>
                    <p className="note">{chart.fortune.method}</p>
                  </div>
                </details>
              )}

              {chart.structure && <StructureDetail structure={chart.structure} />}

              {chart.shensha && (
                <details open>
                  <summary>내 사주의 살과 귀인</summary>
                  <div className="detail-content shensha-local">
                    <p>
                      <strong>계산에서 확인한 사실</strong> — 서비스 규칙집 {chart.shensha.checkedCount}개를 모두 검사해 {chart.shensha.matched.length}개를 찾았습니다.
                    </p>
                    <p className="note">
                      살과 귀인은 사주 전체를 보조해서 읽는 전통적 상징입니다. 이름만으로 좋은 일이나 나쁜 일을 확정하지 않습니다.
                    </p>
                    {chart.shensha.matched.length === 0 ? (
                      <p>이 규칙집에서는 발견된 살·귀인이 없습니다.</p>
                    ) : (
                      <div className="shensha-grid">
                        {chart.shensha.matched.map((item) => (
                          <article className="shensha-card" key={item.ruleId}>
                            <div className="shensha-heading">
                              <h4>{item.name}</h4>
                              <span>{item.polarity === "helper" ? "도움 상징" : item.polarity === "caution" ? "주의 상징" : "혼합 상징"}</span>
                            </div>
                            {item.hits.map((hit, index) => (
                              <p key={`${item.ruleId}-${index}`}><strong>계산 근거</strong> — {hit.via} · {hit.pillars.join("·")}주</p>
                            ))}
                            <p><strong>현재 시기</strong> — {formatShenshaTiming(item)}</p>
                            {item.sourceStatus !== "cross_checked" && (
                              <p className="rule-note">이 항목은 계산법 차이가 있어 이 서비스가 선택한 규칙으로 계산했습니다.</p>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

const TEN_GOD_MEANINGS: Record<string, string> = {
  비견: "나와 비슷한 방식으로 주도하고 경쟁하는 힘",
  겁재: "사람들과 자원과 기회를 나누거나 경쟁하는 방식",
  식신: "경험과 능력을 꾸준히 결과로 만드는 방식",
  상관: "기존 기준을 질문하고 자신의 생각을 표현하는 방식",
  편재: "움직이는 기회와 여러 자원을 빠르게 다루는 방식",
  정재: "현실적인 자원과 돈을 계획적으로 관리하는 방식",
  편관: "압박과 도전 속에서 결단하고 버티는 방식",
  정관: "기준과 책임, 역할을 의식하며 움직이는 방식",
  편인: "익숙하지 않은 관점과 직감으로 정보를 받아들이는 방식",
  정인: "배움과 보호, 충분한 근거를 통해 안정감을 얻는 방식",
};

function StructureDetail({ structure }: { structure: NonNullable<SajuChart["structure"]> }) {
  const usedTenGods = [...new Set(structure.tenGods.flatMap((item) => [
    ...(item.stemTenGod === "일간" ? [] : [item.stemTenGod]),
    ...item.hidden.map((hidden) => hidden.tenGod),
  ]))];
  return (
    <details open>
      <summary>내 사주의 구조</summary>
      <div className="detail-content structure-detail">
        <p><strong>태어난 계절</strong> — 월지 {structure.season.monthBranch}를 기준으로 {structure.season.name}, 중심 오행은 {structure.season.centralElement}입니다.</p>
        <div className="structure-grid">
          {structure.tenGods.map((item) => (
            <article key={item.pillar}>
              <h4>{item.pillar}</h4>
              <p><strong>겉으로 보이는 천간</strong> — {item.stem} · {item.stemTenGod}</p>
              <p><strong>지장간</strong> — {item.hidden.map((hidden) => `${hidden.stem} ${hidden.tenGod}(${hidden.role})`).join(" · ")}</p>
            </article>
          ))}
        </div>
        <h4>십성 쉽게 읽기</h4>
        <dl className="term-list">
          {usedTenGods.map((name) => <div key={name}><dt>{name}</dt><dd>{TEN_GOD_MEANINGS[name]}</dd></div>)}
        </dl>
        <h4>글자 사이의 관계</h4>
        {structure.relations.length ? (
          <ul>{structure.relations.map((relation, index) => <li key={`${relation.kind}-${index}`}>{relation.pillars.join("·")}의 {relation.characters.join("·")} — {relation.kind}</li>)}</ul>
        ) : <p>네 기둥 안에서 이번 기준에 해당하는 합·충·형·파·해가 없습니다.</p>}
        <h4>오행 참고 점수</h4>
        <p>{Object.entries(structure.elementScores).map(([name, score]) => `${name} ${score}`).join(" · ")}</p>
        <p className="note">{structure.method}</p>
      </div>
    </details>
  );
}

function formatShenshaTiming(item: NonNullable<SajuChart["shensha"]>["matched"][number]) {
  const periods = [
    item.timing.currentDecade.length ? "현재 대운" : "",
    item.timing.currentYear.length ? "올해" : "",
    item.timing.nextYear.length ? "내년" : "",
  ].filter(Boolean);
  return periods.length
    ? `${periods.join("·")}에 같은 조건이 다시 나타납니다.`
    : "현재 대운·올해·내년에는 같은 조건이 따로 나타나지 않습니다.";
}

function ShenshaReadingDetail({
  section,
  chart,
}: {
  section: NonNullable<GeminiReading["shensha"]>;
  chart: SajuChart;
}) {
  return (
    <section className="deep-category shensha-reading">
      <h4>5. 내 사주의 살과 귀인</h4>
      <p>{section.overview}</p>
      <div className="shensha-grid">
        {section.items.map((item) => {
          const calculated = chart.shensha?.matched.find((match) => match.ruleId === item.ruleId);
          return (
            <article className="shensha-card" key={item.ruleId}>
              <h5>{item.name}</h5>
              <p>{item.easyMeaning}</p>
              <p><strong>좋은 방향으로 나타날 때</strong> — {item.positiveConditions}</p>
              <p><strong>어렵게 나타날 때</strong> — {item.challengingConditions}</p>
              <p className="ai-example"><strong>예를 들면</strong> — {item.lifeExample}</p>
              <p><strong>해볼 일</strong> — {item.action}</p>
              <p><strong>현재 시기</strong> — {item.timingNote}</p>
              {calculated && <p className="rule-note"><strong>계산 근거</strong> — {calculated.hits.map((hit) => hit.via).join(" · ")}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AiDetail({
  title,
  section,
  evidence,
  strengths,
  cautions,
}: {
  title: string;
  section: ReadingSection;
  evidence: ReturnType<typeof evidenceLabels>;
  strengths?: string;
  cautions?: string;
}) {
  return (
    <section className="deep-category">
      <h4>{title}</h4>
      <div className="detail-content">
        <p>{section.overview}</p>
        {section.example && (
          <p className="ai-example"><strong>예를 들면</strong> — {section.example}</p>
        )}
        {strengths && <p><strong>강점으로 읽을 점</strong> — {strengths}</p>}
        {cautions && <p><strong>주의해서 볼 점</strong> — {cautions}</p>}
        {section.topics?.map((topic) => (
          <article className="reading-topic" key={topic.title}>
            <h5>{topic.title}</h5>
            <p>{topic.explanation}</p>
            <p className="ai-example"><strong>예를 들면</strong> — {topic.example}</p>
            <p className="topic-action"><strong>해볼 일</strong> — {topic.action}</p>
          </article>
        ))}
        <p><strong>참고한 계산 결과</strong></p>
        <ul className="evidence-list">
          {section.evidence.map((key) => <li key={key}>{evidence[key]}</li>)}
        </ul>
        <p><strong>용어 쉽게 읽기</strong></p>
        <dl className="term-list">
          {section.terms.map(({ term, meaning }, index) => (
            <div key={`${term}-${index}`}><dt>{term}</dt><dd>{meaning}</dd></div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function LifeFlowDetail({
  section,
  evidence,
}: {
  section: NonNullable<GeminiReading["lifeFlow"]>;
  evidence: ReturnType<typeof evidenceLabels>;
}) {
  return (
    <section className="deep-category life-flow">
      <h4>4. 삶의 흐름</h4>
      <p>{section.overview}</p>
      <article className="flow-period">
        <h5>{section.decade.label}</h5>
        <p>{section.decade.interpretation}</p>
        <p className="ai-example"><strong>예를 들면</strong> — {section.decade.example}</p>
        <p><strong>활용할 점</strong> — {section.decade.opportunity}</p>
        <p><strong>조심할 점</strong> — {section.decade.caution}</p>
        <p><strong>해볼 일</strong> — {section.decade.action}</p>
      </article>
      <div className="year-flow-grid">
        {section.years.map((year) => (
          <article className="flow-period" key={year.year}>
            <h5>{year.label}</h5>
            <p>{year.interpretation}</p>
            <p className="ai-example"><strong>예를 들면</strong> — {year.example}</p>
            <p><strong>활용할 점</strong> — {year.opportunity}</p>
            <p><strong>조심할 점</strong> — {year.caution}</p>
            <p><strong>해볼 일</strong> — {year.action}</p>
          </article>
        ))}
      </div>
      <h5 className="month-heading">월별 흐름</h5>
      <div className="month-flow-grid">
        {section.months.map((month) => (
          <article key={month.month}>
            <strong>{month.month}월</strong>
            <p>{month.theme}</p>
            <p className="month-advice">{month.advice}</p>
          </article>
        ))}
      </div>
      <p><strong>참고한 계산 결과</strong></p>
      <ul className="evidence-list">
        {section.evidence.map((key) => <li key={key}>{evidence[key]}</li>)}
      </ul>
    </section>
  );
}
