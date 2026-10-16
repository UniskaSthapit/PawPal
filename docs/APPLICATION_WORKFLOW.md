# Application Status Workflow (FR-09)

Author: Pemba Sange Sherpa

Every adoption application moves through these stages. The list is defined once in `src/constants.js` (`APP_STATUSES`) and used by the server, the staff portal and the adopter timeline.

| # | Status | What it means for the adopter | Needs a date? | Pet on hold? |
| --- | --- | --- | --- | --- |
| 1 | Submitted | Your application has reached the shelter team. | No | No |
| 2 | Under Review | A member of the shelter team is reading your application. | No | No |
| 3 | Info Requested | The shelter needs a little more information from you before continuing. | No | No |
| 4 | Interview | A short phone or video chat so the team can get to know you. | Yes | No |
| 5 | Meet & Greet | Come and meet your potential new companion in person. | Yes | Yes |
| 6 | Approved | Your application has been approved, the team will arrange the adoption with you. | No | Yes |
| 7 | Adoption Scheduled | Your go-home day is booked. | Yes | Yes |
| 8 | Adopted | Adoption complete. Welcome home! | No | No |
| 9 | Declined | The shelter could not proceed with this application. | No | No |
| 10 | Withdrawn | You withdrew this application. | No | No |

## Rules

- Only shelter staff can change a status (`PATCH /api/applications/:id/status`, protected by `requireStaff`); adopters can only withdraw.
- **Interview, Meet & Greet, Adoption Scheduled** must have a date and time.
- **Adopted, Declined, Withdrawn** are final: a closed application cannot change again.
- Every change is added to the application's `history`, and the adopter gets an in-app notification and an email.
- Marking an application **Adopted** closes every other open application for the same pet as Declined.
- Older records using the original six statuses are converted automatically by `src/services/migrate.js`.

The tests in `tests/workflow.test.js` check that these lists stay consistent.
