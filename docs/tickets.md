# Tickets & legal codes

`POST /tickets` stores ticket, links the person, writes person+ticket timeline, audit and a notification in **one transaction** (rolled back on failure). The amount defaults from the legal code's penalty. Void needs `tickets.void` plus a reason and is audited. Legal codes are database rows (`/legal-codes`) with active/effective/expiry dates — no law text is hard-coded.
