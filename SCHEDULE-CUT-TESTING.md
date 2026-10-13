# Testing guide — flexible schedule timelines + cut tool

This file exists only on testing branches and is **not** part of the changes
being proposed. It is here so a tester gets everything from one checkout.

Two features, built against two Canny proposals already agreed with the CGWire
lead dev:

1. [Flexible department timelines](https://cgwire.canny.io/schedule/p/allow-department-timelines-to-be-not-exact-the-available-task)
   — a schedule bar's length is no longer forced to equal its task estimation,
   and a department bar no longer snaps to its child tasks.
2. [Cut tool](https://cgwire.canny.io/schedule/p/add-a-cut-tool-to-split-tasks-and-create-breaks)
   — any bar can be cut into pieces, so interruptions (vacation, waiting on
   client feedback) show as real gaps, and each piece moves on its own.

## What to check out

| Repo | Branch |
|---|---|
| Kitsu | `schedule/cut-tool-testing` |
| Zou | `schedule/add-schedule-segments` |
| Gazu | nothing — no Gazu changes exist yet (see *Known gaps*) |

Both are kept merged with their upstream `main`, so you can check them out
against a current Kitsu and Zou rather than a months-old snapshot.

**The Kitsu branch does not work without the Zou branch.** The cut tool stores
pieces in a new `schedule_segment` table, so without the backend every cut fails
with a 400 and nothing persists.

### Setup

```bash
# Zou
git checkout schedule/add-schedule-segments
zou upgrade-db          # required: creates the schedule_segment table
```

```bash
# Kitsu
git checkout schedule/cut-tool-testing
npm ci
npm run dev
```

The migration (`a70fd7b4e2e1_add_schedule_segments`) has a real `downgrade()`,
so `zou downgrade-db --revision "-1"` gets you back.

## Where the features live

Everything is on the **Production Schedule** page:
`/productions/<id>/schedule`. Feature 1 is deliberately scoped to that page
only — the nine other places the schedule widget is used (Task Type, Asset,
Shot, Sequence, Episode, Edit, Person, Team Schedule) keep today's behaviour, and
confirming that is part of the test.

## What to test

### Flexible timelines

- Drag a task bar's right edge. Before, it snapped back to match the
  estimation; now the window you draw is kept.
- Move a task outside its department bar. The department bar should **not**
  chase it.
- Move a task beyond a department bar's edge. The department bar grows to
  contain it but never shrinks back.
- Move a task that stays well inside its department bar's current dates
  (a department drafted with slack around its tasks). The department bar
  should **not** move at all — only a drag that actually reaches past the
  department's current edge is allowed to move it.
- Type an end date in the side panel (that field used to be disabled).
- Bars may now start on a weekend. That is intended for rough drafting — the
  implicit "snap to business day" is gone.

### Cut tool

Toggle **Cut** in the toolbar (scissors icon), then:

- Click a bar to cut it in two. The tool switches itself off after one cut.
- The cursor shows scissors while the tool is armed.
- Click the gap between two pieces to heal them back together. A gap wider than
  one day takes one click per day, and the tool stays armed until the bar is
  whole again.
- Drag one piece onto or against another piece of the same bar — they merge.
- Drag pieces apart and confirm each moves independently.
- Cut at all three levels: a department row, a sequence row, and an individual
  task on a person's row.
- Reload and confirm cuts persist.
- Cut a bar at its last day (leaving one piece) — that is a valid trim, not a
  bug.
- Two tasks on one person's row where one is cut: a task that fits inside
  another's gap should sit on the **same** line, not be pushed down a row.

#### Department bars following a cut task's drag

A department (or sequence) bar is expected to pull its start/end to follow a
task drag, but only the edge that moved — dragging a task later never pulls
the *start* in, and dragging it earlier never pushes the *end* out. For a cut
department, only the one piece the dragged task belongs to should move; the
other pieces of that same department bar must stay put. And in either
direction, the edge only ever **extends** — it never shrinks in response to a
task move, even if that task was the only thing keeping it that wide. Only a
manual resize of the department bar itself is allowed to make it shorter
(the clip-and-confirm behaviour above).

- Cut a department bar into at least two pieces, put a cut task under one of
  them, and drag one of the task's own pieces **entirely within its own
  piece's date range** (not past either edge). The containing department
  piece should **not** move — this used to silently do nothing at all
  (measuring the drag against the task's overall start/end rather than the
  piece that actually moved), then briefly over-corrected into recomputing
  the piece's edge from scratch on every such drag, which shrank it whenever
  the piece had any slack around its actual work.
- Now drag that piece far enough to actually cross the containing department
  piece's current edge. The department piece should extend to match.
- Confirm the *other* department pieces (the ones the dragged task has
  nothing to do with) don't move at all in either case.

### Worth being nasty about

- Double-click fast on a bar in cut mode. It should cut once, not twice.
- Cut a single-day piece and try to drag it. It is a small target by design at
  low zoom — zoom in for more pixels per day.
- Two coordinators on the same production at once. **Expect this to be broken**
  — see *Known gaps*.

## Known gaps and deliberate limitations

None of these are regressions; they are things not built yet.

- **A cut task cannot be reassigned by dragging.** Once cut, only pieces exist
  to grab, and a piece deliberately moves in time only. Per-piece assignment
  (artist A falls sick, artist B takes over the remainder) is a separate design
  task, speced but not started.
- **A task assigned to two artists moves on both rows at once.** It is one task
  rendered on both rows, so this is current behaviour, not a bug. Same design
  task as above.
- **No live updates for cuts.** There are no websocket handlers for
  `schedule-segment:new|update|delete`, so a second person's cut does not appear
  until reload.
- **No Gazu support at all** for schedule items or segments. Pre-existing gap
  that upstream will likely want closed.
- **Segments are not versioned.** Schedule versions carry their own dates;
  cuts are not part of that.
- **No load or capacity indicators.** Out of scope by design.

## Reporting back

The most useful thing in a report is *what you did*, not just what you saw —
which level of bar, whether it was already cut, and whether a reload changes the
symptom. Two bugs in this feature took several rounds to pin down because the
repro path was ambiguous.

Frontend checks: `npm run test:unit` (3778 tests) and `npm run lint`.
Backend: `DB_DATABASE=zoudb-test py.test tests/blueprints/crud/test_schedule_segment.py`
(17 tests). The rest of the Zou suite has failures that belong to `main` and
this environment, not to this branch: compare against a run on `main` before
reporting one.

## For whoever submits this upstream

The branches are already shaped as independent submissions:

| # | Repo | Branch | Content |
|---|---|---|---|
| 1 | Kitsu | `schedule/decouple-window-from-estimation` | Flexible timelines. Frontend only, no migration, no new UI, mostly deletions. |
| 2 | Zou | `schedule/add-schedule-segments` | `ScheduleSegment` model, migration, CRUD + project route, sync entries, tests. |
| 3 | Kitsu | `schedule/render-schedule-segments` | Cut tool. Stacked on 1, depends on 2. |
| 4 | Gazu | — | Not written. |

The task-type visibility filter that used to sit on top of this work is
already in Kitsu's `main`, so it is no longer part of what there is to test
here.

Before submitting #3, its history is worth squashing: it is one feature commit
followed by fixes found during testing (most recently, department bars not
reliably following a cut task's drag — see *Cut tool* above), which is useful
for bisecting now but noisy for a reviewer. Keep the history until testing is
signed off.
