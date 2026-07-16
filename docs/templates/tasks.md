---
adoParent: 
---

# <Feature title>

<!--
This is the canonical tasks.md template. A brainstorm fills it in; the
"Sync to ADO" button reads it and creates/updates child work items under
the parent above.

Rules the parser enforces (see
docs/superpowers/specs/2026-07-16-ado-tasks-md-template-parser-design.md):

- `adoParent` (frontmatter): the parent work item id all children hang under.
  May be left blank until the worktree is linked to a parent.
- The first `#` heading and any prose are context only — never synced.
- Each `- [ ] (Type) Title` line under "## Work items" is one work item.
  `(Type)` -> ADO work-item type (Task, Bug, User Story, ...).
- An indented `> ...` blockquote under an item -> its ADO description.
- A trailing `#<id>` means the item already exists in ADO: sync updates it
  instead of creating a duplicate, and appends the id itself after creating.
  Do not add `#<id>` by hand.
- The checkbox ([ ] / [x]) is a human "done" marker; it does not drive sync.
-->

One-paragraph summary of the feature (context for humans; not pushed to ADO).

## Work items

- [ ] (Task) First task title
  > Optional description that becomes the ADO work item's Description field.
- [ ] (Task) Second task title
- [ ] (Bug) A bug to fix
