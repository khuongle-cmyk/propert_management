"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { MONTH_SHORT } from "@/lib/budget/constants";
import { sumMonths, type MonthKey } from "@/lib/budget/aggregates";

type Props = {
  rowKeys: string[];
  rowLabels: Record<string, string>;
  values: Record<string, Record<MonthKey, number>>;
  onChange: (rowKey: string, month: number, value: number) => void;
  readOnlyRowKeys?: Set<string>;
  dense?: boolean;
};

function monthKey(m: number): MonthKey {
  return `m${m}` as MonthKey;
}

function parseMoney(raw: string): number {
  const s = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default function BudgetMonthGrid({
  rowKeys,
  rowLabels,
  values,
  onChange,
  readOnlyRowKeys,
  dense,
}: Props) {
  const [editing, setEditing] = useState<{ row: string; month: number } | null>(null);
  const [draft, setDraft] = useState("");

  const commit = useCallback(() => {
    if (!editing) return;
    const v = parseMoney(draft);
    onChange(editing.row, editing.month, v);
    setEditing(null);
  }, [draft, editing, onChange]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setEditing(null);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (!editing) return;
      commit();
      const idx = rowKeys.indexOf(editing.row);
      let nextRow = idx;
      let nextMonth = editing.month + (e.shiftKey ? -1 : 1);
      if (nextMonth > 12) {
        nextMonth = 1;
        nextRow = Math.min(rowKeys.length - 1, idx + 1);
      }
      if (nextMonth < 1) {
        nextMonth = 12;
        nextRow = Math.max(0, idx - 1);
      }
      const ro = readOnlyRowKeys?.has(rowKeys[nextRow] ?? "");
      if (!ro) {
        setEditing({ row: rowKeys[nextRow]!, month: nextMonth });
        const mk = monthKey(nextMonth);
        setDraft(String(values[rowKeys[nextRow]!]?.[mk] ?? 0));
      }
    }
  };

  const pad = dense ? 4 : 8;
  const fs = dense ? 12 : 13;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: fs }}>
        <thead>
          <tr style={{ background: "#f4f4f5" }}>
            <th style={{ textAlign: "left", padding: pad, minWidth: 160 }}>Category</th>
            {MONTH_SHORT.map((m) => (
              <th key={m} style={{ padding: pad, textAlign: "right", minWidth: 72 }}>
                {m}
              </th>
            ))}
            <th style={{ padding: pad, textAlign: "right", minWidth: 88 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk) => {
            const row = values[rk] ?? ({} as Record<MonthKey, number>);
            const total = sumMonths(
              Object.fromEntries(
                [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => [monthKey(m), row[monthKey(m)] ?? 0]),
              ) as Record<MonthKey, number>,
            );
            const ro = readOnlyRowKeys?.has(rk);
            return (
              <tr key={rk} style={{ borderBottom: "1px solid #e4e4e7" }}>
                <td style={{ padding: pad, fontWeight: ro ? 600 : 500 }}>{rowLabels[rk] ?? rk}</td>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                  const mk = monthKey(m);
                  const v = row[mk] ?? 0;
                  const isEd = editing?.row === rk && editing.month === m;
                  return (
                    <td key={m} style={{ padding: 2, textAlign: "right" }}>
                      {isEd ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commit}
                          onKeyDown={onKeyDown}
                          style={{
                            width: "100%",
                            textAlign: "right",
                            padding: "4px 6px",
                            border: "1px solid #3b82f6",
                            borderRadius: 4,
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={!!ro}
                          onClick={() => {
                            if (ro) return;
                            setEditing({ row: rk, month: m });
                            setDraft(String(v));
                          }}
                          style={{
                            width: "100%",
                            cursor: ro ? "default" : "pointer",
                            padding: "6px 8px",
                            textAlign: "right",
                            border: "1px solid transparent",
                            borderRadius: 4,
                            background: ro ? "#fafafa" : "white",
                            color: "#18181b",
                          }}
                        >
                          {v.toLocaleString("en-IE", { maximumFractionDigits: 0 })}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td style={{ padding: pad, textAlign: "right", fontWeight: 600 }}>{total.toLocaleString("en-IE", { maximumFractionDigits: 0 })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
