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

import Schedule from '@/components/widgets/Schedule.vue'

const piece = (owner, start, end) => ({
  id: `${owner.id}-${start}`,
  start_date: start,
  end_date: end,
  startDate: moment(start),
  endDate: moment(end),
  editable: true,
  owner
})

const buildTask = (id, shotName, start, end, cuts = []) => {
  const task = {
    id,
    name: 'Animation',
    entity: { name: shotName },
    entity_id: `entity-${id}`,
    entity_type_id: 'shot-type',
    assignees: ['person-1'],
    editable: true,
    line: 0,
    estimation: 2400,
    duration: 0,
    startDate: moment(start),
    endDate: moment(end),
    segments: []
  }
  task.segments = cuts.map(([from, to]) => piece(task, from, to))
  return task
}

// The three Animation tasks sit on one artist's row. SH010 is cut with a long
// gap through the middle of August, and SH020 falls entirely inside that gap,
// so nothing actually overlaps on screen.
const buildHierarchy = () => {
  const sh010 = buildTask('task-sh010', 'SH010', '2026-07-13', '2026-09-15', [
    ['2026-07-13', '2026-07-29'],
    ['2026-09-05', '2026-09-15']
  ])
  const sh020 = buildTask('task-sh020', 'SH020', '2026-08-13', '2026-08-18', [
    ['2026-08-13', '2026-08-15'],
    ['2026-08-18', '2026-08-18']
  ])
  const sh030 = buildTask('task-sh030', 'SH030', '2026-10-12', '2026-10-18')

  const childElement = {
    id: 'shot-type',
    object_id: 'shot-type',
    name: 'SQ01',
    color: '#888888',
    editable: true,
    man_days: 0,
    startDate: moment('2026-07-13'),
    endDate: moment('2026-10-18'),
    children: new Map([['person-1', [sh010, sh020, sh030]]])
  }
  ;[sh010, sh020, sh030].forEach(task => {
    task.parentElement = childElement
  })

  const rootElement = {
    id: 'task-type-1',
    name: 'Shot / Animation',
    color: '#888888',
    editable: true,
    expanded: true,
    loading: false,
    man_days: 0,
    daysOff: [],
    startDate: moment('2026-07-13'),
    endDate: moment('2026-10-18'),
    children: [childElement],
    people: { 'person-1': { id: 'person-1', full_name: 'Super Admin', daysOff: [] } }
  }
  childElement.parentElement = rootElement

  return { rootElement, sh010, sh020, sh030 }
}

// The page computes the lines by calling this after it expands a task type
// (see ProductionSchedule.vue `selectParentElement`), so the spec drives the
// same entry point rather than reaching for the internal helper.
const mountAndLayout = hierarchy => {
  const wrapper = mountSchedule(hierarchy)
  wrapper.vm.refreshItemPositions(hierarchy.rootElement)
  return wrapper
}

const mountSchedule = hierarchy =>
  mount(Schedule, {
    props: {
      startDate: moment('2026-07-05'),
      endDate: moment('2026-10-23'),
      hierarchy: [hierarchy.rootElement],
      zoomLevel: 1,
      subchildren: true,
      reassignable: true,
      withMilestones: false,
      isLoading: false
    },
    attachTo: document.body
  })

describe('Schedule widget - stacking cut bars on one person row', () => {
  // Stacking is what decides how tall the row is and how far down each bar is
  // drawn. A bar pushed onto a second line for no visible reason sits below its
  // own row's artist name, which reads as a bar belonging to nobody.
  test('keeps a task that fits inside a cut gap on the same line', () => {
    const hierarchy = buildHierarchy()
    const wrapper = mountAndLayout(hierarchy)

    expect(hierarchy.sh010.line).toBe(0)
    expect(hierarchy.sh020.line).toBe(0)
    expect(hierarchy.sh030.line).toBe(0)

    wrapper.unmount()
  })

  test('still stacks tasks whose pieces genuinely overlap', () => {
    const hierarchy = buildHierarchy()
    // move SH020 onto days SH010's first piece already covers
    hierarchy.sh020.startDate = moment('2026-07-20')
    hierarchy.sh020.endDate = moment('2026-07-22')
    hierarchy.sh020.segments = [
      piece(hierarchy.sh020, '2026-07-20', '2026-07-22')
    ]
    const wrapper = mountAndLayout(hierarchy)

    expect(hierarchy.sh010.line).toBe(0)
    expect(hierarchy.sh020.line).toBe(1)

    wrapper.unmount()
  })

  test('stacks uncut tasks by their own range as before', () => {
    const hierarchy = buildHierarchy()
    hierarchy.sh010.segments = []
    hierarchy.sh020.segments = []
    const wrapper = mountAndLayout(hierarchy)

    // SH020 sits inside SH010's uncut span, so it must still stack
    expect(hierarchy.sh010.line).toBe(0)
    expect(hierarchy.sh020.line).toBe(1)
    expect(hierarchy.sh030.line).toBe(0)

    wrapper.unmount()
  })
})
