import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "내 사주 쉽게 읽기",
  description: "내 사주를 읽는 시간, 나를 이해하는 시작. 어려운 사주 용어는 쉽게, 해석의 근거는 분명하게 읽어보세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
