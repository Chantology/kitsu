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

// A cut bar is drawn as one piece per segment and each piece is dragged on
// its own. A piece is not a task: it carries its own dates plus a link back
// to the task that owns it, and none of the task's own fields.
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
  const piece = {
    id: 'segment-2',
    start_date: '2026-08-24',
    end_date: '2026-08-29',
    startDate: moment('2026-08-24'),
    endDate: moment('2026-08-29'),
    editable: true,
    owner: task
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
    piece
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

  return { rootElement, childElement, task, piece }
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

// The document-level move listener reads the element under the cursor, so the
// event has to come from the row the bar is being dragged along rather than
// from the document itself.
const dragOver = (element, clientX) =>
  element.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, clientX })
  )

describe('Schedule widget - dragging a bar on a reassignable row', () => {
  let rafSpy

  beforeEach(() => {
    // the drag is throttled through requestAnimationFrame, which never fires
    // on its own in jsdom
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

  test('moves a piece of a cut bar along its own person row', async () => {
    const hierarchy = buildHierarchy()
    const wrapper = mountSchedule(hierarchy)

    const row = wrapper.find('.subchild')
    expect(row.classes()).toContain('drop-item-target')

    const pieces = wrapper.findAll('.subchildren .subchild .timebar')
    expect(pieces).toHaveLength(2)

    await pieces[1].find('.timebar-center').trigger('mousedown', {
      clientX: 500
    })
    dragOver(row.element, 600)

    expect(hierarchy.piece.startDate.isAfter(moment('2026-08-24'))).toBe(true)
    expect(hierarchy.piece.endDate.isAfter(moment('2026-08-29'))).toBe(true)

    wrapper.unmount()
  })

  test('still refuses to reassign a whole task onto a foreign row', async () => {
    const hierarchy = buildHierarchy()
    hierarchy.task.segments = []
    const wrapper = mountSchedule(hierarchy)

    const row = wrapper.find('.subchild')
    row.element.dataset.entityTypeId = 'another-asset-type'
    row.element.dataset.personId = 'person-2'

    const bar = wrapper.find('.subchildren .subchild .timebar')
    await bar.find('.timebar-center').trigger('mousedown', { clientX: 500 })
    dragOver(row.element, 600)

    expect(hierarchy.task.startDate.isSame(moment('2026-08-15'))).toBe(true)
    expect(hierarchy.task.endDate.isSame(moment('2026-08-29'))).toBe(true)

    wrapper.unmount()
  })
})
