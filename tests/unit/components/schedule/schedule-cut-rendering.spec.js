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

// One sequence row with one artist under it. Both the sequence bar and the
// task bar carry two pieces, so a row drawing one bar per item instead of
// one per piece shows up as a missing bar rather than a wrong position.
const buildHierarchy = ({ cutEntity = true, cutTask = true } = {}) => {
  const task = buildTask(
    'task-sh010',
    'SH010',
    '2026-07-13',
    '2026-09-15',
    cutTask
      ? [
          ['2026-07-13', '2026-07-29'],
          ['2026-09-05', '2026-09-15']
        ]
      : []
  )

  const childElement = {
    id: 'shot-type',
    object_id: 'shot-type',
    name: 'SQ01',
    color: '#888888',
    editable: true,
    man_days: 0,
    startDate: moment('2026-07-13'),
    endDate: moment('2026-09-15'),
    children: new Map([['person-1', [task]]]),
    segments: []
  }
  if (cutEntity) {
    childElement.segments = [
      piece(childElement, '2026-07-13', '2026-07-29'),
      piece(childElement, '2026-09-05', '2026-09-15')
    ]
  }
  task.parentElement = childElement

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
    endDate: moment('2026-09-15'),
    children: [childElement],
    people: {
      'person-1': { id: 'person-1', full_name: 'Super Admin', daysOff: [] }
    }
  }
  childElement.parentElement = rootElement

  return { rootElement, childElement, task }
}

const mountSchedule = (hierarchy, props = {}) =>
  mount(Schedule, {
    props: {
      startDate: moment('2026-07-05'),
      endDate: moment('2026-10-23'),
      hierarchy: [hierarchy.rootElement],
      zoomLevel: 1,
      subchildren: true,
      reassignable: true,
      withMilestones: false,
      isLoading: false,
      ...props
    },
    attachTo: document.body,
    global: { stubs: { RouterLink: true } }
  })

const entityBars = wrapper =>
  wrapper.findAll('.entity-line .child-bars > .timebar')

const personBars = wrapper => wrapper.findAll('.subchild > .timebar')

describe('Schedule widget - drawing a cut bar', () => {
  test('draws one piece per cut on the entity row', () => {
    const wrapper = mountSchedule(buildHierarchy())

    expect(entityBars(wrapper)).toHaveLength(2)
    expect(entityBars(wrapper)[0].classes()).toContain('timebar-cut')

    wrapper.unmount()
  })

  test('draws one piece per cut on the person row', () => {
    const wrapper = mountSchedule(buildHierarchy())

    expect(personBars(wrapper)).toHaveLength(2)
    expect(personBars(wrapper)[0].classes()).toContain('timebar-cut')
    // only the first piece carries the name, so a cut bar is not labelled twice
    expect(personBars(wrapper)[0].text()).toBe('SH010')
    expect(personBars(wrapper)[1].text()).toBe('')

    wrapper.unmount()
  })

  test('draws a single bar per row while nothing is cut', () => {
    const wrapper = mountSchedule(
      buildHierarchy({ cutEntity: false, cutTask: false })
    )

    expect(entityBars(wrapper)).toHaveLength(1)
    expect(personBars(wrapper)).toHaveLength(1)
    expect(entityBars(wrapper)[0].classes()).not.toContain('timebar-cut')
    expect(wrapper.findAll('.cut-gap-catcher')).toHaveLength(0)

    wrapper.unmount()
  })

  // The gaps a cut opens have no bar to click on: the catcher is what gives
  // the cut tool something to hit there, and it only exists while cutting.
  test('lays a catcher over each row with the cut tool armed', () => {
    const wrapper = mountSchedule(buildHierarchy(), { cutMode: true })

    expect(wrapper.findAll('.cut-gap-catcher').length).toBeGreaterThanOrEqual(3)

    wrapper.unmount()
  })
})
