"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import {
  fitStudentResultPrint,
  resetStudentResultPrint,
  STUDENT_RESULT_PRINT_MAX_PAGES,
} from "@/lib/student-result-print-fit";

type Props = {
  children: ReactNode;
};

export function StudentResultPrintFit({ children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onBeforePrint = () => {
      fitStudentResultPrint(root, STUDENT_RESULT_PRINT_MAX_PAGES);
    };
    const onAfterPrint = () => {
      resetStudentResultPrint(root);
    };

    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    const mq = window.matchMedia("print");
    const onMqChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) onBeforePrint();
      else onAfterPrint();
    };
    mq.addEventListener("change", onMqChange);

    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      mq.removeEventListener("change", onMqChange);
      resetStudentResultPrint(root);
    };
  }, []);

  return (
    <div ref={rootRef} className="student-result-print-fit">
      {children}
    </div>
  );
}
