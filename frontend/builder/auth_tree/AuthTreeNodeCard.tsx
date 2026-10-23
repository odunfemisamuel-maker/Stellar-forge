/**
 * AuthTreeNodeCard
 *
 * A draggable SVG foreignObject card representing either an AddressNode
 * (Stellar signer) or a ContractNode (Soroban contract invocation).
 *
 * Supports inline editing of key fields and exposes callbacks for
 * add-child, remove, and drag-to-reposition operations.
 */

import React, { useCallback, useRef, useState } from "react";
import type { AddressNode, AuthArg, AuthArgType, ContractNode } from "./types";

export type AuthNodeCardProps = {
  node: AddressNode | ContractNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<AddressNode | ContractNode>) => void;
  onMove: (id: string, position: { x: number; y: number }) => void;
};

const CARD_WIDTH = 220;
const ADDRESS_CARD_HEIGHT = 90;
const CONTRACT_CARD_MIN_HEIGHT = 140;

export function AuthTreeNodeCard({
  node,
  isSelected,
  onSelect,
  onAddChild,
  onRemove,
  onUpdate,
  onMove,
}: AuthNodeCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; nx: number; ny: number } | null>(
    null
  );

  const isAddress = node.kind === "address";
  const cardHeight =
    isAddress
      ? ADDRESS_CARD_HEIGHT
      : CONTRACT_CARD_MIN_HEIGHT + (node as ContractNode).args.length * 22;

  // ── Drag handling ───────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      e.stopPropagation();
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        nx: node.position.x,
        ny: node.position.y,
      };

      const onMove = (mv: MouseEvent) => {
        if (!dragStart.current) return;
        onMove(node.id, {
          x: dragStart.current.nx + (mv.clientX - dragStart.current.mx),
          y: dragStart.current.ny + (mv.clientY - dragStart.current.my),
        });
      };
      const onUp = () => {
        dragStart.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [node.id, node.position, onMove]
  );

  // ── Colours ─────────────────────────────────────────────────────────────────

  const borderColor = isSelected ? "#a78bfa" : isAddress ? "#63b3ed" : "#68d391";
  const headerBg = isAddress ? "#1e3a5f" : "#1a3a1a";

  return (
    <g
      transform={`translate(${node.position.x}, ${node.position.y})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      role="treeitem"
      aria-selected={isSelected}
      aria-label={`${node.kind} node: ${node.kind === "address" ? (node as AddressNode).address || "untitled" : (node as ContractNode).label}`}
    >
      {/* Drop shadow */}
      <rect
        x={3}
        y={3}
        width={CARD_WIDTH}
        height={cardHeight}
        rx={8}
        fill="rgba(0,0,0,0.4)"
      />

      {/* Card background — also the drag handle */}
      <rect
        x={0}
        y={0}
        width={CARD_WIDTH}
        height={cardHeight}
        rx={8}
        fill="#1a1d2e"
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
        style={{ cursor: "grab" }}
        onMouseDown={handleDragStart}
      />

      {/* Header strip */}
      <rect x={0} y={0} width={CARD_WIDTH} height={32} rx={8} fill={headerBg} />
      <rect x={0} y={24} width={CARD_WIDTH} height={8} fill={headerBg} />

      {/* Kind icon + label */}
      <text x={10} y={20} fill={borderColor} fontSize={11} fontWeight={700}>
        {isAddress ? "👤 Signer" : "📜 Contract"}
      </text>

      {/* Remove button */}
      <text
        x={CARD_WIDTH - 14}
        y={20}
        fill="#fc8181"
        fontSize={13}
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(node.id);
        }}
        aria-label="Remove node"
        role="button"
      >
        ✕
      </text>

      {/* ── Address node body ── */}
      {isAddress && (
        <AddressNodeBody
          node={node as AddressNode}
          onUpdate={onUpdate}
          editing={editing}
          setEditing={setEditing}
        />
      )}

      {/* ── Contract node body ── */}
      {!isAddress && (
        <ContractNodeBody
          node={node as ContractNode}
          onUpdate={onUpdate}
          editing={editing}
          setEditing={setEditing}
        />
      )}

      {/* Add child button */}
      <g
        transform={`translate(${CARD_WIDTH / 2 - 40}, ${cardHeight + 4})`}
        onClick={(e) => {
          e.stopPropagation();
          onAddChild(node.id);
        }}
        role="button"
        aria-label="Add sub-invocation"
        style={{ cursor: "pointer" }}
      >
        <rect width={80} height={20} rx={4} fill="#2d3748" stroke="#4a5568" />
        <text x={40} y={14} fill="#a0aec0" fontSize={11} textAnchor="middle">
          + sub-call
        </text>
      </g>
    </g>
  );
}

// ── Address node body ──────────────────────────────────────────────────────────

function AddressNodeBody({
  node,
  onUpdate,
  editing,
  setEditing,
}: {
  node: AddressNode;
  onUpdate: (id: string, patch: Partial<AddressNode>) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  return (
    <foreignObject x={8} y={36} width={CARD_WIDTH - 16} height={50}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
      >
        <label
          style={{ fontSize: 10, color: "#718096", fontFamily: "Inter, sans-serif" }}
        >
          Stellar Address (G…)
        </label>
        <input
          type="text"
          value={node.address}
          placeholder="G…"
          onChange={(e) => onUpdate(node.id, { address: e.target.value })}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          style={inputStyle}
          aria-label="Stellar address"
        />
      </div>
    </foreignObject>
  );
}

// ── Contract node body ────────────────────────────────────────────────────────

function ContractNodeBody({
  node,
  onUpdate,
  editing,
  setEditing,
}: {
  node: ContractNode;
  onUpdate: (id: string, patch: Partial<ContractNode>) => void;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const addArg = useCallback(() => {
    onUpdate(node.id, {
      args: [
        ...node.args,
        { name: `arg${node.args.length + 1}`, type: "string" as AuthArgType, value: "" },
      ],
    });
  }, [node.id, node.args, onUpdate]);

  const updateArg = useCallback(
    (index: number, patch: Partial<AuthArg>) => {
      const updated = node.args.map((a, i) => (i === index ? { ...a, ...patch } : a));
      onUpdate(node.id, { args: updated });
    },
    [node.id, node.args, onUpdate]
  );

  const removeArg = useCallback(
    (index: number) => {
      onUpdate(node.id, { args: node.args.filter((_, i) => i !== index) });
    },
    [node.id, node.args, onUpdate]
  );

  const argsHeight = node.args.length * 22 + (node.args.length > 0 ? 8 : 0);

  return (
    <foreignObject x={8} y={36} width={CARD_WIDTH - 16} height={CONTRACT_CARD_MIN_HEIGHT - 36 + argsHeight}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "Inter, sans-serif" }}
      >
        <label style={{ fontSize: 10, color: "#718096" }}>Label</label>
        <input
          type="text"
          value={node.label}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          style={inputStyle}
          aria-label="Contract label"
        />

        <label style={{ fontSize: 10, color: "#718096", marginTop: 2 }}>
          Contract ID (C…)
        </label>
        <input
          type="text"
          value={node.contractId}
          placeholder="C…"
          onChange={(e) => onUpdate(node.id, { contractId: e.target.value })}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          style={inputStyle}
          aria-label="Contract ID"
        />

        <label style={{ fontSize: 10, color: "#718096", marginTop: 2 }}>
          Function
        </label>
        <input
          type="text"
          value={node.functionName}
          onChange={(e) => onUpdate(node.id, { functionName: e.target.value })}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          style={inputStyle}
          aria-label="Function name"
        />

        {/* Args */}
        {node.args.map((arg, i) => (
          <div key={i} style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
            <input
              type="text"
              value={arg.name}
              onChange={(e) => updateArg(i, { name: e.target.value })}
              placeholder="name"
              style={{ ...inputStyle, width: 60, flex: "none" }}
              aria-label={`Argument ${i + 1} name`}
            />
            <select
              value={arg.type}
              onChange={(e) => updateArg(i, { type: e.target.value as AuthArgType })}
              style={{ ...inputStyle, padding: "1px 2px", flex: "none", width: 64 }}
              aria-label={`Argument ${i + 1} type`}
            >
              {["address", "amount", "string", "bool", "i128", "u128", "bytes"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="text"
              value={String(arg.value)}
              onChange={(e) => updateArg(i, { value: e.target.value })}
              placeholder="value"
              style={{ ...inputStyle, flex: 1 }}
              aria-label={`Argument ${i + 1} value`}
            />
            <span
              onClick={() => removeArg(i)}
              style={{ color: "#fc8181", cursor: "pointer", fontSize: 12, flex: "none" }}
              role="button"
              aria-label={`Remove argument ${i + 1}`}
            >
              ✕
            </span>
          </div>
        ))}

        <span
          onClick={addArg}
          style={{
            color: "#63b3ed",
            cursor: "pointer",
            fontSize: 11,
            marginTop: 4,
            display: "inline-block",
          }}
          role="button"
          aria-label="Add argument"
        >
          + arg
        </span>
      </div>
    </foreignObject>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "#0f1117",
  border: "1px solid #2d3748",
  color: "#e2e8f0",
  borderRadius: 3,
  padding: "2px 6px",
  fontSize: 11,
  fontFamily: "Inter, sans-serif",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};
