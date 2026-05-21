"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = Readonly<{
  children: ReactNode;
  className?: string;
  /** 子要素を順番に遅延表示（見出し＋段落向け） */
  stagger?: boolean;
  as?: "div" | "section" | "article" | "nav";
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}>;

export function ScrollReveal({
  children,
  className = "",
  stagger = false,
  as: Tag = "div",
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={`scroll-reveal${visible ? " scroll-reveal--visible" : ""}${stagger ? " scroll-reveal--stagger" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </Tag>
  );
}
