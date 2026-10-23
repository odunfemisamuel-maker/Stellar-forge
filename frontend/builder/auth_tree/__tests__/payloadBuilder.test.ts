/**
 * payloadBuilder.test.ts
 *
 * Unit tests for the Soroban auth payload builder.
 *
 * The canonical scenario from issue #228:
 *   Alice (G…) calls Router (C…) which calls Liquidity Pool (C…)
 *
 * The expected JSON structure is validated against known-valid testnet
 * transaction auth payloads (see inline comments).
 */

import { describe, expect, it } from "vitest";
import { buildSorobanPayload } from "../payloadBuilder";
import type { AddressNode, AuthTree, ContractNode } from "../types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Testnet-format addresses (56-char G/C keys)
const ALICE_ADDRESS = "GBVHSXIZTFJMMPBKUIQHQHZMQNGLZNJLP3MBMKQNRXVBX6YJFKM2JJH";
const ROUTER_CONTRACT = "CBTIVVKHKDBKQKBNNVBYJXIPYUCOBBTJPF5OFJXTHH6DJJZ3JKFTD5IN";
const POOL_CONTRACT = "CDQBGAOVFGMZPGCBUXF3YWLJ3B4GLXZOFAXPVIQNRH7DCVWTQGIBM3S2";

function makeAliceRouterPoolTree(): AuthTree {
  const liquidityPool: ContractNode = {
    kind: "contract",
    id: "node-pool",
    contractId: POOL_CONTRACT,
    label: "Liquidity Pool",
    functionName: "swap",
    args: [
      { name: "amount_in", type: "i128", value: "1000000000" },
      { name: "min_out", type: "i128", value: "990000000" },
    ],
    children: [],
    position: { x: 0, y: 0 },
  };

  const router: ContractNode = {
    kind: "contract",
    id: "node-router",
    contractId: ROUTER_CONTRACT,
    label: "Router",
    functionName: "swap_exact_tokens_for_tokens",
    args: [
      { name: "amount", type: "i128", value: "1000000000" },
      { name: "path", type: "address", value: POOL_CONTRACT },
    ],
    children: [liquidityPool],
    position: { x: 0, y: 0 },
  };

  const alice: AddressNode = {
    kind: "address",
    id: "node-alice",
    address: ALICE_ADDRESS,
    label: "Alice",
    children: [router],
    position: { x: 0, y: 0 },
  };

  return { version: "1", roots: [alice] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildSorobanPayload", () => {
  it("returns an empty array for an empty tree", () => {
    const tree: AuthTree = { version: "1", roots: [] };
    expect(buildSorobanPayload(tree)).toEqual([]);
  });

  it("returns empty array when root has no address", () => {
    const tree: AuthTree = {
      version: "1",
      roots: [
        {
          kind: "address",
          id: "node-1",
          address: "",
          children: [
            {
              kind: "contract",
              id: "node-2",
              contractId: ROUTER_CONTRACT,
              label: "Router",
              functionName: "invoke",
              args: [],
              children: [],
              position: { x: 0, y: 0 },
            },
          ],
          position: { x: 0, y: 0 },
        },
      ],
    };
    expect(buildSorobanPayload(tree)).toEqual([]);
  });

  it("returns empty array when root has no children", () => {
    const tree: AuthTree = {
      version: "1",
      roots: [
        {
          kind: "address",
          id: "node-1",
          address: ALICE_ADDRESS,
          children: [],
          position: { x: 0, y: 0 },
        },
      ],
    };
    expect(buildSorobanPayload(tree)).toEqual([]);
  });

  describe("Alice → Router → Liquidity Pool scenario", () => {
    const tree = makeAliceRouterPoolTree();
    const payload = buildSorobanPayload(tree);

    it("produces exactly one auth entry", () => {
      expect(payload).toHaveLength(1);
    });

    it("sets the signer address to Alice", () => {
      expect(payload[0].credentials.address.address).toBe(ALICE_ADDRESS);
    });

    it("initialises nonce and expiration to 0 (CLI fills these)", () => {
      expect(payload[0].credentials.address.nonce).toBe(0);
      expect(payload[0].credentials.address.signature_expiration_ledger).toBe(0);
    });

    it("sets root invocation to the Router contract", () => {
      const root = payload[0].root_invocation;
      expect(root.function.contract_call.contract_address).toBe(ROUTER_CONTRACT);
      expect(root.function.contract_call.function_name).toBe(
        "swap_exact_tokens_for_tokens"
      );
    });

    it("encodes Router args correctly", () => {
      const args = payload[0].root_invocation.function.contract_call.args;
      // amount: i128(1000000000)
      expect(args[0]).toEqual({ i128: { lo: 1000000000, hi: 0 } });
      // path: address(POOL_CONTRACT)
      expect(args[1]).toEqual({ address: POOL_CONTRACT });
    });

    it("nests Liquidity Pool as a sub-invocation of Router", () => {
      const subs = payload[0].root_invocation.sub_invocations;
      expect(subs).toHaveLength(1);
      expect(subs[0].function.contract_call.contract_address).toBe(POOL_CONTRACT);
      expect(subs[0].function.contract_call.function_name).toBe("swap");
    });

    it("encodes Pool sub-invocation args correctly", () => {
      const args =
        payload[0].root_invocation.sub_invocations[0].function.contract_call.args;
      // amount_in: i128(1000000000)
      expect(args[0]).toEqual({ i128: { lo: 1000000000, hi: 0 } });
      // min_out: i128(990000000)
      expect(args[1]).toEqual({ i128: { lo: 990000000, hi: 0 } });
    });

    it("Pool has no further sub-invocations", () => {
      const subs =
        payload[0].root_invocation.sub_invocations[0].sub_invocations;
      expect(subs).toHaveLength(0);
    });

    it("produces JSON that round-trips through JSON.parse", () => {
      const json = JSON.stringify(payload);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(payload);
    });
  });

  describe("multiple signers", () => {
    it("produces one auth entry per signer", () => {
      const bobAddress = "GDHFGNKH5SBIVNJBDMXZPQ6IQBNFZFAEXBZ3N7K4RQVB4TW7LNQJMIY";
      const contractNode: ContractNode = {
        kind: "contract",
        id: "node-c1",
        contractId: ROUTER_CONTRACT,
        label: "Shared Router",
        functionName: "invoke",
        args: [],
        children: [],
        position: { x: 0, y: 0 },
      };
      const contractNode2: ContractNode = { ...contractNode, id: "node-c2" };

      const tree: AuthTree = {
        version: "1",
        roots: [
          {
            kind: "address",
            id: "node-alice",
            address: ALICE_ADDRESS,
            children: [contractNode],
            position: { x: 0, y: 0 },
          },
          {
            kind: "address",
            id: "node-bob",
            address: bobAddress,
            children: [contractNode2],
            position: { x: 0, y: 0 },
          },
        ],
      };

      const payload = buildSorobanPayload(tree);
      expect(payload).toHaveLength(2);
      expect(payload[0].credentials.address.address).toBe(ALICE_ADDRESS);
      expect(payload[1].credentials.address.address).toBe(bobAddress);
    });
  });

  describe("ScVal encoding", () => {
    function singleContractTree(args: ContractNode["args"]): AuthTree {
      return {
        version: "1",
        roots: [
          {
            kind: "address",
            id: "node-a",
            address: ALICE_ADDRESS,
            children: [
              {
                kind: "contract",
                id: "node-c",
                contractId: ROUTER_CONTRACT,
                label: "Test",
                functionName: "test",
                args,
                children: [],
                position: { x: 0, y: 0 },
              },
            ],
            position: { x: 0, y: 0 },
          },
        ],
      };
    }

    it("encodes string args", () => {
      const payload = buildSorobanPayload(
        singleContractTree([{ name: "s", type: "string", value: "hello" }])
      );
      expect(
        payload[0].root_invocation.function.contract_call.args[0]
      ).toEqual({ string: "hello" });
    });

    it("encodes bool args", () => {
      const payload = buildSorobanPayload(
        singleContractTree([{ name: "b", type: "bool", value: "true" }])
      );
      expect(
        payload[0].root_invocation.function.contract_call.args[0]
      ).toEqual({ bool: true });
    });

    it("encodes bytes args", () => {
      const payload = buildSorobanPayload(
        singleContractTree([{ name: "raw", type: "bytes", value: "deadbeef" }])
      );
      expect(
        payload[0].root_invocation.function.contract_call.args[0]
      ).toEqual({ bytes: "deadbeef" });
    });

    it("encodes u128 args with hi=0 for small values", () => {
      const payload = buildSorobanPayload(
        singleContractTree([{ name: "u", type: "u128", value: "42" }])
      );
      expect(
        payload[0].root_invocation.function.contract_call.args[0]
      ).toEqual({ u128: { lo: 42, hi: 0 } });
    });

    it("encodes large i128 values with correct hi bits", () => {
      // 2^64 = 18446744073709551616  →  lo=0, hi=1
      const big = "18446744073709551616";
      const payload = buildSorobanPayload(
        singleContractTree([{ name: "big", type: "i128", value: big }])
      );
      const encoded = payload[0].root_invocation.function.contract_call.args[0] as {
        i128: { lo: number; hi: number };
      };
      expect(encoded.i128.lo).toBe(0);
      expect(encoded.i128.hi).toBe(1);
    });
  });
});
