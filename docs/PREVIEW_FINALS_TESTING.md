# Preview Finals scenario testing

The Finals admin page provides deterministic staging controls when the deployed app has
`NEXT_PUBLIC_APP_ENV=preview`. The staging API rejects every request in Production before
authentication or database writes are attempted.

## Before testing

1. Open the Preview deployment and sign in as an admin.
2. Open **Finals** from the dashboard.
3. Confirm the **Preview Finals Scenarios** panel is visible. It is intentionally absent in Production.

## Stage a week

Choose **Stage Week 1**, **Stage Week 2**, **Stage Week 3**, or **Stage Week 4**, then accept the confirmation.

Each action clears Preview-only Finals results, AFL Finals-round player stats/finalisation rows,
Finals submissions, and submission locks. It then sets matching Round Control values:

| Scenario | Super 8 round | AFL round | Deterministic prerequisite results |
| --- | ---: | ---: | --- |
| Week 1 | 15 | 21 | None |
| Week 2 | 16 | 22 | QF, EF |
| Week 3 | 17 | 23 | QF, EF, SF1, SF2 |
| Week 4 | 18 | 24 | QF, EF, SF1, SF2, PF |

The prerequisite home scores are `101` through `105`; away scores are `91` through `95`.
This always produces the same bracket path and never creates a draw.

## Verification checklist

1. Verify the selected week is highlighted and Round Control reports that same week.
2. Verify only the selected week's matchup cards are unresolved; prerequisite matchups show fixed scores.
3. Submit the participating coaches' teams for the selected Super 8 round.
4. Import AFL player stats for the selected AFL round and verify live totals appear.
5. Use **Complete Current Finals Week** and verify the bracket and Round Control advance once.
6. Stage the same week again and verify the bracket returns to the identical prerequisite state.
7. Open Production and verify there is no scenario panel and no Production data changed.

## Local validation

Run:

```powershell
npm run check:preview
```

The command checks text encoding, runs the deterministic Finals tests, type-checks, and creates a production build.
