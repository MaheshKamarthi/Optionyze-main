[OPEN] Debug Session: payoff-graph-syntax

- Symptom: Browser reports `SyntaxError: Unexpected token ')'`
- Suspected area: recent payoff graph JavaScript changes
- Status: collecting evidence

## Hypotheses

1. A template literal interpolation in `open-position-payoff-graph.js` has mismatched parentheses or braces.
2. A recent callback or inline function in the payoff graph wiring introduced an extra `)` in demo/live page JS.
3. A generated HTML string contains malformed nested template syntax that breaks script parsing before runtime execution.
4. A recent array-mapping block for multi-SL rendering closes with `)` where a template/backtick or brace should close instead.
5. The syntax error is in a different loaded frontend file, but the payoff graph edits changed the execution path that now loads it.

## Evidence Log

- `node --check public/js/open-position-payoff-graph.js` failed with `SyntaxError: Unexpected token ')'` at line 885.
- `node --check public/js/rolling-options-strangle.js` passed.
- `node --check public/js/rolling-options-strangle-live.js` passed.
- Exact offending block is the final `bindSlCheckpoint(container, { ... });` call followed by one extra stray `});`.

## Next Step

- Remove the extra closing `});`, rerun parser checks, and verify the browser script loads.
