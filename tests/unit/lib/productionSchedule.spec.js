// @vitest-environment node

import moment from 'moment-timezone'
import { describe, expect, it } from 'vitest'

import {
  formatHiddenTaskTypeIds,
  getMaxDate,
  getMinDate,
  getScheduleRouteChange,
  getTaskTypeFilterOptions,
  getTaskTypeFilterTitle,
  getTaskTypeVisibilityMap,
  getTaskUpdate,
  getVersionedTaskUpdate,
  isTaskTypeFilterShown,
  parseHiddenTaskTypeIds,
  refreshRawDates,
  removeHiddenTaskTypes,
  setTaskTypeVisibility,
  widenParents,
  fitParentsToChildren,
  movedRangeOf
} from '@/lib/productionSchedule'

const day = date => moment.utc(date)
const format = date => date.format('YYYY-MM-DD')

describe('lib/productionSchedule', () => {
  describe('hiddenTypes query param', () => {
    const taskTypeMap = new Map([
      ['tt-modeling', { id: 'tt-modeling' }],
      ['tt-animation', { id: 'tt-animation' }]
    ])

    it('reads the comma separated list', () => {
      expect(
        parseHiddenTaskTypeIds('tt-modeling,tt-animation', taskTypeMap)
      ).toEqual(['tt-modeling', 'tt-animation'])
    })

    it('drops the types the production no longer has', () => {
      expect(
        parseHiddenTaskTypeIds('tt-modeling,tt-gone', taskTypeMap)
      ).toEqual(['tt-modeling'])
    })

    // A param repeated in the URL reaches the page as an array: splitting it
    // threw and left the schedule editable in its read-only mode.
    it('reads the param repeated in the URL', () => {
      expect(
        parseHiddenTaskTypeIds(['tt-modeling', 'tt-animation'], taskTypeMap)
      ).toEqual(['tt-modeling', 'tt-animation'])
    })

    it('reads an empty query', () => {
      expect(parseHiddenTaskTypeIds(undefined, taskTypeMap)).toEqual([])
    })

    it('writes the list, or nothing once every type is shown', () => {
      expect(formatHiddenTaskTypeIds(['tt-modeling', 'tt-animation'])).toBe(
        'tt-modeling,tt-animation'
      )
      expect(formatHiddenTaskTypeIds([])).toBeNull()
    })
  })

  describe('getScheduleRouteChange', () => {
    // The page never reads the history back: one entry per ticked checkbox
    // would only take as many Back presses to leave it.
    it('replaces the history entry when the hidden types change', () => {
      expect(
        getScheduleRouteChange({ zoom: '1' }, { hiddenTypes: 'tt-modeling' })
      ).toEqual({
        query: { zoom: '1', hiddenTypes: 'tt-modeling' },
        isReplace: true
      })
    })

    it('pushes a history entry for the other settings', () => {
      expect(getScheduleRouteChange({ zoom: '1' }, { mode: 'real' })).toEqual(
        { query: { zoom: '1', mode: 'real' }, isReplace: false }
      )
    })

    it('drops the params set back to nothing', () => {
      const change = getScheduleRouteChange(
        { type: 'Shot', hiddenTypes: 'tt-modeling' },
        { type: null, hiddenTypes: null }
      )

      expect(JSON.stringify(change.query)).toBe('{}')
    })

    it('changes nothing when the query stays the same', () => {
      expect(getScheduleRouteChange({ zoom: '2' }, { zoom: 2 })).toBeNull()
    })
  })

  describe('task type filter', () => {
    const modelingItem = {
      task_type_id: 'tt-modeling',
      name: 'Asset / Modeling'
    }
    const layoutItem = { task_type_id: 'tt-layout', name: 'Shot / Layout' }
    const animationItem = {
      task_type_id: 'tt-animation',
      name: 'Shot / Animation'
    }
    const items = [modelingItem, layoutItem, animationItem]

    // The rows are named '<entity> / <task type>', and two entities can share
    // a task type name: the bare name leaves two identical options.
    it('names the options after the schedule rows, in their order', () => {
      expect(getTaskTypeFilterOptions(items)).toEqual([
        { label: 'Asset / Modeling', value: 'tt-modeling' },
        { label: 'Shot / Layout', value: 'tt-layout' },
        { label: 'Shot / Animation', value: 'tt-animation' }
      ])
    })

    it('removes the hidden types from the rows', () => {
      expect(
        removeHiddenTaskTypes(items, ['tt-modeling', 'tt-animation'])
      ).toEqual([layoutItem])
      expect(removeHiddenTaskTypes(items, [])).toBe(items)
    })

    it('ticks the visible types of the current view', () => {
      const options = getTaskTypeFilterOptions([layoutItem, animationItem])

      expect(
        getTaskTypeVisibilityMap(options, ['tt-modeling', 'tt-animation'])
      ).toEqual({ 'tt-layout': true, 'tt-animation': false })
    })

    it('keeps the types hidden outside the current entity filter', () => {
      expect(
        setTaskTypeVisibility(['tt-modeling'], 'tt-animation', false)
      ).toEqual(['tt-modeling', 'tt-animation'])
      expect(
        setTaskTypeVisibility(['tt-modeling', 'tt-animation'], 'tt-animation', true)
      ).toEqual(['tt-modeling'])
    })

    // Without it the last visible type can be hidden from another entity
    // view, and the filter disappears with no way to bring the row back.
    it('stays on screen while a type of the current view is hidden', () => {
      expect(isTaskTypeFilterShown(1, 0, 1)).toBe(true)
    })

    it('hides itself when a single type is left to choose from', () => {
      expect(isTaskTypeFilterShown(1, 1, 1)).toBe(false)
      expect(isTaskTypeFilterShown(2, 2, 2)).toBe(true)
    })

    it('counts the visible types in its title', () => {
      expect(getTaskTypeFilterTitle(1, 3, 'All')).toBe('(1/3)')
      expect(getTaskTypeFilterTitle(3, 3, 'All')).toBe('All')
    })
  })

  describe('bar dates', () => {
    const buildBar = (start, end) => ({
      start_date: '2026-03-01',
      end_date: '2026-03-02',
      startDate: day(start),
      endDate: day(end)
    })

    // The Excel export and the side panel date ranges read the raw strings,
    // while a drag moves the moments.
    it('refreshes the raw dates from the moved moments', () => {
      const bar = buildBar('2026-10-01', '2026-10-05')

      refreshRawDates(bar)

      expect([bar.start_date, bar.end_date]).toEqual([
        '2026-10-01',
        '2026-10-05'
      ])
    })

    it('spans the children of a bar, from the given fallback dates', () => {
      const parent = {
        children: [
          buildBar('2026-04-01', '2026-04-10'),
          buildBar('2026-05-01', '2026-05-20'),
          { name: 'no dates yet' }
        ]
      }

      expect(format(getMinDate(parent, day('2026-12-31')))).toBe('2026-04-01')
      expect(format(getMaxDate(parent, day('2026-01-01')))).toBe('2026-05-20')
      expect(format(getMinDate({ children: [] }, day('2026-12-31')))).toBe(
        '2026-12-31'
      )
    })

    // A task stretching past both ends of its bars must save each bar once
    // with its two new dates: two requests racing could keep a stale end.
    it('widens each bar above a moved one once, both ends at a time', () => {
      const taskTypeBar = buildBar('2026-01-06', '2026-01-15')
      const entityBar = buildBar('2026-01-07', '2026-01-14')
      entityBar.parentElement = taskTypeBar
      const task = buildBar('2026-01-05', '2026-01-16')
      task.parentElement = entityBar

      expect(widenParents(task)).toEqual([entityBar, taskTypeBar])
      expect([entityBar, taskTypeBar].map(bar => format(bar.startDate))).toEqual(
        ['2026-01-05', '2026-01-05']
      )
      expect([entityBar, taskTypeBar].map(bar => format(bar.endDate))).toEqual(
        ['2026-01-16', '2026-01-16']
      )
    })

    it('stops at the first bar that already encloses the moved one', () => {
      const taskTypeBar = buildBar('2026-03-01', '2026-03-05')
      const entityBar = buildBar('2026-01-01', '2026-12-31')
      entityBar.parentElement = taskTypeBar
      const task = buildBar('2026-06-01', '2026-06-10')
      task.parentElement = entityBar

      expect(widenParents(task)).toEqual([])
      expect(format(taskTypeBar.startDate)).toBe('2026-03-01')
    })
  })

  describe('task saves', () => {
    const buildTask = assignees => ({
      id: 'task-1',
      versionedTaskId: 'link-1',
      estimation: 480,
      assignees,
      startDate: day('2026-09-21'),
      endDate: day('2026-09-22')
    })

    // The drill-down groups unassigned tasks under a local 'unassigned' row
    // that is not a person id known to the API.
    it('drops the unassigned placeholder from the versioned task link', () => {
      expect(getVersionedTaskUpdate(buildTask(['unassigned']))).toEqual({
        id: 'link-1',
        estimation: 480,
        startDate: '2026-09-21',
        dueDate: '2026-09-22',
        assignees: []
      })
    })

    it('keeps the real assignees of the versioned task link', () => {
      expect(
        getVersionedTaskUpdate(buildTask(['person-1', 'person-2'])).assignees
      ).toEqual(['person-1', 'person-2'])
    })

    it('saves the dates and the estimation of a reference task', () => {
      expect(getTaskUpdate(buildTask(['unassigned']))).toEqual({
        taskId: 'task-1',
        data: {
          estimation: 480,
          start_date: '2026-09-21',
          due_date: '2026-09-22'
        }
      })
    })
  })

  // The bars above a moved one follow the edge it was dragged towards, and
  // only outwards. A department drafted wider than its tasks has to stay
  // that way: lengthening one is a manual edit, so nothing may quietly
  // collapse it back onto the work inside it.
  describe('parent fit', () => {
    // a task type row holding one entity type row, which holds the tasks
    const buildHierarchy = (tasks, { start, end } = {}) => {
      const childElement = {
        id: 'shot-type',
        startDate: day(start || '2026-08-01'),
        endDate: day(end || '2026-10-01'),
        children: new Map([['person-1', tasks]])
      }
      const rootElement = {
        id: 'task-type-1',
        startDate: day(start || '2026-08-01'),
        endDate: day(end || '2026-10-01'),
        children: [childElement]
      }
      childElement.parentElement = rootElement
      tasks.forEach(task => {
        task.parentElement = childElement
      })
      return { rootElement, childElement }
    }

    // a bar as it looks after a drag: where it sits, and where it sat
    const buildTask = (start, end, wasStart, wasEnd) => ({
      startDate: day(start),
      endDate: day(end),
      _dragOrigStartDate: day(wasStart || start),
      _dragOrigEndDate: day(wasEnd || end),
      segments: []
    })

    const cutInto = (bar, ranges) => {
      bar.segments = ranges.map(([start, end]) => ({
        start_date: start,
        end_date: end,
        startDate: day(start),
        endDate: day(end),
        owner: bar
      }))
      bar.startDate = day(ranges[0][0])
      bar.endDate = day(ranges[ranges.length - 1][1])
      return bar
    }

    const fit = item => fitParentsToChildren(item, movedRangeOf(item))

    it('leaves a drafted start alone while a move stays inside it', () => {
      // 08-19 is earlier than it was, and still inside the drafted 08-01
      const task = buildTask('2026-08-19', '2026-09-14', '2026-08-25')
      const { rootElement, childElement } = buildHierarchy([task])

      const changed = fit(task)

      expect(format(childElement.startDate)).toBe('2026-08-01')
      expect(format(rootElement.startDate)).toBe('2026-08-01')
      expect(changed.items).toEqual([])
    })

    it('pulls the drafted start out once a move crosses it', () => {
      const task = buildTask('2026-07-26', '2026-08-21', '2026-08-25')
      const { rootElement, childElement } = buildHierarchy([task])

      const changed = fit(task)

      expect(format(childElement.startDate)).toBe('2026-07-26')
      expect(format(rootElement.startDate)).toBe('2026-07-26')
      // the far edge of the draft is left where it was
      expect(format(rootElement.endDate)).toBe('2026-10-01')
      expect(changed.items).toHaveLength(2)
    })

    it('leaves a drafted end alone while a move stays inside it', () => {
      const task = buildTask('2026-08-31', '2026-09-26', null, '2026-09-20')
      const { rootElement, childElement } = buildHierarchy([task])

      const changed = fit(task)

      expect(format(childElement.endDate)).toBe('2026-10-01')
      expect(format(rootElement.endDate)).toBe('2026-10-01')
      expect(changed.items).toEqual([])
    })

    it('pushes the drafted end out once a move crosses it', () => {
      const task = buildTask('2026-09-09', '2026-10-05', null, '2026-09-20')
      const { rootElement, childElement } = buildHierarchy([task])

      fit(task)

      expect(format(childElement.endDate)).toBe('2026-10-05')
      expect(format(rootElement.endDate)).toBe('2026-10-05')
      expect(format(rootElement.startDate)).toBe('2026-08-01')
    })

    it('fits a crossed start to the earliest sibling, not just the moved bar', () => {
      const early = buildTask('2026-07-20', '2026-07-24')
      const moved = buildTask('2026-07-28', '2026-08-23', '2026-08-25')
      const { rootElement } = buildHierarchy([early, moved])

      fit(moved)

      expect(format(rootElement.startDate)).toBe('2026-07-20')
    })

    describe('a cut parent', () => {
      // three blocks of work; the first has no task under it
      const buildCutDepartment = task => {
        const hierarchy = buildHierarchy([task])
        const { rootElement, childElement } = hierarchy
        childElement.startDate = day('2026-08-20')
        childElement.endDate = day('2026-09-15')
        cutInto(rootElement, [
          ['2026-07-06', '2026-07-10'],
          ['2026-08-20', '2026-09-15'],
          ['2026-10-05', '2026-10-15']
        ])
        return hierarchy
      }

      it('leaves the piece a task works in alone while the move stays inside it', () => {
        const task = buildTask('2026-08-22', '2026-09-02', '2026-08-25')
        const { rootElement } = buildCutDepartment(task)
        const [leading, working, trailing] = rootElement.segments

        const changed = fit(task)

        expect(format(working.startDate)).toBe('2026-08-20')
        expect(changed.segments).toEqual([])
        // the block with no task under it is never touched
        expect(format(leading.startDate)).toBe('2026-07-06')
        expect(format(trailing.startDate)).toBe('2026-10-05')
      })

      it('pulls a piece start out once the move crosses it', () => {
        const task = buildTask('2026-08-10', '2026-08-21', '2026-08-25')
        const { rootElement } = buildCutDepartment(task)
        const [leading, working, trailing] = rootElement.segments

        const changed = fit(task)

        expect(format(working.startDate)).toBe('2026-08-10')
        expect(changed.segments).toEqual([working])
        expect(format(leading.startDate)).toBe('2026-07-06')
        expect(format(trailing.startDate)).toBe('2026-10-05')
      })

      it('holds a piece clear of its neighbour when the task runs into it', () => {
        const task = buildTask('2026-09-25', '2026-10-10', null, '2026-09-05')
        const { rootElement } = buildCutDepartment(task)
        const [, working, trailing] = rootElement.segments

        fit(task)

        // one day short of the next block rather than merged into it
        expect(format(working.endDate)).toBe('2026-10-04')
        expect(format(trailing.startDate)).toBe('2026-10-05')
      })
    })

    describe('a cut task under a cut parent', () => {
      // the state that misbehaved in the app: a task whose two pieces sit in
      // two different blocks of the department above it
      const buildCutTaskInCutDepartment = () => {
        const task = cutInto(buildTask('2026-08-10', '2026-09-10'), [
          ['2026-08-10', '2026-08-16'],
          ['2026-09-02', '2026-09-10']
        ])
        const hierarchy = buildHierarchy([task])
        const { rootElement, childElement } = hierarchy
        childElement.startDate = day('2026-08-10')
        childElement.endDate = day('2026-10-12')
        cutInto(rootElement, [
          ['2026-07-21', '2026-07-31'],
          ['2026-08-10', '2026-08-26'],
          ['2026-08-31', '2026-09-10'],
          ['2026-09-21', '2026-10-18']
        ])
        return { ...hierarchy, task }
      }

      // dragging a piece about inside its own block leaves the task's whole
      // span alone, which is what used to read as "no move at all"
      const movePiece = (piece, start, end) => {
        piece._dragOrigStartDate = piece.startDate.clone()
        piece._dragOrigEndDate = piece.endDate.clone()
        piece.startDate = day(start)
        piece.endDate = day(end)
        return fitParentsToChildren(piece.owner, movedRangeOf(piece))
      }

      it('leaves the block a piece belongs to alone while the move stays inside it', () => {
        const { rootElement, task } = buildCutTaskInCutDepartment()
        const [early, working, third, last] = rootElement.segments

        const changed = movePiece(task.segments[0], '2026-08-13', '2026-08-19')

        expect(format(working.endDate)).toBe('2026-08-26')
        expect(changed.segments).toEqual([])
        expect(format(early.endDate)).toBe('2026-07-31')
        expect(format(third.startDate)).toBe('2026-08-31')
        expect(format(last.endDate)).toBe('2026-10-18')
      })

      it('pushes that block out once the move crosses it', () => {
        const { rootElement, task } = buildCutTaskInCutDepartment()
        const [early, working, third, last] = rootElement.segments

        const changed = movePiece(task.segments[0], '2026-08-23', '2026-08-29')

        expect(format(working.endDate)).toBe('2026-08-29')
        expect(changed.segments).toEqual([working])
        expect(format(early.endDate)).toBe('2026-07-31')
        expect(format(third.startDate)).toBe('2026-08-31')
        expect(format(last.endDate)).toBe('2026-10-18')
      })
    })
  })
})
