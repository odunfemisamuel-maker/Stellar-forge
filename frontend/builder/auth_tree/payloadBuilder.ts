/**
 * payloadBuilder
 *
 * Converts an AuthTree into the JSON structure consumed by soroban-cli
 * via its `--auth` flag (array of SorobanAuthEntry objects).
 *
 * Each root AddressNode becomes one SorobanAuthEntry.
 * ContractNode children are recursively converted to SorobanAuthInvocations.
 *
 * Usage:
 *   const payload = buildSorobanPayload(tree);
 *   // pass payload to `soroban contract invoke --auth <json>`
 */

import type {
  AddressNode,
  AuthArg,
  AuthTree,
  ContractNode,
  SorobanAuthEntry,
  SorobanAuthInvocation,
  SorobanScVal,
} from "./types";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns an array of SorobanAuthEntry objects ready for JSON serialisation
 * and use with soroban-cli.
 *
 * Roots with no children or an empty address are skipped but an empty array
 * is returned rather than throwing, so the UI can still render the payload
 * panel even when the tree is incomplete.
 */
export function buildSorobanPayload(tree: AuthTree): SorobanAuthEntry[] {
  return tree.roots
    .filter((root) => root.address.trim() !== "" && root.children.length > 0)
    .map((root) => buildAuthEntry(root));
}

// ── Builders ──────────────────────────────────────────────────────────────────

function buildAuthEntry(root: AddressNode): SorobanAuthEntry {
  // When there are multiple root children we wrap them under the first child's
  // root_invocation and fold the remaining ones into sub_invocations.
  // In practice Soroban has exactly one root invocation per auth entry;
  // if the user builds multiple top-level contracts under one signer they
  // should add additional signer root nodes.
  const [firstChild, ...rest] = root.children;

  const rootInvocation = buildInvocation(firstChild);
  // Append sibling chains as additional sub_invocations on the root
  rootInvocation.sub_invocations.push(...rest.map(buildInvocation));

  return {
    credentials: {
      address: {
        address: root.address,
        // Nonce and expiration are placeholders — the CLI fills them in at
        // simulation/signing time.
        nonce: 0,
        signature_expiration_ledger: 0,
        signature: "",
      },
    },
    root_invocation: rootInvocation,
  };
}

function buildInvocation(node: ContractNode): SorobanAuthInvocation {
  return {
    function: {
      contract_call: {
        contract_address: node.contractId,
        function_name: node.functionName,
        args: node.args.map(encodeArg),
      },
    },
    sub_invocations: node.children.map(buildInvocation),
  };
}

// ── ScVal encoding ────────────────────────────────────────────────────────────

function encodeArg(arg: AuthArg): SorobanScVal {
  const raw = String(arg.value);

  switch (arg.type) {
    case "address":
      return { address: raw };

    case "amount":
    case "i128": {
      const n = BigInt(raw || "0");
      // Represent as hi/lo u64 pair (soroban-cli JSON format)
      const lo = Number(BigInt.asUintN(64, n));
      const hi = Number(BigInt.asIntN(128, n) >> BigInt(64));
      return { i128: { lo, hi } };
    }

    case "u128": {
      const n = BigInt(raw || "0");
      const lo = Number(BigInt.asUintN(64, n));
      const hi = Number(n >> BigInt(64));
      return { u128: { lo, hi } };
    }

    case "bool":
      return { bool: raw === "true" || raw === "1" };

    case "bytes":
      return { bytes: raw };

    case "string":
    default:
      return { string: raw };
  }
}
