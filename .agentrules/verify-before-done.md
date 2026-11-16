# Verify before you say done

Do not call work complete from reading your own code. Before handing off:

1. Install dependencies cleanly; fix hallucinated or deprecated packages.
2. Run the project's type check and linter; fix real errors, do not suppress them.
3. Run the production build if there is one.
4. Run the tests. If new core logic has none, add a minimal test for the happy path and an edge case.
5. For anything hard or previously failing, prove it with a real external check (a real request to a
   running server, a real command's output, a file that really exists), not a log line you wrote.

Up to 3 repair attempts per failing step. If it still fails, stop and report the exact command, its
real output, the likely cause, and what you need from the owner. In the final message say what you
ran and what you did not.
