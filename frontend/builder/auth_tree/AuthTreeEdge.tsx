/**
 * AuthTreeEdge
 *
 * Renders a curved SVG path between a parent node and a child node
 * on the authorization hierarchy canvas.
 */

import React from "react";

export interface Edge {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** "address" | "contract" — determines stroke color */
  fromKind: "address" | "contract";
}

interface AuthTreeEdgeProps {
  edge: Edge;
}

const CARD_WIDTH = 220;
const ADDRESS_CARD_HEIGHT = 90;
const CONTRACT_CARD_HEIGHT = 140;

export function AuthTreeEdge({ edge }: AuthTreeEdgeProps): JSX.Element {
  // Connect from bottom-center of parent to top-center of child
  const x1 = edge.from.x + CARD_WIDTH / 2;
  const y1 =
    edge.from.y +
    (edge.fromKind === "address" ? ADDRESS_CARD_HEIGHT : CONTRACT_CARD_HEIGHT) +
    24; // account for "add sub-call" button

  const x2 = edge.to.x + CARD_WIDTH / 2;
  const y2 = edge.to.y;

  // Cubic bezier with vertical control points for a smooth S-curve
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  const strokeColor =
    edge.fromKind === "address" ? "#63b3ed" : "#68d391";

  return (
    <path
      d={d}
      fill="none"
      stroke={strokeColor}
      strokeWidth={1.5}
      strokeOpacity={0.7}
      markerEnd="url(#arrowhead)"
    />
  );
}

/** Inject SVG defs (arrowhead marker) once at the canvas level. */
export function AuthTreeEdgeDefs(): JSX.Element {
  return (
    <defs>
      <marker
        id="arrowhead"
        markerWidth="8"
        markerHeight="6"
        refX="8"
        refY="3"
        orient="auto"
      >
        <polygon
          points="0 0, 8 3, 0 6"
          fill="#a0aec0"
          fillOpacity={0.7}
        />
      </marker>
    </defs>
  );
}
