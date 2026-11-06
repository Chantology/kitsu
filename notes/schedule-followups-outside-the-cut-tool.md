# Schedule follow-ups that are not about cut bars

Things found while building the cut tool that turned out to belong to the
schedule in general, not to cut bars. Kept out of this branch on purpose: the
cut tool already carries enough UI/UX cases, and mixing in changes that affect
every schedule would make it harder to review and harder to test.

This file is branch-local, like `SCHEDULE-CUT-TESTING.md`. It is a list for the
next pass over the schedule, not part of what is being proposed.

---

## 1. A row trimmed by its parent keeps its old estimate

**Where** `src/components/schedule/Schedule.vue`

`updateItemEstimation` runs only on the bar being dragged — it is called from
`changeStartDate` and `changeEndDate` on `currentElement`. `propagateClipToChildren`
rewrites the dates of every row it trims and never calls it.

So in linked-estimation mode: resize a row yourself and its estimate follows;
have the same row trimmed by a shift drag of its department bar and the bar
gets shorter while the estimate stays what it was. The row then claims more
work than its bar has room for, and nothing says so.

**Who it affects** every page that passes `is-estimation-linked`: Team Schedule,
Shot, Asset, Episode, Person, Sequence, Task Type, Edit — plus the production
schedule on upstream `main`.

**Why it is not fixed here** this branch drops `is-estimation-linked` from the
production schedule, which is the flexible-timelines feature: a bar's length is
deliberately independent of its estimate. There is nothing to reconcile on this
branch, and on the other pages the fix is upstream's to make.

**Repro** on upstream `main`, production schedule: give a sequence row an
estimate, shift-drag its department bar so the row is trimmed, confirm, then
compare the row's man-days against its new span.

**Options** call `updateItemEstimation` on each trimmed row, or state in the
confirmation that the estimates are left alone. Worth reporting to CGWire with
the repro above rather than patching from here.

## 2. A forecast can be moved past work that has already started

**Where** `src/components/pages/ProductionSchedule.vue`

A task carries `start_date` (forecast) next to `real_start_date` and
`done_date`. The schedule only ever edits the forecast, and Real view mode is
read-only (`isLockedSchedule` is true there), so planning can never rewrite
what actually happened — that part is sound.

What is missing is any signal when the two start to contradict each other.
Drag a task that an artist began last Monday so it now starts next Monday and
nothing objects, on any schedule page, cut or not.

**Options**

1. Leave it. A plan is a plan; Real mode shows the truth. Today's behaviour.
2. Warn: when a drag moves the forecast start of a task that already has a
   `real_start_date` past that date, say so and ask to confirm. Non-blocking,
   and it makes the contradiction visible as it is created.
3. Anchor: refuse to move a started task's start beyond its real start.

Option 2 reads as the useful one — it helps well beyond cut bars and still lets
a producer replan deliberately. A product call for CGWire, not something to
decide inside this feature.

## 3. The child-move confirmation counts rows, not consequences

**Where** `schedule.confirm_move_children` in `src/locales/en.js`

> Moving this bar also changes the dates of {count} sub-items. Continue?

Accurate but thin: it does not distinguish rows that merely moved from rows
that were trimmed and lost days of span. A trim is the one case where
confirming costs something that cannot be undone with a drag back, and the
wording gives no hint of it.

Small, cosmetic, and general to every schedule — worth folding into whichever
of the two items above gets picked up.
