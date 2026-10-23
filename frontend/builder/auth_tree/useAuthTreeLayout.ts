/**
 * useAuthTreeLayout
 *
 * Derives layout metadata from an AuthTree:
 *  - A flat list of all nodes (for rendering)
 *  - A flat list of all edges (for rendering)
 *  - A Map<id, node> for O(1) lookup
 *  - Maximum depth of the tree
 *
 * This hook is pure (no side effects) and recomputes on every tree change.
 */

import { useMemo } from "react";
import type { AddressNode, AuthTree, ContractNode } from "./types";
import type { Edge } from "./AuthTreeEdge";

export interface LayoutResult {
  allNodes: Array<AddressNode | ContractNode>;
  edges: Edge[];
  nodeMap: Map<string, AddressNode | ContractNode>;
  maxDepth: number;
}

export function useAuthTreeLayout(tree: AuthTree): LayoutResult {
  return useMemo(() => {
    const allNodes: Array<AddressNode | ContractNode> = [];
    const edges: Edge[] = [];
    const nodeMap = new Map<string, AddressNode | ContractNode>();
    let maxDepth = 0;

    function visitAddress(node: AddressNode, depth: number) {
      allNodes.push(node);
      nodeMap.set(node.id, node);
      maxDepth = Math.max(maxDepth, depth);

      for (const child of node.children) {
        edges.push({
          id: `${node.id}->${child.id}`,
          from: node.position,
          to: child.position,
          fromKind: "address",
        });
        visitContract(child, depth + 1);
      }
    }

    function visitContract(node: ContractNode, depth: number) {
      allNodes.push(node);
      nodeMap.set(node.id, node);
      maxDepth = Math.max(maxDepth, depth);

      for (const child of node.children) {
        edges.push({
          id: `${node.id}->${child.id}`,
          from: node.position,
          to: child.position,
          fromKind: "contract",
        });
        visitContract(child, depth + 1);
      }
    }

    for (const root of tree.roots) {
      visitAddress(root, 0);
    }

    return { allNodes, edges, nodeMap, maxDepth };
  }, [tree]);
}
