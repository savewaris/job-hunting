# Plan first

For non-trivial work (a new feature, behavior changes across more than one file, architecture or
dependency choices, anything destructive or outward-facing), plan before the first edit. Quick
questions, lookups and one-line fixes are exempt.

1. A fuzzy idea or new feature: write down what it is for and what success looks like, with the owner.
2. Open decisions or ambiguous requirements: ask the owner, one question at a time, with a
   recommendation (see `ask-one-question-at-a-time.md`).
3. Present a short plan (goal, approach, files touched, what is deliberately skipped) and wait for
   approval before building.

Keep it minimal: ask whether the change is needed at all, reuse existing code and tools first, use
platform features next, and only then write new code. Never cut validation, error handling, security
or accessibility to save effort. End by saying what was skipped or not checked.
