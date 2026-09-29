"use client";

import { useEffect, useState, type FormEvent } from "react";

type ShareItem = { id: string; nickname: string; created_at: string; expires_at: string };

export default function ShareManager() {
  const [nickname, setNickname] = useState("");
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [createdPath, setCreatedPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadShares() {
    const response = await fetch("/api/shares", { cache: "no-store" });
    if (!response.ok) throw new Error("공유 링크 목록을 불러오지 못했습니다.");
    const result = await response.json();
    setShares(Array.isArray(result.shares) ? result.shares : []);
  }

  useEffect(() => {
    void loadShares().catch(() => setMessage("공유 링크 목록을 불러오지 못했습니다."));
  }, []);

  async function createShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setCreatedPath("");
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "공유 링크를 만들지 못했습니다.");
      setCreatedPath(result.path);
      setNickname("");
      setMessage("공유 링크를 만들었습니다. 주소를 복사해 전달해주세요.");
      try {
        await loadShares();
      } catch {
        setMessage("공유 링크는 만들었지만 목록을 갱신하지 못했습니다. 위 주소를 복사해주세요.");
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "공유 링크를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShare(id: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/shares/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "공유 링크를 삭제하지 못했습니다.");
      }
      setShares((current) => current.filter((item) => item.id !== id));
      setCreatedPath("");
      setMessage("공유 링크를 삭제했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "공유 링크를 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const shareUrl = createdPath && typeof window !== "undefined" ? `${window.location.origin}${createdPath}` : "";

  return <section className="share-manager" aria-labelledby="share-title">
    <h4 id="share-title">결과 공유하기</h4>
    <p>공유 링크를 가진 사람은 이 결과의 목차와 풀이를 볼 수 있습니다. 링크는 30일 후 만료됩니다.</p>
    <form onSubmit={createShare}>
      <label htmlFor="share-nickname">공유 페이지에 표시할 별명</label>
      <input id="share-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required placeholder="예: 초록 나무" />
      <button type="submit" disabled={busy}>공유 링크 만들기</button>
    </form>
    {createdPath && <div className="share-created">
      <p>새 링크는 이 화면에서만 다시 복사할 수 있습니다.</p>
      <a href={createdPath}>{shareUrl}</a>
      <button type="button" className="secondary-button" onClick={() => {
        if (!navigator.clipboard?.writeText) {
          setMessage("자동 복사를 사용할 수 없습니다. 위 주소를 직접 복사해주세요.");
          return;
        }
        void navigator.clipboard.writeText(shareUrl)
          .then(() => setMessage("링크를 복사했습니다."))
          .catch(() => setMessage("복사하지 못했습니다. 위 주소를 직접 복사해주세요."));
      }}>주소 복사</button>
    </div>}
    {message && <p role="status">{message}</p>}
    {shares.length > 0 && <div className="share-list"><h5>활성 공유 링크</h5><ul>{shares.map((share) => <li key={share.id}><span>{share.nickname} · {new Date(share.expires_at).toLocaleDateString("ko-KR")} 만료</span><button type="button" className="secondary-button" disabled={busy} onClick={() => void deleteShare(share.id)}>삭제</button></li>)}</ul></div>}
  </section>;
}
