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
    startDate: moment('2026-08-15'),
    endDate: moment('2026-08-29')
  }
  task.segments = [
    {
      id: 'segment-1',
      start_date: '2026-08-15',
      end_date: '2026-08-19',
      startDate: moment('2026-08-15'),
      endDate: moment('2026-08-19'),
      editable: true,
      owner: task
    },
    {
      id: 'segment-2',
      start_date: '2026-08-24',
      end_date: '2026-08-29',
      startDate: moment('2026-08-24'),
      endDate: moment('2026-08-29'),
      editable: true,
      owner: task
    }
  ]

  const childElement = {
    id: 'asset-type-1',
    object_id: 'asset-type-1',
    name: 'Characters',
    color: '#888888',
    editable: true,
    man_days: 0,
    startDate: moment('2026-08-15'),
    endDate: moment('2026-08-29'),
    children: new Map([['person-1', [task]]])
  }
  task.parentElement = childElement

  const rootElement = {
    id: 'task-type-1',
    name: 'Asset / Modeling',
    color: '#888888',
    editable: true,
    expanded: true,
    loading: false,
    man_days: 0,
    daysOff: [],
    startDate: moment('2026-08-15'),
    endDate: moment('2026-08-29'),
    children: [childElement],
    people: { 'person-1': { id: 'person-1', daysOff: [] } }
  }
  childElement.parentElement = rootElement

  return { rootElement, childElement, task }
}

const mountSchedule = hierarchy =>
  mount(Schedule, {
    props: {
      startDate: moment('2026-07-05'),
      endDate: moment('2026-10-23'),
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

describe('Schedule widget - carrying a cut bar under a moved root bar', () => {
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
})
