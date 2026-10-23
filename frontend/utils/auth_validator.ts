/**
 * auth_validator.ts
 *
 * Validation engine for Soroban authorization hierarchy trees.
 *
 * Checks:
 *  1. Every AddressNode has a valid Stellar public key (G… or C…, 56 chars).
 *  2. Every ContractNode has a non-empty contractId (C…, 56 chars).
 *  3. Every ContractNode has a non-empty functionName.
 *  4. Args have non-empty names.
 *  5. i128/u128/amount arg values are valid integers.
 *  6. address-type args contain a valid Stellar address.
 *  7. The tree has at least one root node.
 *  8. No duplicate node IDs across the tree.
 *
 * Warnings:
 *  - AddressNode with no children (no contracts to authorise).
 *  - ContractNode with a known high-risk function name (e.g. "transfer_all").
 *  - Tree depth > 10 (very deep hierarchies are unusual; might be a bug).
 */

import type {
  AddressNode,
  AuthTree,
  ContractNode,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from "../builder/auth_tree/types";

// ── Stellar address regex ─────────────────────────────────────────────────────
// G…: ed25519 account key (starts with G, 56 chars, base32)
// C…: contract address (starts with C, 56 chars, base32)
const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/;
const STELLAR_CONTRACT_RE = /^C[A-Z2-7]{55}$/;

const HIGH_RISK_FUNCTIONS = new Set([
  "transfer_all",
  "burn_all",
  "self_destruct",
  "set_admin",
  "upgrade",
]);

const MAX_RECOMMENDED_DEPTH = 10;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates the entire AuthTree and returns a ValidationResult.
 * This is a pure function — no side effects.
 */
export function validateAuthTree(tree: AuthTree): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const seenIds = new Set<string>();

  if (tree.roots.length === 0) {
    errors.push({
      nodeId: "root",
      field: "roots",
      message: "The tree must have at least one signer address.",
    });
  }

  for (const root of tree.roots) {
    validateAddressNode(root, errors, warnings, seenIds, 0);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Node validators ───────────────────────────────────────────────────────────

function validateAddressNode(
  node: AddressNode,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  seenIds: Set<string>,
  depth: number
): void {
  checkDuplicateId(node.id, seenIds, errors);

  // Address must be a valid Stellar account key
  if (!node.address || node.address.trim() === "") {
    errors.push({
      nodeId: node.id,
      field: "address",
      message: "Signer address is required.",
    });
  } else if (
    !STELLAR_ACCOUNT_RE.test(node.address.trim()) &&
    !STELLAR_CONTRACT_RE.test(node.address.trim())
  ) {
    errors.push({
      nodeId: node.id,
      field: "address",
      message: `"${node.address}" is not a valid Stellar address (must be G… or C…, 56 chars).`,
    });
  }

  if (node.children.length === 0) {
    warnings.push({
      nodeId: node.id,
      field: "children",
      message:
        "This signer has no contract invocations. Add at least one contract to build an auth payload.",
    });
  }

  for (const child of node.children) {
    validateContractNode(child, errors, warnings, seenIds, depth + 1);
  }
}

function validateContractNode(
  node: ContractNode,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  seenIds: Set<string>,
  depth: number
): void {
  checkDuplicateId(node.id, seenIds, errors);

  if (depth > MAX_RECOMMENDED_DEPTH) {
    warnings.push({
      nodeId: node.id,
      field: "depth",
      message: `Tree depth ${depth} exceeds the recommended maximum of ${MAX_RECOMMENDED_DEPTH}. Verify this is intentional.`,
    });
  }

  // Contract ID
  if (!node.contractId || node.contractId.trim() === "") {
    errors.push({
      nodeId: node.id,
      field: "contractId",
      message: `Contract "${node.label}": contractId is required.`,
    });
  } else if (!STELLAR_CONTRACT_RE.test(node.contractId.trim())) {
    errors.push({
      nodeId: node.id,
      field: "contractId",
      message: `Contract "${node.label}": "${node.contractId}" is not a valid contract address (must be C…, 56 chars).`,
    });
  }

  // Function name
  if (!node.functionName || node.functionName.trim() === "") {
    errors.push({
      nodeId: node.id,
      field: "functionName",
      message: `Contract "${node.label}": functionName is required.`,
    });
  } else if (HIGH_RISK_FUNCTIONS.has(node.functionName.trim().toLowerCase())) {
    warnings.push({
      nodeId: node.id,
      field: "functionName",
      message: `Function "${node.functionName}" is high-risk. Double-check the authorization scope.`,
    });
  }

  // Arguments
  for (let i = 0; i < node.args.length; i++) {
    const arg = node.args[i];

    if (!arg.name || arg.name.trim() === "") {
      errors.push({
        nodeId: node.id,
        field: `args[${i}].name`,
        message: `Contract "${node.label}": argument at index ${i} has no name.`,
      });
    }

    if (arg.type === "i128" || arg.type === "u128" || arg.type === "amount") {
      if (!isValidBigInt(String(arg.value))) {
        errors.push({
          nodeId: node.id,
          field: `args[${i}].value`,
          message: `Contract "${node.label}" arg "${arg.name}": value "${arg.value}" is not a valid integer.`,
        });
      }
      if (arg.type === "u128" && BigInt(String(arg.value) || "0") < 0n) {
        errors.push({
          nodeId: node.id,
          field: `args[${i}].value`,
          message: `Contract "${node.label}" arg "${arg.name}": u128 values must be non-negative.`,
        });
      }
    }

    if (arg.type === "address") {
      const v = String(arg.value).trim();
      if (v && !STELLAR_ACCOUNT_RE.test(v) && !STELLAR_CONTRACT_RE.test(v)) {
        errors.push({
          nodeId: node.id,
          field: `args[${i}].value`,
          message: `Contract "${node.label}" arg "${arg.name}": "${v}" is not a valid Stellar address.`,
        });
      }
    }
  }

  // Recurse
  for (const child of node.children) {
    validateContractNode(child, errors, warnings, seenIds, depth + 1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkDuplicateId(
  id: string,
  seenIds: Set<string>,
  errors: ValidationError[]
): void {
  if (seenIds.has(id)) {
    errors.push({
      nodeId: id,
      field: "id",
      message: `Duplicate node id "${id}" detected. Each node must have a unique ID.`,
    });
  }
  seenIds.add(id);
}

function isValidBigInt(value: string): boolean {
  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}
