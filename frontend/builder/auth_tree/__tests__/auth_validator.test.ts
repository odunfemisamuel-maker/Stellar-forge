/**
 * auth_validator.test.ts
 *
 * Unit tests for the Soroban auth tree validation engine.
 * Covers all validation rules and the Alice → Router → Pool canonical scenario.
 */

import { describe, expect, it } from "vitest";
import { validateAuthTree } from "../../../utils/auth_validator";
import type { AddressNode, AuthTree, ContractNode } from "../types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ALICE = "GBVHSXIZTFJMMPBKUIQHQHZMQNGLZNJLP3MBMKQNRXVBX6YJFKM2JJH";
const ROUTER = "CBTIVVKHKDBKQKBNNVBYJXIPYUCOBBTJPF5OFJXTHH6DJJZ3JKFTD5IN";
const POOL = "CDQBGAOVFGMZPGCBUXF3YWLJ3B4GLXZOFAXPVIQNRH7DCVWTQGIBM3S2";

function makePoolNode(overrides: Partial<ContractNode> = {}): ContractNode {
  return {
    kind: "contract",
    id: "node-pool",
    contractId: POOL,
    label: "Liquidity Pool",
    functionName: "swap",
    args: [],
    children: [],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeRouterNode(overrides: Partial<ContractNode> = {}): ContractNode {
  return {
    kind: "contract",
    id: "node-router",
    contractId: ROUTER,
    label: "Router",
    functionName: "swap_exact_tokens_for_tokens",
    args: [],
    children: [makePoolNode()],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeAliceNode(overrides: Partial<AddressNode> = {}): AddressNode {
  return {
    kind: "address",
    id: "node-alice",
    address: ALICE,
    children: [makeRouterNode()],
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeValidTree(): AuthTree {
  return { version: "1", roots: [makeAliceNode()] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validateAuthTree", () => {
  describe("empty / missing tree", () => {
    it("errors when the tree has no roots", () => {
      const result = validateAuthTree({ version: "1", roots: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "roots")).toBe(true);
    });
  });

  describe("Alice → Router → Liquidity Pool (canonical scenario)", () => {
    it("returns valid for a well-formed tree", () => {
      const result = validateAuthTree(makeValidTree());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("has no validation errors", () => {
      const { errors } = validateAuthTree(makeValidTree());
      expect(errors).toEqual([]);
    });
  });

  describe("AddressNode validation", () => {
    it("errors when address is empty", () => {
      const tree: AuthTree = {
        version: "1",
        roots: [makeAliceNode({ address: "" })],
      };
      const { errors } = validateAuthTree(tree);
      expect(errors.some((e) => e.nodeId === "node-alice" && e.field === "address")).toBe(true);
    });

    it("errors when address is not a valid Stellar key", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [makeAliceNode({ address: "not-a-key" })],
      });
      expect(errors.some((e) => e.field === "address")).toBe(true);
    });

    it("accepts G… account addresses", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [makeAliceNode({ address: ALICE })],
      });
      expect(errors.filter((e) => e.field === "address")).toHaveLength(0);
    });

    it("accepts C… contract addresses as signers (multisig contracts)", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [makeAliceNode({ address: ROUTER })],
      });
      expect(errors.filter((e) => e.field === "address")).toHaveLength(0);
    });

    it("warns when signer has no children", () => {
      const { warnings } = validateAuthTree({
        version: "1",
        roots: [makeAliceNode({ children: [] })],
      });
      expect(warnings.some((w) => w.field === "children")).toBe(true);
    });
  });

  describe("ContractNode validation", () => {
    it("errors when contractId is empty", () => {
      const tree: AuthTree = {
        version: "1",
        roots: [
          makeAliceNode({
            children: [makeRouterNode({ contractId: "" })],
          }),
        ],
      };
      const { errors } = validateAuthTree(tree);
      expect(errors.some((e) => e.field === "contractId")).toBe(true);
    });

    it("errors when contractId is not a valid C… address", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [makeRouterNode({ contractId: "BADCONTRACT" })],
          }),
        ],
      });
      expect(errors.some((e) => e.field === "contractId")).toBe(true);
    });

    it("errors when functionName is empty", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [makeRouterNode({ functionName: "" })],
          }),
        ],
      });
      expect(errors.some((e) => e.field === "functionName")).toBe(true);
    });

    it("warns for high-risk function names", () => {
      const { warnings } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [makeRouterNode({ functionName: "set_admin" })],
          }),
        ],
      });
      expect(warnings.some((w) => w.field === "functionName")).toBe(true);
    });

    it("validates nested sub-invocations recursively", () => {
      const deep: ContractNode = makePoolNode({
        id: "node-deep",
        contractId: "",   // invalid
        functionName: "deposit",
      });
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [makeRouterNode({ children: [deep] })],
          }),
        ],
      });
      expect(errors.some((e) => e.nodeId === "node-deep" && e.field === "contractId")).toBe(true);
    });
  });

  describe("Argument validation", () => {
    it("errors when arg name is empty", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [
              makeRouterNode({
                args: [{ name: "", type: "string", value: "hello" }],
              }),
            ],
          }),
        ],
      });
      expect(errors.some((e) => e.field.includes("args[0].name"))).toBe(true);
    });

    it("errors when i128 arg value is not a valid integer", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [
              makeRouterNode({
                args: [{ name: "amount", type: "i128", value: "not-a-number" }],
              }),
            ],
          }),
        ],
      });
      expect(errors.some((e) => e.field.includes("args[0].value"))).toBe(true);
    });

    it("accepts valid i128 values", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [
              makeRouterNode({
                args: [{ name: "amount", type: "i128", value: "1000000000" }],
              }),
            ],
          }),
        ],
      });
      expect(errors.filter((e) => e.field.includes("args[0]"))).toHaveLength(0);
    });

    it("errors when address-type arg value is invalid", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [
              makeRouterNode({
                args: [{ name: "dest", type: "address", value: "BADADDR" }],
              }),
            ],
          }),
        ],
      });
      expect(errors.some((e) => e.field.includes("args[0].value"))).toBe(true);
    });

    it("accepts valid Stellar address in address-type arg", () => {
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [
              makeRouterNode({
                args: [{ name: "dest", type: "address", value: ALICE }],
              }),
            ],
          }),
        ],
      });
      expect(errors.filter((e) => e.field.includes("args[0]"))).toHaveLength(0);
    });
  });

  describe("Duplicate IDs", () => {
    it("errors when two nodes share the same ID", () => {
      const dupe: ContractNode = makePoolNode({ id: "node-router" }); // same id as router
      const { errors } = validateAuthTree({
        version: "1",
        roots: [
          makeAliceNode({
            children: [makeRouterNode({ children: [dupe] })],
          }),
        ],
      });
      expect(errors.some((e) => e.field === "id")).toBe(true);
    });
  });

  describe("ValidationResult shape", () => {
    it("valid flag is true only when errors array is empty", () => {
      const result = validateAuthTree(makeValidTree());
      expect(result.valid).toBe(result.errors.length === 0);
    });

    it("returns both errors and warnings arrays", () => {
      const result = validateAuthTree(makeValidTree());
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
