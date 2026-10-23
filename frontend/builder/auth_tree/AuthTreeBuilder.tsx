/**
 * AuthTreeBuilder
 *
 * Drag-and-drop visual builder for Soroban authorization hierarchies.
 * Renders a zoomable/pannable canvas where developers can:
 *   1. Add Stellar signer addresses as root nodes.
 *   2. Attach contract invocation nodes as children.
 *   3. Nest sub-invocations to any depth.
 *   4. Export the resulting soroban-cli JSON auth payload.
 */

import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  AddressNode,
  AuthTree,
  AuthTreeNode,
  BuilderUIState,
  ContractNode,
} from "./types";
import { AuthTreeNodeCard } from "./AuthTreeNodeCard";
import { AuthTreeEdge } from "./AuthTreeEdge";
import { useAuthTreeLayout } from "./useAuthTreeLayout";
import { buildSorobanPayload } from "./payloadBuilder";
import { validateAuthTree } from "../../../frontend/utils/auth_validator";

// ── Reducer ───────────────────────────────────────────────────────────────────

type Action =
  | { type: "ADD_ROOT"; node: AddressNode }
  | { type: "ADD_CHILD"; parentId: string; node: ContractNode }
  | { type: "UPDATE_NODE"; id: string; patch: Partial<AddressNode | ContractNode> }
  | { type: "REMOVE_NODE"; id: string }
  | { type: "MOVE_NODE"; id: string; position: { x: number; y: number } }
  | { type: "LOAD_TREE"; tree: AuthTree };

function treeReducer(state: AuthTree, action: Action): AuthTree {
  switch (action.type) {
    case "ADD_ROOT":
      return { ...state, roots: [...state.roots, action.node] };

    case "ADD_CHILD":
      return { ...state, roots: addChildToTree(state.roots, action.parentId, action.node) };

    case "UPDATE_NODE":
      return { ...state, roots: updateNodeInTree(state.roots, action.id, action.patch) };

    case "REMOVE_NODE":
      return { ...state, roots: removeNodeFromTree(state.roots, action.id) };

    case "MOVE_NODE":
      return {
        ...state,
        roots: updateNodeInTree(state.roots, action.id, { position: action.position } as any),
      };

    case "LOAD_TREE":
      return action.tree;

    default:
      return state;
  }
}

// ── Tree mutation helpers ─────────────────────────────────────────────────────

function addChildToTree(
  roots: AddressNode[],
  parentId: string,
  child: ContractNode
): AddressNode[] {
  return roots.map((root) => ({
    ...root,
    children: addChildToContracts(root.children, parentId, child, root.id === parentId),
  }));
}

function addChildToContracts(
  nodes: ContractNode[],
  parentId: string,
  child: ContractNode,
  parentIsRoot: boolean
): ContractNode[] {
  if (parentIsRoot) return [...nodes, child];
  return nodes.map((n) =>
    n.id === parentId
      ? { ...n, children: [...n.children, child] }
      : { ...n, children: addChildToContracts(n.children, parentId, child, false) }
  );
}

function updateNodeInTree(
  roots: AddressNode[],
  id: string,
  patch: Partial<AddressNode | ContractNode>
): AddressNode[] {
  return roots.map((root) => {
    if (root.id === id) return { ...root, ...patch } as AddressNode;
    return { ...root, children: updateContractsInTree(root.children, id, patch) };
  });
}

function updateContractsInTree(
  nodes: ContractNode[],
  id: string,
  patch: Partial<ContractNode>
): ContractNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, ...patch }
      : { ...n, children: updateContractsInTree(n.children, id, patch) }
  );
}

function removeNodeFromTree(roots: AddressNode[], id: string): AddressNode[] {
  return roots
    .filter((r) => r.id !== id)
    .map((root) => ({ ...root, children: removeContractFromTree(root.children, id) }));
}

function removeContractFromTree(nodes: ContractNode[], id: string): ContractNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeContractFromTree(n.children, id) }));
}

// ── Main component ────────────────────────────────────────────────────────────

const INITIAL_TREE: AuthTree = { version: "1", roots: [] };

const INITIAL_UI: BuilderUIState = {
  selectedNodeId: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDragging: false,
  showPayloadPanel: false,
  showValidationPanel: false,
};

let _idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++_idCounter}`;
}

export function AuthTreeBuilder(): JSX.Element {
  const [tree, dispatch] = useReducer(treeReducer, INITIAL_TREE);
  const [ui, setUi] = useState<BuilderUIState>(INITIAL_UI);
  const canvasRef = useRef<SVGSVGElement>(null);

  const layout = useAuthTreeLayout(tree);
  const validation = validateAuthTree(tree);
  const payload = buildSorobanPayload(tree);

  // ── Zoom & pan via mouse/wheel ────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setUi((prev) => ({
      ...prev,
      zoom: Math.min(3, Math.max(0.2, prev.zoom * delta)),
    }));
  }, []);

  const startPan = useCallback((e: React.MouseEvent) => {
    if (e.target !== canvasRef.current) return;
    const startX = e.clientX - ui.pan.x;
    const startY = e.clientY - ui.pan.y;

    const onMove = (mv: MouseEvent) => {
      setUi((prev) => ({
        ...prev,
        pan: { x: mv.clientX - startX, y: mv.clientY - startY },
        isDragging: true,
      }));
    };
    const onUp = () => {
      setUi((prev) => ({ ...prev, isDragging: false }));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [ui.pan]);

  // ── Add nodes ─────────────────────────────────────────────────────────────

  const addRootAddress = useCallback(() => {
    const id = genId("addr");
    const node: AddressNode = {
      kind: "address",
      id,
      address: "",
      label: "New Signer",
      children: [],
      position: { x: 80 + tree.roots.length * 260, y: 60 },
    };
    dispatch({ type: "ADD_ROOT", node });
    setUi((prev) => ({ ...prev, selectedNodeId: id }));
  }, [tree.roots.length]);

  const addContractChild = useCallback(
    (parentId: string) => {
      const id = genId("contract");
      const parent = layout.nodeMap.get(parentId);
      const node: ContractNode = {
        kind: "contract",
        id,
        contractId: "",
        label: "New Contract",
        functionName: "invoke",
        args: [],
        children: [],
        position: parent
          ? { x: parent.position.x, y: parent.position.y + 160 }
          : { x: 80, y: 220 },
      };
      dispatch({ type: "ADD_CHILD", parentId, node });
      setUi((prev) => ({ ...prev, selectedNodeId: id }));
    },
    [layout.nodeMap]
  );

  const removeNode = useCallback((id: string) => {
    dispatch({ type: "REMOVE_NODE", id });
    setUi((prev) => ({
      ...prev,
      selectedNodeId: prev.selectedNodeId === id ? null : prev.selectedNodeId,
    }));
  }, []);

  const updateNode = useCallback(
    (id: string, patch: Partial<AddressNode | ContractNode>) => {
      dispatch({ type: "UPDATE_NODE", id, patch });
    },
    []
  );

  const moveNode = useCallback(
    (id: string, position: { x: number; y: number }) => {
      dispatch({ type: "MOVE_NODE", id, position });
    },
    []
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && ui.selectedNodeId) {
        removeNode(ui.selectedNodeId);
      }
      if (e.key === "Escape") {
        setUi((prev) => ({ ...prev, selectedNodeId: null }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ui.selectedNodeId, removeNode]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const transform = `translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.zoom})`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "Inter, sans-serif",
        background: "#0f1117",
        color: "#e2e8f0",
      }}
    >
      {/* ── Toolbar ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "#1a1d2e",
          borderBottom: "1px solid #2d3748",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15, color: "#a78bfa" }}>
          ⬡ Soroban Auth Hierarchy Builder
        </span>
        <div style={{ flex: 1 }} />
        <ToolbarButton onClick={addRootAddress} label="+ Signer Address" />
        <ToolbarButton
          onClick={() =>
            setUi((prev) => ({
              ...prev,
              showValidationPanel: !prev.showValidationPanel,
            }))
          }
          label={`Validate ${validation.errors.length > 0 ? `(${validation.errors.length} ✗)` : "✓"}`}
          color={validation.errors.length > 0 ? "#fc8181" : "#68d391"}
        />
        <ToolbarButton
          onClick={() =>
            setUi((prev) => ({
              ...prev,
              showPayloadPanel: !prev.showPayloadPanel,
            }))
          }
          label="Export Payload"
          color="#63b3ed"
        />
        <span style={{ fontSize: 12, color: "#718096" }}>
          Zoom: {Math.round(ui.zoom * 100)}%
        </span>
        <ToolbarButton
          onClick={() => setUi((prev) => ({ ...prev, zoom: 1, pan: { x: 0, y: 0 } }))}
          label="Reset View"
        />
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Canvas ── */}
        <svg
          ref={canvasRef}
          style={{
            flex: 1,
            cursor: ui.isDragging ? "grabbing" : "grab",
            background: "radial-gradient(circle at 1px 1px, #2d3748 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
          onWheel={handleWheel}
          onMouseDown={startPan}
          aria-label="Authorization hierarchy canvas"
          role="application"
        >
          <g style={{ transform, transformOrigin: "0 0" }}>
            {/* Render edges first (behind nodes) */}
            {layout.edges.map((edge) => (
              <AuthTreeEdge key={edge.id} edge={edge} />
            ))}

            {/* Render all nodes */}
            {layout.allNodes.map((node) => (
              <AuthTreeNodeCard
                key={node.id}
                node={node}
                isSelected={ui.selectedNodeId === node.id}
                onSelect={(id) =>
                  setUi((prev) => ({ ...prev, selectedNodeId: id }))
                }
                onAddChild={addContractChild}
                onRemove={removeNode}
                onUpdate={updateNode}
                onMove={moveNode}
              />
            ))}
          </g>
        </svg>

        {/* ── Side panels ── */}
        {ui.showValidationPanel && (
          <ValidationPanel
            validation={validation}
            onClose={() =>
              setUi((prev) => ({ ...prev, showValidationPanel: false }))
            }
          />
        )}
        {ui.showPayloadPanel && (
          <PayloadPanel
            payload={payload}
            onClose={() =>
              setUi((prev) => ({ ...prev, showPayloadPanel: false }))
            }
          />
        )}
      </div>

      {/* ── Status bar ── */}
      <footer
        style={{
          display: "flex",
          gap: 16,
          padding: "4px 16px",
          background: "#1a1d2e",
          borderTop: "1px solid #2d3748",
          fontSize: 12,
          color: "#718096",
          flexShrink: 0,
        }}
      >
        <span>Nodes: {layout.allNodes.length}</span>
        <span>Depth: {layout.maxDepth}</span>
        <span>
          Status:{" "}
          <span style={{ color: validation.valid ? "#68d391" : "#fc8181" }}>
            {validation.valid ? "Valid" : `${validation.errors.length} error(s)`}
          </span>
        </span>
        <span style={{ marginLeft: "auto" }}>
          Del/Backspace to remove selected · Scroll to zoom · Drag canvas to pan
        </span>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  label,
  color = "#a0aec0",
}: {
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: `1px solid ${color}`,
        color,
        borderRadius: 4,
        padding: "4px 10px",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "inherit",
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}

function ValidationPanel({
  validation,
  onClose,
}: {
  validation: ReturnType<typeof validateAuthTree>;
  onClose: () => void;
}) {
  return (
    <aside
      style={{
        width: 320,
        background: "#1a1d2e",
        borderLeft: "1px solid #2d3748",
        overflowY: "auto",
        padding: 16,
        flexShrink: 0,
      }}
      aria-label="Validation panel"
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <strong>Validation</strong>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#a0aec0", cursor: "pointer" }}
          aria-label="Close validation panel"
        >
          ✕
        </button>
      </div>

      {validation.valid ? (
        <div style={{ color: "#68d391" }}>✓ Tree is valid — ready to export.</div>
      ) : (
        validation.errors.map((err, i) => (
          <div
            key={i}
            style={{
              background: "#2d1818",
              border: "1px solid #fc8181",
              borderRadius: 4,
              padding: "8px 10px",
              marginBottom: 8,
              fontSize: 13,
            }}
          >
            <div style={{ color: "#fc8181", fontWeight: 600 }}>{err.field}</div>
            <div style={{ color: "#feb2b2", marginTop: 2 }}>{err.message}</div>
            <div style={{ color: "#718096", fontSize: 11, marginTop: 2 }}>
              Node: {err.nodeId}
            </div>
          </div>
        ))
      )}

      {validation.warnings.map((warn, i) => (
        <div
          key={i}
          style={{
            background: "#2d2618",
            border: "1px solid #f6ad55",
            borderRadius: 4,
            padding: "8px 10px",
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <div style={{ color: "#f6ad55", fontWeight: 600 }}>⚠ {warn.field}</div>
          <div style={{ color: "#fbd38d", marginTop: 2 }}>{warn.message}</div>
        </div>
      ))}
    </aside>
  );
}

function PayloadPanel({
  payload,
  onClose,
}: {
  payload: object;
  onClose: () => void;
}) {
  const json = JSON.stringify(payload, null, 2);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(json).catch(() => {});
  };

  return (
    <aside
      style={{
        width: 420,
        background: "#1a1d2e",
        borderLeft: "1px solid #2d3748",
        overflowY: "auto",
        padding: 16,
        flexShrink: 0,
      }}
      aria-label="JSON payload panel"
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <strong>soroban-cli Auth Payload</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={copyToClipboard}
            style={{
              background: "none",
              border: "1px solid #63b3ed",
              color: "#63b3ed",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: 12,
            }}
            aria-label="Copy payload to clipboard"
          >
            Copy
          </button>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#a0aec0", cursor: "pointer" }}
            aria-label="Close payload panel"
          >
            ✕
          </button>
        </div>
      </div>
      <pre
        style={{
          background: "#0f1117",
          borderRadius: 6,
          padding: 12,
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: "auto",
          color: "#a3e635",
          margin: 0,
        }}
      >
        {json}
      </pre>
    </aside>
  );
}
