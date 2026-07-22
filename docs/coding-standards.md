# Coding Standards (for example code only)

These apply to code inside `topics/*/*/example/` and the playground apps. `topics/` notes themselves have no "coding standards" — they're freeform on purpose.

1. **Clarity beats cleverness.** An example that takes 30 seconds longer to run but 30 seconds less to understand wins every time.
2. **No premature abstraction.** If a pattern repeats across three examples, that's fine — see the shared-code note in `docs/folder-conventions.md`. Only extract a helper into `packages/config` if it's genuinely infrastructural (tsconfig, lint rules), never if it's part of the concept being taught.
3. **Comments explain *why*, not *what*.** The code already shows what. Reserve comments for the non-obvious decision or gotcha.
4. **Keep examples under ~150 lines.** If it's growing past that, the example is teaching more than one concept — split it or trim it.
5. **Shared tooling only:** TypeScript config and lint/format rules come from `packages/config`. Nothing else is shared by default.
