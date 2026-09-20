# Fix *212* package selection and false failure

## Goal
Make paid *212* orders select the exact carrier menu row by matching the customer-selected package name, submit every USSD step reliably, and avoid showing an in-progress interactive order as failed.

## Changes
- Strengthen package-name matching in `Ussd870Flow`:
  - normalize carrier price prefixes, punctuation, spacing, Somali wording, and number/unit tokens;
  - score complete menu rows and require the selected duration/package tokens to match;
  - avoid silently falling back to row `1` when a named package cannot be matched.
- Harden `UssdAccessibilityService`:
  - enter and verify the chosen menu number across all USSD windows;
  - wait for the input to settle, click the actual Send control across windows, and retry the same step safely when the button is temporarily unavailable;
  - mark a step complete only after Send succeeds.
- Harden `UssdDialerService` status handling:
  - keep *212* orders processing while the interactive flow is unfinished;
  - do not count `processing` as a failed delivery;
  - preserve the flow long enough to capture the final provider response instead of deactivating it prematurely.
- Add focused Kotlin unit tests for real menu text such as `$0.15=Internet aan xadidnayn, 3 Saac` and confirm 3/8/20-hour packages resolve to their correct row.

## Verification
- Run the Android unit tests and assemble checks already configured by the project.
- Confirm current database payloads contain the selected package label in the *212* menu suffix.
- Review the latest build diagnostics before completion.
