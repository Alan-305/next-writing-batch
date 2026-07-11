"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { GrammarCategoryStat } from "@/lib/ops/reports/build-report-weaknesses";
import { GRAMMAR_CATEGORY_DEFS, type GrammarCategoryId } from "@/lib/ops/reports/grammar-categories";

type Props = {
  categories: GrammarCategoryStat[];
  /** 選択中。空配列＝何も表示しない */
  selectedIds: GrammarCategoryId[];
  onChange: (ids: GrammarCategoryId[]) => void;
};

export function OpsReportCategoryFilter({ categories, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const availableIds = useMemo(() => {
    const withData = new Set(categories.map((c) => c.id));
    const ordered = GRAMMAR_CATEGORY_DEFS.map((d) => d.id).filter((id) => withData.has(id));
    for (const c of categories) {
      if (!ordered.includes(c.id)) ordered.push(c.id);
    }
    return ordered;
  }, [categories]);

  const countById = useMemo(() => {
    const m = new Map<GrammarCategoryId, GrammarCategoryStat>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const allSelected = availableIds.length > 0 && availableIds.every((id) => selectedIds.includes(id));
  const noneSelected = selectedIds.length === 0;

  const summaryLabel = useMemo(() => {
    if (noneSelected) return "カテゴリ未選択（0件表示）";
    if (allSelected) return `すべて（${availableIds.length}種）`;
    if (selectedIds.length === 1) {
      const id = selectedIds[0]!;
      const label = GRAMMAR_CATEGORY_DEFS.find((d) => d.id === id)?.label ?? id;
      const n = countById.get(id)?.itemCount ?? 0;
      return `${label}（${n}件）`;
    }
    return `${selectedIds.length}種を選択中`;
  }, [allSelected, availableIds.length, countById, noneSelected, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: GrammarCategoryId) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const selectAll = () => onChange([...availableIds]);
  const clearAll = () => onChange([]);

  return (
    <div className="ops-report-cat-filter" ref={rootRef}>
      <span className="ops-report-cat-filter-label" id={`${listId}-label`}>
        表示する文法・語法の種類
      </span>
      <button
        type="button"
        className="ops-report-cat-filter-trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ops-report-cat-filter-summary">{summaryLabel}</span>
        <span className="ops-report-cat-filter-chevron" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="ops-report-cat-filter-panel" id={listId} role="group" aria-label="文法カテゴリの選択">
          <div className="ops-report-cat-filter-toolbar">
            <button type="button" className="ops-report-cat-filter-mini" onClick={selectAll}>
              全選択
            </button>
            <button type="button" className="ops-report-cat-filter-mini" onClick={clearAll}>
              全解除
            </button>
          </div>
          <ul className="ops-report-cat-filter-list">
            {availableIds.map((id) => {
              const def = GRAMMAR_CATEGORY_DEFS.find((d) => d.id === id);
              const stat = countById.get(id);
              const checked = selectedIds.includes(id);
              return (
                <li key={id}>
                  <label className="ops-report-cat-filter-option">
                    <input type="checkbox" checked={checked} onChange={() => toggle(id)} />
                    <span className="ops-report-cat-filter-option-text">
                      <span className="ops-report-cat-filter-option-name">{def?.label ?? id}</span>
                      <span className="ops-report-cat-filter-option-count">
                        {stat?.itemCount ?? 0}表現 / {stat?.bulletCount ?? 0}行
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {availableIds.length === 0 ? (
            <p className="muted ops-report-cat-filter-empty">この条件では分類できる行がありません。</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
