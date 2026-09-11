import { mount } from '@vue/test-utils'
import moment from 'moment'
import { vi } from 'vitest'

// Importing the page reaches the store's own module graph, which cannot be
// built here, so vuex is stubbed whole: the page is only imported for its
// methods and never mounted.
vi.mock('vuex', () => ({
  createStore: () => ({
    getters: {},
    dispatch: vi.fn(),
    commit: vi.fn(),
    watch: vi.fn(),
    subscribe: vi.fn()
  }),
  mapGetters: () => ({}),
  mapActions: () => ({}),
  mapState: () => ({}),
  mapMutations: () => ({}),
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
import ProductionSchedule from '@/components/pages/ProductionSchedule.vue'

// The fit runs on the page, off the widget's item-changed event, so the spec
// hands that event to the page's real handler. Every page method is bound to a
// bare object, which keeps the wiring and the logic under test while leaving
// out the store, the router and the rest of the page. Only the calls that
// would persist the change are replaced, and they are put on afterwards so a
// method added to the page later cannot quietly go unbound: reaching an
// unbound one throws inside an async handler, where the rejection is lost and
// the test reads as a plain wrong answer.
const STUBBED = [
  'updateScheduleItem',
  'updateScheduleSegment',
  'saveTaskChanged',
  'updateTask'
]

const buildPage = () => {
  const page = {}
  Object.entries(ProductionSchedule.methods).forEach(([name, method]) => {
    page[name] = method.bind(page)
  })
  STUBBED.forEach(name => {
    page[name] = vi.fn()
  })
  return page
}

const buildTask = (id, shotName, start, end) => ({
  id,
  type: 'Task',
  name: 'Animation',
  entity: { name: shotName },
  entity_id: `entity-${id}`,
  entity_type_id: 'shot-type',
  assignees: ['person-1'],
  editable: true,
  line: 0,
  estimation: 4800,
  duration: 0,
  startDate: moment(start),
  endDate: moment(end),
  segments: []
})

// A department bar deliberately drafted wider than the work inside it, so a
// fit that reaches the wrong edge is visible as the draft collapsing.
const buildHierarchy = (tasks = [buildTask('task-1', 'SH010', '2026-08-25', '2026-09-20')]) => {
  const childElement = {
    id: 'shot-type',
    object_id: 'shot-type',
    name: 'SQ01',
    color: '#888888',
    editable: true,
    man_days: 0,
    startDate: moment('2026-08-01'),
    endDate: moment('2026-10-01'),
    children: new Map([['person-1', tasks]])
  }
  tasks.forEach(task => {
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
    startDate: moment('2026-08-01'),
    endDate: moment('2026-10-01'),
    children: [childElement],
    people: { 'person-1': { id: 'person-1', full_name: 'Jane', daysOff: [] } }
  }
  childElement.parentElement = rootElement

  return { rootElement, childElement, tasks }
}

// A department cut into three blocks of work. The first stands for the start
// of the department's own work and has no task under it yet, which is the case
// that a fit reaching for the outermost piece gets wrong.
const buildCutDepartment = () => {
  const task = buildTask('task-sh040', 'SH040', '2026-08-25', '2026-09-05')
  const hierarchy = buildHierarchy([task])
  const { rootElement, childElement } = hierarchy

  childElement.startDate = moment('2026-08-20')
  childElement.endDate = moment('2026-09-15')
  rootElement.startDate = moment('2026-07-06')
  rootElement.endDate = moment('2026-10-15')
  rootElement.segments = [
    ['2026-07-06', '2026-07-10'],
    ['2026-08-20', '2026-09-15'],
    ['2026-10-05', '2026-10-15']
  ].map(([start, end], index) => ({
    id: `segment-${index}`,
    start_date: start,
    end_date: end,
    startDate: moment(start),
    endDate: moment(end),
    editable: true,
    owner: rootElement
  }))

  return { ...hierarchy, task, segments: rootElement.segments }
}

const cutInto = (task, ranges) => {
  task.segments = ranges.map(([start, end], index) => ({
    id: `${task.id}-piece-${index}`,
    start_date: start,
    end_date: end,
    startDate: moment(start),
    endDate: moment(end),
    editable: true,
    owner: task
  }))
  task.startDate = moment(ranges[0][0])
  task.endDate = moment(ranges[ranges.length - 1][1])
  return task
}

// The state that was misbehaving in the app: a department cut into blocks of
// work, and a cut task whose two pieces sit in two different blocks. Dragging
// one piece about inside its own block leaves the task's overall span alone,
// which is what used to read as "no move" and stop anything from following.
const buildCutTaskInCutDepartment = () => {
  const task = cutInto(buildTask('task-sh040', 'SH040', '2026-08-10', '2026-09-10'), [
    ['2026-08-10', '2026-08-16'],
    ['2026-09-02', '2026-09-10']
  ])
  const hierarchy = buildHierarchy([task])
  const { rootElement, childElement } = hierarchy

  childElement.startDate = moment('2026-08-10')
  childElement.endDate = moment('2026-10-12')
  rootElement.startDate = moment('2026-07-21')
  rootElement.endDate = moment('2026-10-18')
  rootElement.segments = [
    ['2026-07-21', '2026-07-31'],
    ['2026-08-10', '2026-08-26'],
    ['2026-08-31', '2026-09-10'],
    ['2026-09-21', '2026-10-18']
  ].map(([start, end], index) => ({
    id: `department-piece-${index}`,
    start_date: start,
    end_date: end,
    startDate: moment(start),
    endDate: moment(end),
    editable: true,
    owner: rootElement
  }))

  return { ...hierarchy, task, segments: rootElement.segments }
}

const mountSchedule = (hierarchy, page) =>
  mount(Schedule, {
    props: {
      startDate: moment('2026-07-05'),
      endDate: moment('2026-10-23'),
      hierarchy: [hierarchy.rootElement],
      zoomLevel: 1,
      subchildren: true,
      reassignable: true,
      clipChildren: true,
      withMilestones: false,
      isLoading: false,
      onItemChanged: item => page.onScheduleItemChanged(item)
    },
    attachTo: document.body
  })

// The document-level listeners read the element under the cursor, so the move
// has to come from the row the bar is dragged along, and the drop has to carry
// a different x than the press or the widget treats it as a click.
const dragTaskBy = async (wrapper, barIndex, deltaX) => {
  const row = wrapper.find('.subchild')
  const bars = wrapper.findAll('.subchildren .subchild .timebar')
  await bars[barIndex].find('.timebar-center').trigger('mousedown', {
    clientX: 500
  })
  row.element.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, clientX: 500 + deltaX })
  )
  document.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, clientX: 500 + deltaX })
  )
  await wrapper.vm.$nextTick()
  // saving a piece is async, and the fit runs after the save resolves
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('Schedule page - fitting a parent bar to the child that moved', () => {
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

  test('leaves a drafted start alone while a task move stays inside it', async () => {
    const page = buildPage()
    const hierarchy = buildHierarchy()
    const wrapper = mountSchedule(hierarchy, page)
    const [task] = hierarchy.tasks

    await dragTaskBy(wrapper, 0, -120)

    // the drop really did reach the page, rather than the fit being skipped
    expect(page.saveTaskChanged).toHaveBeenCalledWith(task)
    expect(task.startDate.isBefore(moment('2026-08-25'))).toBe(true)
    // still inside the drafted department - only a drag that actually
    // crosses the drafted edge is allowed to move it
    expect(task.startDate.isAfter(moment('2026-08-01'))).toBe(true)
    expect(hierarchy.childElement.startDate.isSame(moment('2026-08-01'))).toBe(
      true
    )
    expect(hierarchy.rootElement.startDate.isSame(moment('2026-08-01'))).toBe(
      true
    )

    wrapper.unmount()
  })

  test('pulls the drafted start out once a task drag actually crosses it', async () => {
    const page = buildPage()
    const hierarchy = buildHierarchy()
    const wrapper = mountSchedule(hierarchy, page)
    const [task] = hierarchy.tasks

    // far enough left to pass the drafted start (2026-08-01)
    await dragTaskBy(wrapper, 0, -600)

    expect(task.startDate.isBefore(moment('2026-08-01'))).toBe(true)
    expect(hierarchy.childElement.startDate.isSame(task.startDate)).toBe(true)
    expect(hierarchy.rootElement.startDate.isSame(task.startDate)).toBe(true)
    expect(hierarchy.childElement.endDate.isSame(moment('2026-10-01'))).toBe(
      true
    )
    expect(hierarchy.rootElement.endDate.isSame(moment('2026-10-01'))).toBe(
      true
    )

    wrapper.unmount()
  })

  test('leaves a drafted end alone while a task move stays inside it', async () => {
    const page = buildPage()
    const hierarchy = buildHierarchy()
    const wrapper = mountSchedule(hierarchy, page)
    const [task] = hierarchy.tasks

    await dragTaskBy(wrapper, 0, 120)

    expect(task.endDate.isAfter(moment('2026-09-20'))).toBe(true)
    expect(task.endDate.isBefore(moment('2026-10-01'))).toBe(true)
    expect(hierarchy.childElement.endDate.isSame(moment('2026-10-01'))).toBe(
      true
    )
    expect(hierarchy.rootElement.endDate.isSame(moment('2026-10-01'))).toBe(
      true
    )

    wrapper.unmount()
  })

  test('pushes the drafted end out once a task drag actually crosses it', async () => {
    const page = buildPage()
    const hierarchy = buildHierarchy()
    const wrapper = mountSchedule(hierarchy, page)
    const [task] = hierarchy.tasks

    // far enough right to pass the drafted end (2026-10-01)
    await dragTaskBy(wrapper, 0, 300)

    expect(task.endDate.isAfter(moment('2026-10-01'))).toBe(true)
    expect(hierarchy.childElement.endDate.isSame(task.endDate)).toBe(true)
    expect(hierarchy.rootElement.endDate.isSame(task.endDate)).toBe(true)
    expect(hierarchy.childElement.startDate.isSame(moment('2026-08-01'))).toBe(
      true
    )
    expect(hierarchy.rootElement.startDate.isSame(moment('2026-08-01'))).toBe(
      true
    )

    wrapper.unmount()
  })

  test('leaves the piece a task works in alone while the drag stays inside it', async () => {
    const page = buildPage()
    const hierarchy = buildCutDepartment()
    const [leading, working, trailing] = hierarchy.segments

    const wrapper = mountSchedule(hierarchy, page)

    await dragTaskBy(wrapper, 0, -60)

    expect(hierarchy.task.startDate.isBefore(moment('2026-08-25'))).toBe(true)
    // still inside the piece's own drafted start (2026-08-20)
    expect(working.startDate.isSame(moment('2026-08-20'))).toBe(true)
    // the block of work that has no task under it must not be touched
    expect(leading.startDate.isSame(moment('2026-07-06'))).toBe(true)
    expect(leading.endDate.isSame(moment('2026-07-10'))).toBe(true)
    expect(trailing.startDate.isSame(moment('2026-10-05'))).toBe(true)
    expect(trailing.endDate.isSame(moment('2026-10-15'))).toBe(true)

    wrapper.unmount()
  })

  test('pulls a piece start out once the task drag actually crosses it', async () => {
    const page = buildPage()
    const hierarchy = buildCutDepartment()
    const [leading, working, trailing] = hierarchy.segments

    const wrapper = mountSchedule(hierarchy, page)

    // far enough left to pass the piece's own drafted start (2026-08-20)
    await dragTaskBy(wrapper, 0, -300)

    expect(hierarchy.task.startDate.isBefore(moment('2026-08-20'))).toBe(true)
    expect(working.startDate.isSame(hierarchy.task.startDate)).toBe(true)
    expect(leading.startDate.isSame(moment('2026-07-06'))).toBe(true)
    expect(leading.endDate.isSame(moment('2026-07-10'))).toBe(true)
    expect(trailing.startDate.isSame(moment('2026-10-05'))).toBe(true)
    expect(trailing.endDate.isSame(moment('2026-10-15'))).toBe(true)

    wrapper.unmount()
  })

  test('holds a piece clear of its neighbour when the task runs into it', async () => {
    const page = buildPage()
    const hierarchy = buildCutDepartment()
    const [, working, trailing] = hierarchy.segments

    const wrapper = mountSchedule(hierarchy, page)

    // far enough right that the task passes the start of the next piece
    await dragTaskBy(wrapper, 0, 700)

    expect(hierarchy.task.endDate.isAfter(trailing.startDate)).toBe(true)
    expect(working.endDate.isBefore(trailing.startDate)).toBe(true)
    expect(trailing.startDate.isSame(moment('2026-10-05'))).toBe(true)

    wrapper.unmount()
  })

  test('leaves the block of work a cut piece belongs to alone while the drag stays inside it', async () => {
    const page = buildPage()
    const hierarchy = buildCutTaskInCutDepartment()
    const wrapper = mountSchedule(hierarchy, page)
    const [early, working, third, last] = hierarchy.segments
    const [firstPiece] = hierarchy.task.segments

    // drag the task's first piece later, staying inside its own block of work
    await dragTaskBy(wrapper, 0, 60)

    // the task's overall span is untouched, which is what used to hide the move
    expect(hierarchy.task.endDate.isSame(moment('2026-09-10'))).toBe(true)
    expect(firstPiece.endDate.isAfter(moment('2026-08-16'))).toBe(true)

    // still inside the block's own drafted end (2026-08-26)
    expect(working.endDate.isSame(moment('2026-08-26'))).toBe(true)
    // and no other block is touched
    expect(early.startDate.isSame(moment('2026-07-21'))).toBe(true)
    expect(early.endDate.isSame(moment('2026-07-31'))).toBe(true)
    expect(third.startDate.isSame(moment('2026-08-31'))).toBe(true)
    expect(last.endDate.isSame(moment('2026-10-18'))).toBe(true)

    wrapper.unmount()
  })

  test('pushes the block of work a cut piece belongs to out once the drag actually crosses it', async () => {
    const page = buildPage()
    const hierarchy = buildCutTaskInCutDepartment()
    const wrapper = mountSchedule(hierarchy, page)
    const [early, working, third, last] = hierarchy.segments
    const [firstPiece] = hierarchy.task.segments

    // far enough right to pass the block's own drafted end (2026-08-26)
    await dragTaskBy(wrapper, 0, 260)

    expect(hierarchy.task.endDate.isSame(moment('2026-09-10'))).toBe(true)
    expect(firstPiece.endDate.isAfter(moment('2026-08-26'))).toBe(true)
    expect(working.endDate.isSame(firstPiece.endDate)).toBe(true)
    expect(early.startDate.isSame(moment('2026-07-21'))).toBe(true)
    expect(early.endDate.isSame(moment('2026-07-31'))).toBe(true)
    expect(third.startDate.isSame(moment('2026-08-31'))).toBe(true)
    expect(last.endDate.isSame(moment('2026-10-18'))).toBe(true)

    wrapper.unmount()
  })

  test('fits a crossed drafted start to the earliest sibling, not just the dragged task', async () => {
    const page = buildPage()
    const early = buildTask('task-early', 'SH005', '2026-07-20', '2026-07-24')
    const moved = buildTask('task-moved', 'SH010', '2026-08-25', '2026-09-20')
    const hierarchy = buildHierarchy([early, moved])
    const wrapper = mountSchedule(hierarchy, page)

    // past the drafted start (2026-08-01), but not past the sibling
    // that already starts before it (2026-07-20)
    await dragTaskBy(wrapper, 1, -560)

    expect(moved.startDate.isBefore(moment('2026-08-01'))).toBe(true)
    expect(moved.startDate.isAfter(early.startDate)).toBe(true)
    expect(hierarchy.rootElement.startDate.isSame(early.startDate)).toBe(true)

    wrapper.unmount()
  })
})
