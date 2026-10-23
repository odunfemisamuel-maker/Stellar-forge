# Soroban Auth Hierarchy Builder

> Resolves: [#228 \[Enhancement\] Smart Contract Auth Hierarchy Builder (Frontend)](https://github.com/agnesnaomiolim-cloud/Stellar-forge/issues/228)

A visual drag-and-drop builder for modelling, validating, and exporting Soroban `require_auth` authorization hierarchies.

---

## Overview

Soroban's `require_auth` framework creates nested authorization trees for complex DeFi calls. This builder lets developers:

1. **Model** the hierarchy visually — map signer addresses to root contracts and root contracts to sub-invocations.
2. **Validate** the tree in real time against Soroban's authorization rules.
3. **Export** the JSON payload required by `soroban-cli` to sign and execute multi-step transactions.

---

## Module layout

```
frontend/
├── builder/
│   └── auth_tree/
│       ├── types.ts               # TypeScript types for the entire domain
│       ├── AuthTreeBuilder.tsx    # Main canvas component (drag-drop, zoom, pan)
│       ├── AuthTreeNodeCard.tsx   # Draggable SVG card for each node
│       ├── AuthTreeEdge.tsx       # Curved SVG edges between nodes
│       ├── useAuthTreeLayout.ts   # Hook: derives flat node/edge lists + depth
│       ├── payloadBuilder.ts      # Converts AuthTree → soroban-cli JSON
│       ├── index.ts               # Public barrel export
│       └── __tests__/
│           ├── payloadBuilder.test.ts  # JSON output tests
│           └── auth_validator.test.ts  # Validation rule tests
└── utils/
    └── auth_validator.ts          # Standalone validation engine
```

---

## Usage

```tsx
import { AuthTreeBuilder } from "./builder/auth_tree";

export default function App() {
  return <AuthTreeBuilder />;
}
```

### Export payload programmatically

```ts
import { buildSorobanPayload } from "./builder/auth_tree";

const payload = buildSorobanPayload(myTree);
// Pass to soroban-cli via: soroban contract invoke --auth '<json>'
console.log(JSON.stringify(payload, null, 2));
```

### Validate a tree

```ts
import { validateAuthTree } from "./utils/auth_validator";

const result = validateAuthTree(myTree);
if (!result.valid) {
  result.errors.forEach(e => console.error(e.message));
}
```

---

## Canonical scenario: Alice → Router → Liquidity Pool

```
Alice (G…)
  └── Router (C…)  swap_exact_tokens_for_tokens(amount, path)
        └── Liquidity Pool (C…)  swap(amount_in, min_out)
```

Generated payload (soroban-cli format):

```json
[
  {
    "credentials": {
      "address": {
        "address": "GBVHSXIZT…",
        "nonce": 0,
        "signature_expiration_ledger": 0,
        "signature": ""
      }
    },
    "root_invocation": {
      "function": {
        "contract_call": {
          "contract_address": "CBTIVVKHK…",
          "function_name": "swap_exact_tokens_for_tokens",
          "args": [
            { "i128": { "lo": 1000000000, "hi": 0 } },
            { "address": "CDQBGAOVF…" }
          ]
        }
      },
      "sub_invocations": [
        {
          "function": {
            "contract_call": {
              "contract_address": "CDQBGAOVF…",
              "function_name": "swap",
              "args": [
                { "i128": { "lo": 1000000000, "hi": 0 } },
                { "i128": { "lo": 990000000,  "hi": 0 } }
              ]
            }
          },
          "sub_invocations": []
        }
      ]
    }
  }
]
```

---

## Running tests

```bash
cd frontend
npm install
npm test       # single run (vitest --run)
npm run test:watch  # watch mode
```

Requires Node.js ≥ 18.

---

## UI features

| Feature | Detail |
|---|---|
| Drag nodes | Mouse-down on any card header |
| Zoom | Mouse wheel |
| Pan canvas | Mouse-down on empty canvas area |
| Add signer | Toolbar "**+ Signer Address**" button |
| Add sub-call | "**+ sub-call**" button below each node |
| Remove node | ✕ button on card, or Delete/Backspace key |
| Validate | Toolbar "**Validate**" — opens side panel |
| Export JSON | Toolbar "**Export Payload**" — opens panel with Copy button |
| Keyboard | Esc deselects; Del/Backspace removes selected node |

---

## Validation rules

| Rule | Severity |
|---|---|
| Tree must have at least one root | Error |
| Signer address must be valid Stellar G… / C… key | Error |
| contractId must be valid C… key | Error |
| functionName must be non-empty | Error |
| Arg names must be non-empty | Error |
| i128/u128 values must be valid integers | Error |
| address-type args must be valid Stellar addresses | Error |
| Duplicate node IDs | Error |
| Signer with no children | Warning |
| High-risk function names (`set_admin`, `upgrade`, etc.) | Warning |
| Tree depth > 10 | Warning |
