# Reports

Types: Incident, Patrol, Traffic, Arrest, Citation, Collision, Investigation, General. Status `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED → ARCHIVED`.
Each edit creates an immutable `ReportVersion` (version, author, change summary, content snapshot, SHA-256 content hash). Only drafts/rejected reports can be edited; authors cannot approve/reject their own report; rejection needs a reason. Drafts are visible only to the author and to holders of `reports.review`/`reports.approve`.
