# Phase 13 Fresha Import Guide

This guide documents the safe import path for the May 1-June 30, 2026 Fresha cutover window.

## Safety Rules

- Fresha must stay read-only during extraction.
- Raw extraction files may contain customer PII and must live under `output/fresha-import/`, which is gitignored.
- Run dry-run first and review `output/fresha-import/fresha-import-review.md` before any production write.
- Imported bookings use `source = "imported"` and do not trigger lifecycle confirmations or customer reminders.

## Extraction JSON

Save Playwright MCP extraction output to:

```bash
output/fresha-import/fresha-extraction.json
```

Shape:

```json
{
  "extractedAt": "2026-05-01T18:00:00.000Z",
  "window": { "from": "2026-05-01", "to": "2026-06-30" },
  "appointments": [
    {
      "externalId": "fresha-appointment-id",
      "status": "confirmed",
      "location": "Leaside Fades Eglinton",
      "barber": "Sam To",
      "customer": {
        "name": "Customer Name",
        "phone": "+16475550199",
        "email": "customer@example.com"
      },
      "startLocal": "2026-05-01T10:00",
      "endLocal": "2026-05-01T10:30",
      "services": [
        {
          "name": "Men's Cut",
          "category": "Hair & Styling (Men)",
          "durationMinutes": 30,
          "priceCents": 3000,
          "displayPrice": "$30"
        }
      ]
    }
  ],
  "schedules": [
    {
      "location": "Leaside Fades Eglinton",
      "barber": "Sam To",
      "dayOfWeek": 1,
      "startTime": "10:00",
      "endTime": "19:00",
      "effectiveFrom": "2026-05-01",
      "effectiveTo": "2026-06-30"
    }
  ]
}
```

## Commands

Dry-run and generate the human review report:

```bash
npm run fresha:import:dry-run -- --input output/fresha-import/fresha-extraction.json --report output/fresha-import/fresha-import-review.md
```

Apply only after the report is reviewed:

```bash
npm run fresha:import:apply -- --input output/fresha-import/fresha-extraction.json --approved-report output/fresha-import/fresha-import-review.md --confirm-reviewed-report=true
```
