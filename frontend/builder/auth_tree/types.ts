/**
 * Types for the Soroban Smart Contract Authorization Hierarchy Builder.
 *
 * Models Soroban's require_auth framework where an invocation tree represents
 * the chain of authorization: user addresses -> root contracts -> sub-contracts.
 *
 * Reference: https://soroban.stellar.org/docs/fundamentals-and-concepts/authorization
 */

// ── Node kinds ────────────────────────────────────────────────────────────────

/** A Stellar account (G… address) that signs the root of an auth tree. */
export interface AddressNode {
  kind: "address";
  id: string;
  /** G… or C… Stellar public key */
  address: string;
  label?: string;
  children: ContractNode[];
  /** UI position for the canvas */
  position: { x: number; y: number };
}

/** A Soroban smart contract that either invokes or requires auth. */
export interface ContractNode {
  kind: "contract";
  id: string;
  /** C… contract address */
  contractId: string;
  /** Human-readable alias, e.g. "Router" */
  label: string;
  /** Function being invoked on this contract */
  functionName: string;
  /** Serialisable function arguments (will appear in the auth payload) */
  args: AuthArg[];
  children: ContractNode[];
  position: { x: number; y: number };
}

export type AuthTreeNode = AddressNode | ContractNode;

// ── Arguments ─────────────────────────────────────────────────────────────────

export type AuthArgType =
  | "address"
  | "amount"
  | "string"
  | "bool"
  | "i128"
  | "u128"
  | "bytes";

export interface AuthArg {
  name: string;
  type: AuthArgType;
  value: string | number | boolean;
}

// ── Full tree document ────────────────────────────────────────────────────────

export interface AuthTree {
  /** Schema version for forward-compat migration */
  version: "1";
  roots: AddressNode[];
}

// ── Soroban JSON payload types ────────────────────────────────────────────────
// Matches the structure expected by soroban-cli --auth-json

export interface SorobanAuthInvocation {
  function: {
    contract_call: {
      contract_address: string;
      function_name: string;
      args: SorobanScVal[];
    };
  };
  sub_invocations: SorobanAuthInvocation[];
}

export interface SorobanAuthEntry {
  /** Stellar address that signs this entry */
  credentials: {
    address: {
      address: string;
      nonce: number;
      signature_expiration_ledger: number;
      signature: string;
    };
  };
  root_invocation: SorobanAuthInvocation;
}

// ── ScVal encoding ────────────────────────────────────────────────────────────

export type SorobanScVal =
  | { address: string }
  | { i128: { lo: number; hi: number } }
  | { u128: { lo: number; hi: number } }
  | { string: string }
  | { bool: boolean }
  | { bytes: string };

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  nodeId: string;
  field: string;
  message: string;
}

export interface ValidationWarning {
  nodeId: string;
  field: string;
  message: string;
}

// ── UI state ──────────────────────────────────────────────────────────────────

export interface BuilderUIState {
  selectedNodeId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  showPayloadPanel: boolean;
  showValidationPanel: boolean;
}
