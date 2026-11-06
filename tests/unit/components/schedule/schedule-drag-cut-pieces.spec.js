import { mount } from '@vue/test-utils'
import moment from 'moment'
import { vi } from 'vitest'

vi.mock('vuex', () => ({
  useStore: () => ({
    getters: {
      currentProduction: { id: 'production-1', name: 'Production' },
      dateFormat: 'YYYY-MM-DD',
      departmentMap: new Map(),
      isCurrentUserManager: true,
      isDarkTheme: false,
      milestones: [],
      openProductions: [],
      organisation: { hours_by_day: 8 },
      taskMap: new Map(),
      taskStatuses: []
    },
    dispatch: vi.fn()
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: key => key })
}))

import Schedule from '@/components/schedule/Schedule.vue'

// A task type bar moved without shift carries everything under it. A cut
// task is drawn as its pieces, so the pieces are what has to arrive at the
// new dates: a task whose own dates moved while its pieces stayed behind
// renders where it was and contradicts itself after a reload.
const buildHierarchy = () => {
  const task = {
    id: 'task-1',
    name: 'Modeling',
    entity: { name: 'bbb' },
    entity_type_id: 'asset-type-1',
    assignees: ['person-1'],
    editable: true,
    line: 0,
    estimation: 4800,
    duration: 0,
    startDate: moment.utc('2026-08-15'),
    endDate: moment.utc('2026-08-29')
  }
  task.segments = [
    {
      id: 'segment-1',
      start_date: '2026-08-15',
      end_date: '2026-08-19',
      startDate: moment.utc('2026-08-15'),
      endDate: moment.utc('2026-08-19'),
      editable: true,
      owner: task
    },
    {
      id: 'segment-2',
      start_date: '2026-08-24',
      end_date: '2026-08-29',
      startDate: moment.utc('2026-08-24'),
      endDate: moment.utc('2026-08-29'),
      editable: true,
      owner: task
    }
  ]

  const childElement = {
    segments: [],
    id: 'asset-type-1',
    object_id: 'asset-type-1',
    name: 'Characters',
    color: '#888888',
    editable: true,
    man_days: 0,
    startDate: moment.utc('2026-08-15'),
    endDate: moment.utc('2026-08-29'),
    children: new Map([['person-1', [task]]])
  }
  task.parentElement = childElement
  // SQ10 cut in two: work either side of a gap through late August
  childElement.segments = [
    {
      id: 'row-piece-1',
      start_date: '2026-08-15',
      end_date: '2026-08-18',
      startDate: moment.utc('2026-08-15'),
      endDate: moment.utc('2026-08-18'),
      editable: true,
      owner: childElement
    },
    {
      id: 'row-piece-2',
      start_date: '2026-08-26',
      end_date: '2026-08-29',
      startDate: moment.utc('2026-08-26'),
      endDate: moment.utc('2026-08-29'),
      editable: true,
      owner: childElement
    }
  ]

  const rootElement = {
    id: 'task-type-1',
    name: 'Asset / Modeling',
    color: '#888888',
    editable: true,
    expanded: true,
    loading: false,
    man_days: 0,
    daysOff: [],
    startDate: moment.utc('2026-08-15'),
    endDate: moment.utc('2026-08-29'),
    children: [childElement],
    people: { 'person-1': { id: 'person-1', daysOff: [] } }
  }
  childElement.parentElement = rootElement

  return { rootElement, childElement, task }
}

const mountSchedule = hierarchy =>
  mount(Schedule, {
    props: {
      startDate: moment.utc('2026-07-05'),
      endDate: moment.utc('2026-10-23'),
      hierarchy: [hierarchy.rootElement],
      zoomLevel: 1,
      subchildren: true,
      clipChildren: true,
      withMilestones: false,
      isLoading: false
    },
    attachTo: document.body,
    global: { stubs: { RouterLink: true } }
  })

const dragOver = (element, clientX) =>
  element.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, clientX })
  )

const daysMoved = (value, from) => value.diff(moment(from), 'days')

describe('Schedule widget - a cut bar under a dragged root bar', () => {
  let rafSpy

  beforeEach(() => {
    rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback()
        return 0
      })
  })

  afterEach(() => {
    rafSpy.mockRestore()
  })

  test('moves the pieces of a cut task with the task itself', async () => {
    const hierarchy = buildHierarchy()
    const wrapper = mountSchedule(hierarchy)

    const rootBar = wrapper.find('.timebar-wrapper .timebar')
    await rootBar.find('.timebar-center').trigger('mousedown', {
      clientX: 500
    })
    dragOver(wrapper.find('.timeline-content').element, 620)

    const shift = daysMoved(hierarchy.task.startDate, '2026-08-15')
    expect(shift).toBeGreaterThan(0)
    expect(daysMoved(hierarchy.task.segments[0].startDate, '2026-08-15')).toBe(
      shift
    )
    expect(daysMoved(hierarchy.task.segments[0].endDate, '2026-08-19')).toBe(
      shift
    )
    expect(daysMoved(hierarchy.task.segments[1].startDate, '2026-08-24')).toBe(
      shift
    )
    expect(daysMoved(hierarchy.task.segments[1].endDate, '2026-08-29')).toBe(
      shift
    )

    wrapper.unmount()
  })

  test('leaves the pieces alone when shift clips the rows instead', async () => {
    const hierarchy = buildHierarchy()
    const wrapper = mountSchedule(hierarchy)

    const rootBar = wrapper.find('.timebar-wrapper .timebar')
    await rootBar.find('.timebar-center').trigger('mousedown', {
      clientX: 500,
      shiftKey: true
    })
    dragOver(wrapper.find('.timeline-content').element, 620)

    expect(daysMoved(hierarchy.task.segments[0].startDate, '2026-08-15')).toBe(
      0
    )
    expect(daysMoved(hierarchy.task.segments[1].endDate, '2026-08-29')).toBe(0)

    wrapper.unmount()
  })

  // A trim leaves a row fewer days. The slack goes first: the pieces keep
  // their length and the gap between them narrows to pay for the move.
  test('spends the gap before cutting work', async () => {
    const hierarchy = buildHierarchy()
    const row = hierarchy.childElement
    const lengthsBefore = row.segments.map(piece =>
      piece.endDate.diff(piece.startDate, 'days')
    )
    const gapBefore = row.segments[1].startDate.diff(
      row.segments[0].endDate,
      'days'
    )
    const wrapper = mountSchedule(hierarchy)

    const rootBar = wrapper.find('.timebar-wrapper .timebar')
    await rootBar.find('.timebar-center').trigger('mousedown', {
      clientX: 500,
      shiftKey: true
    })
    dragOver(wrapper.find('.timeline-content').element, 620)

    expect(row.segments).toHaveLength(2)
    expect(
      row.segments.map(piece => piece.endDate.diff(piece.startDate, 'days'))
    ).toEqual(lengthsBefore)
    const gapAfter = row.segments[1].startDate.diff(
      row.segments[0].endDate,
      'days'
    )
    expect(gapAfter).toBeLessThan(gapBefore)
    expect(
      row.segments[0].startDate.isSameOrAfter(hierarchy.rootElement.startDate)
    ).toBe(true)
    // the row spans its pieces, as it does after any cut
    expect(row.startDate.isSame(row.segments[0].startDate)).toBe(true)
    expect(row.endDate.isSame(row.segments[1].endDate)).toBe(true)

    wrapper.unmount()
  })

  // Resizing a bar below the work under it is the one case the slack cannot
  // pay for, and work is cut then, exactly as it is on an uncut row.
  test('cuts work once the gaps are spent', async () => {
    const hierarchy = buildHierarchy()
    const row = hierarchy.childElement
    const workBefore = row.segments.reduce(
      (total, piece) => total + piece.endDate.diff(piece.startDate, 'days') + 1,
      0
    )
    const wrapper = mountSchedule(hierarchy)

    const rootBar = wrapper.find('.timebar-wrapper .timebar')
    await rootBar.find('.timebar-left-hand').trigger('mousedown', {
      clientX: 500,
      shiftKey: true
    })
    dragOver(wrapper.find('.timeline-content').element, 760)

    const windowDays =
      hierarchy.rootElement.endDate.diff(
        hierarchy.rootElement.startDate,
        'days'
      ) + 1
    const pieces = row.segments.length
      ? row.segments
      : [{ startDate: row.startDate, endDate: row.endDate }]
    const workAfter = pieces.reduce(
      (total, piece) => total + piece.endDate.diff(piece.startDate, 'days') + 1,
      0
    )

    expect(workAfter).toBeLessThan(workBefore)
    expect(workAfter).toBeLessThanOrEqual(windowDays)
    pieces.forEach(piece => {
      expect(
        piece.startDate.isSameOrAfter(hierarchy.rootElement.startDate)
      ).toBe(true)
      expect(piece.endDate.isSameOrBefore(hierarchy.rootElement.endDate)).toBe(
        true
      )
    })

    wrapper.unmount()
  })

  test('keeps the pieces that still fit, cut back to the window', async () => {
    const hierarchy = buildHierarchy()
    // a third piece well inside the window, so more than one survives
    hierarchy.childElement.segments.push({
      id: 'row-piece-3',
      start_date: '2026-09-02',
      end_date: '2026-09-05',
      startDate: moment.utc('2026-09-02'),
      endDate: moment.utc('2026-09-05'),
      editable: true,
      owner: hierarchy.childElement
    })
    hierarchy.childElement.endDate = moment.utc('2026-09-05')
    hierarchy.rootElement.endDate = moment.utc('2026-09-05')
    const wrapper = mountSchedule(hierarchy)

    const rootBar = wrapper.find('.timebar-wrapper .timebar')
    await rootBar.find('.timebar-center').trigger('mousedown', {
      clientX: 500,
      shiftKey: true
    })
    dragOver(wrapper.find('.timeline-content').element, 620)

    const row = hierarchy.childElement
    expect(row.segments.length).toBeGreaterThan(1)
    row.segments.forEach(piece => {
      expect(piece.startDate.isSameOrAfter(row.startDate)).toBe(true)
      expect(piece.endDate.isSameOrBefore(row.endDate)).toBe(true)
    })

    wrapper.unmount()
  })
})
