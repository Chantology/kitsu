/*
 * Helpers of the production schedule page: the query params it reads and
 * writes, the task type filter, the bar dates and the task save payloads.
 * refreshRawDates, widenParents and the parent fit update the bars they are
 * given; the fit returns the bars and pieces to save.
 */

import moment from 'moment'

export const DEFAULT_MODE = 'prev'
export const DEFAULT_VERSION = 'ref'
// the week view, see zoomOptions in the page
export const DEFAULT_ZOOM = 0

// Query params
// --------------------------------------------------------------------------

// A query param repeated in the URL reaches the page as an array of values.
export const parseHiddenTaskTypeIds = (queryValue, taskTypeMap) =>
  [queryValue]
    .flat()
    .filter(Boolean)
    .flatMap(value => value.split(','))
    .filter(id => taskTypeMap.has(id))

export const formatHiddenTaskTypeIds = hiddenTaskTypeIds =>
  hiddenTaskTypeIds.join(',') || null

// Return the query to navigate to, and whether it replaces the history
// entry, or null when nothing changes.
export const getScheduleRouteChange = (
  currentQuery,
  { mode, type, version, zoom, hiddenTypes }
) => {
  const query = { ...currentQuery }
  if (mode !== undefined) {
    query.mode = mode || undefined
  }
  if (type !== undefined) {
    query.type = type || undefined
  }
  if (version !== undefined) {
    query.version = version || undefined
  }
  if (zoom !== undefined) {
    query.zoom = String(zoom)
  }
  if (hiddenTypes !== undefined) {
    query.hiddenTypes = hiddenTypes || undefined
  }
  if (JSON.stringify(query) === JSON.stringify(currentQuery)) {
    return null
  }
  // the page never reads the history back, and the task type checkboxes
  // stay open: one entry per click would take as many Back presses
  return { query, isReplace: hiddenTypes !== undefined }
}

// Task type filter
// --------------------------------------------------------------------------

// Named and ordered like the rows they toggle: two entities can share a task
// type name, the bare name would list two identical options.
export const getTaskTypeFilterOptions = scheduleItems =>
  scheduleItems.map(item => ({
    label: item.name,
    value: item.task_type_id
  }))

// A single option is nothing to choose from, unless it is the hidden one:
// dropping the filter there would leave no way to bring the row back.
export const isTaskTypeFilterShown = (optionCount, visibleCount, scopedCount) =>
  optionCount > 1 || visibleCount < scopedCount

export const getTaskTypeFilterTitle = (visibleCount, optionCount, allLabel) =>
  visibleCount === optionCount ? allLabel : `(${visibleCount}/${optionCount})`

export const getTaskTypeVisibilityMap = (options, hiddenTaskTypeIds) =>
  options.reduce((map, option) => {
    map[option.value] = !hiddenTaskTypeIds.includes(option.value)
    return map
  }, {})

export const removeHiddenTaskTypes = (scheduleItems, hiddenTaskTypeIds) =>
  hiddenTaskTypeIds.length
    ? scheduleItems.filter(
        item => !hiddenTaskTypeIds.includes(item.task_type_id)
      )
    : scheduleItems

// One id at a time: the options only cover the current entity filter, and
// rebuilding the list from them would show the types hidden in the others.
export const setTaskTypeVisibility = (
  hiddenTaskTypeIds,
  taskTypeId,
  visible
) =>
  visible
    ? hiddenTaskTypeIds.filter(id => id !== taskTypeId)
    : [...hiddenTaskTypeIds, taskTypeId]

// Bar dates
// --------------------------------------------------------------------------

// The raw strings feed the Excel export and the side panel ranges, while a
// drag moves the startDate / endDate moments.
export const refreshRawDates = item => {
  item.start_date = item.startDate.format('YYYY-MM-DD')
  item.end_date = item.endDate.format('YYYY-MM-DD')
}

// The rows of a task type bar, the tasks of a row (one array per
// assignee), nothing under a task.
export const subItemsOf = item =>
  Array.isArray(item.children)
    ? item.children
    : item.children instanceof Map
      ? Array.from(item.children.values()).flat()
      : []

// The sub-items a drag moved from where the widget stamped them. A task
// with several assignees sits in several arrays: listed once.
export const movedSubItems = item => {
  const moved = new Set()
  const walk = parent =>
    subItemsOf(parent).forEach(child => {
      if (
        child._dragOrigStartDate &&
        (!child.startDate.isSame(child._dragOrigStartDate) ||
          !child.endDate.isSame(child._dragOrigEndDate))
      ) {
        moved.add(child)
      }
      walk(child)
    })
  walk(item)
  return [...moved]
}

export const getMinDate = (parentElement, fallbackDate) => {
  let minDate = fallbackDate.clone()
  parentElement.children.forEach(item => {
    if (item.startDate && item.startDate.isBefore(minDate)) {
      minDate = item.startDate
    }
  })
  return minDate.clone()
}

export const getMaxDate = (parentElement, fallbackDate) => {
  let maxDate = fallbackDate.clone()
  parentElement.children.forEach(item => {
    if (item.endDate && item.endDate.isAfter(maxDate)) {
      maxDate = item.endDate
    }
  })
  return maxDate.clone()
}

// Widen the bars above a moved one so they still enclose it. Return each
// widened bar once, to be saved with both its dates.
export const widenParents = item => {
  const widenedParents = []
  let child = item
  let parent = item.parentElement
  let isWidened = true
  while (parent && isWidened) {
    isWidened = false
    if (child.startDate.isBefore(parent.startDate)) {
      parent.startDate = child.startDate.clone()
      isWidened = true
    }
    if (child.endDate.isAfter(parent.endDate)) {
      parent.endDate = child.endDate.clone()
      isWidened = true
    }
    if (isWidened) {
      widenedParents.push(parent)
    }
    child = parent
    parent = parent.parentElement
  }
  return widenedParents
}

// Fitting parents to a moved child
// --------------------------------------------------------------------------

// Child rows are either an array (a task type's entity types) or a map of
// assignee to tasks (an entity type's own row), so a parent has to be asked
// for its children rather than read directly.
export const childElementsOf = element => {
  const children = element.children
  if (Array.isArray(children)) return children
  if (children instanceof Map) return [...children.values()].flat()
  return []
}

// Every dated bar at the bottom of the tree. A cut bar is fitted to the work
// inside one of its pieces, and the rows in between span all of their tasks
// at once, so the tasks have to be read from the leaves rather than from the
// immediate children.
export const leafElementsOf = element =>
  childElementsOf(element).flatMap(child => {
    const leaves = leafElementsOf(child)
    return leaves.length ? leaves : [child]
  })

// The blocks of work under a bar, one per piece rather than one per task. A
// cut task's envelope spans its own break, so measuring it whole would credit
// a piece of the parent with work that happens weeks away from it.
export const leafRangesOf = element =>
  leafElementsOf(element).flatMap(leaf => {
    if (!leaf.startDate || !leaf.endDate) return []
    const pieces = leaf.segments?.length ? leaf.segments : [leaf]
    return pieces.map(piece => ({
      start: piece.startDate,
      end: piece.endDate
    }))
  })

// Where the bar that moved sat before, and where it sits now. For a cut bar
// this is the piece that was dragged, not the task it belongs to: reading the
// task's envelope instead makes any move that keeps the envelope the same -
// dragging an inner piece about - look like no move at all, and nothing above
// it then follows.
export const movedRangeOf = item => ({
  wasStart: item._dragOrigStartDate || item.startDate,
  wasEnd: item._dragOrigEndDate || item.endDate,
  start: item.startDate,
  end: item.endDate
})

// The stamps outlive the drag, so a later edit through the side panel would
// otherwise be read as a move in whichever direction the bar was last dragged.
export const clearDragOrigin = item => {
  delete item._dragOrigStartDate
  delete item._dragOrigEndDate
}

// The piece a bar was working inside before it moved. A bar that sat in a
// break belongs to the piece it is nearest to, so a fit always has somewhere
// to land.
export const segmentAround = (parent, start, end) => {
  const overlap = segment =>
    Math.min(segment.endDate.valueOf(), end.valueOf()) -
    Math.max(segment.startDate.valueOf(), start.valueOf())
  const touching = parent.segments.filter(
    segment =>
      segment.startDate.isSameOrBefore(end) &&
      segment.endDate.isSameOrAfter(start)
  )
  // widest overlap wins, for a bar lying across a break
  if (touching.length) {
    return touching.reduce((best, segment) =>
      overlap(segment) > overlap(best) ? segment : best
    )
  }
  const distance = segment =>
    segment.startDate.isAfter(end)
      ? segment.startDate.diff(end)
      : start.diff(segment.endDate)
  return parent.segments.reduce((best, segment) =>
    distance(segment) < distance(best) ? segment : best
  )
}

// Undated tasks have no bar to fit a parent around.
export const childDateRange = element => {
  const children = childElementsOf(element).filter(
    child => child.startDate && child.endDate
  )
  if (!children.length) return null
  return {
    start: moment.min(children.map(child => child.startDate)),
    end: moment.max(children.map(child => child.endDate))
  }
}

// Only the piece the moved bar belongs to follows it, and only to the work
// that piece covers. Fitting a cut bar to everything underneath it would edit
// pieces that stand for unrelated blocks of work - a piece drafted ahead of
// any task, most visibly - because a piece is only a date range and nothing
// records which tasks belong to it. Return the pieces that changed.
export const fitSegmentToItsWork = (parent, moved, pulledStart, pushedEnd) => {
  const changedSegments = []
  const segment = segmentAround(parent, moved.wasStart, moved.wasEnd)
  const index = parent.segments.indexOf(segment)
  const before = parent.segments[index - 1]
  const after = parent.segments[index + 1]

  // what this piece covers: the blocks of work already inside it, plus the
  // one that just moved out of or across it
  const members = [
    ...leafRangesOf(parent).filter(
      range =>
        range.start.isSameOrBefore(segment.endDate) &&
        range.end.isSameOrAfter(segment.startDate)
    ),
    { start: moved.start, end: moved.end }
  ]

  if (pulledStart) {
    // never later than the piece's own current start - a fit only ever
    // extends a piece, the same as the plain-parent branch below, so a piece
    // drafted ahead of its work does not collapse onto it the moment any task
    // inside it is nudged
    let start = moment
      .min([segment.startDate, ...members.map(range => range.start)])
      .clone()
    // a piece stays clear of its neighbour and never crosses its own end
    if (before) {
      const floor = before.endDate.clone().add(1, 'days')
      if (start.isBefore(floor)) start = floor
    }
    const ceiling = segment.endDate.clone().subtract(1, 'days')
    if (start.isAfter(ceiling)) start = ceiling
    if (!start.isSame(segment.startDate)) {
      segment.startDate = start
      segment.start_date = start.format('YYYY-MM-DD')
      changedSegments.push(segment)
    }
  }

  if (pushedEnd) {
    // never earlier than the piece's own current end - see pulledStart
    let end = moment
      .max([segment.endDate, ...members.map(range => range.end)])
      .clone()
    if (after) {
      const ceiling = after.startDate.clone().subtract(1, 'days')
      if (end.isAfter(ceiling)) end = ceiling
    }
    const floor = segment.startDate.clone().add(1, 'days')
    if (end.isBefore(floor)) end = floor
    if (!end.isSame(segment.endDate)) {
      segment.endDate = end
      segment.end_date = end.format('YYYY-MM-DD')
      changedSegments.push(segment)
    }
  }

  // the bar itself still spans its pieces
  parent.startDate = moment
    .min(parent.segments.map(piece => piece.startDate))
    .clone()
  parent.endDate = moment
    .max(parent.segments.map(piece => piece.endDate))
    .clone()

  return changedSegments
}

// A parent bar follows the edge its children were pushed towards: drag a task
// earlier and its department starts with it, drag one later and the
// department ends with it. Only that edge moves, and only outwards. A move
// changes both of the child's dates, so refitting both would drag the far end
// of a rough draft along with every small nudge, and refitting an edge inwards
// would collapse a drafted bar onto its tasks the moment one is nudged.
//
// The opposite direction is deliberately not symmetric. Lengthening a
// department cannot tell which task should absorb the extra room - one task,
// several, or none - so it leaves its children alone and stays a manual edit.
// Shortening one clips them, which the user confirms first.
//
// Without the drag origin (a side panel edit, or a bar in a multi-select that
// was never stamped) nothing moved as far as this can tell, so it falls back
// to growing only, which is what keeps a child from being drawn outside its
// parent.
//
// Return the bars and the pieces that changed, to be saved by the caller.
export const fitParentsToChildren = (item, moved) => {
  const changedItems = []
  const changedSegments = []
  const pulledStart = moved.start.isBefore(moved.wasStart)
  const pushedEnd = moved.end.isAfter(moved.wasEnd)
  let child = item
  let parent = child.parentElement
  while (parent) {
    if (parent.segments?.length) {
      changedSegments.push(
        ...fitSegmentToItsWork(parent, moved, pulledStart, pushedEnd)
      )
    } else {
      const range = childDateRange(parent)
      // never later/earlier than the parent's own current bound
      const nextStart =
        pulledStart && range
          ? moment.min(parent.startDate, range.start).clone()
          : child.startDate.isBefore(parent.startDate)
            ? child.startDate.clone()
            : parent.startDate.clone()
      const nextEnd =
        pushedEnd && range
          ? moment.max(parent.endDate, range.end).clone()
          : child.endDate.isAfter(parent.endDate)
            ? child.endDate.clone()
            : parent.endDate.clone()

      const settled =
        nextStart.isSame(parent.startDate) && nextEnd.isSame(parent.endDate)
      // Refusing rather than drawing a backwards bar: only reachable if a
      // child sits outside the edge that is not being refitted.
      if (!settled && nextStart.isBefore(nextEnd)) {
        parent.startDate = nextStart
        parent.endDate = nextEnd
        changedItems.push(parent)
      }
    }
    child = parent
    parent = parent.parentElement
  }
  return { items: changedItems, segments: changedSegments }
}

// Task saves
// --------------------------------------------------------------------------

export const getVersionedTaskUpdate = task => ({
  id: task.versionedTaskId,
  estimation: task.estimation,
  startDate: task.startDate.format('YYYY-MM-DD'),
  dueDate: task.endDate.format('YYYY-MM-DD'),
  // 'unassigned' is the local row placeholder, not a person id: the API
  // rejects it and drops the whole update
  assignees: task.assignees.filter(id => id !== 'unassigned')
})

export const getTaskUpdate = task => ({
  taskId: task.id,
  data: {
    estimation: task.estimation,
    start_date: task.startDate.format('YYYY-MM-DD'),
    due_date: task.endDate.format('YYYY-MM-DD')
  }
})
