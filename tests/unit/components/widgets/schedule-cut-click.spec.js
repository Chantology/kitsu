import { mount } from '@vue/test-utils'
import moment from 'moment'
import { vi } from 'vitest'

vi.mock('vuex', () => ({
  useStore: () => ({
    getters: {
      currentProduction: { id: 'production-1', name: 'Production' },
      dateFormat: 'YYYY-MM-DD',
      departmentMap: new Map(),
      isCurrentUserProductionManager: true,
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

const buildRootElement = () => ({
  id: 'task-type-1',
  name: 'Asset / Rigging',
  color: '#888888',
  editable: true,
  expanded: false,
  loading: false,
  man_days: 0,
  daysOff: [],
  startDate: moment('2026-08-15'),
  endDate: moment('2026-08-29'),
  children: []
})

const mountSchedule = (rootElement, cutMode) =>
  mount(Schedule, {
    props: {
      startDate: moment('2026-07-05'),
      endDate: moment('2026-10-23'),
      hierarchy: [rootElement],
      zoomLevel: 1,
      cutMode,
      withMilestones: false,
      isLoading: false
    },
    // The root and child links are v-if'd out (the fixture carries no route),
    // yet Vue still resolves router-link at the top of the render fn.
    global: { stubs: { RouterLink: true } },
    attachTo: document.body
  })

// Mirrors what a real browser does: mousedown then mouseup on the same
// element still dispatches a trailing click, drag or not.
const dragBar = async (wrapper, bar, fromX, toX) => {
  await bar.trigger('mousedown', { clientX: fromX })
  document.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, clientX: toX })
  )
  document.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, clientX: toX })
  )
  bar.element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: toX })
  )
  await wrapper.vm.$nextTick()
}

describe('Schedule widget - clicking a bar with the cut tool armed', () => {
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

  test('cuts the bar instead of selecting it', async () => {
    const rootElement = buildRootElement()
    const wrapper = mountSchedule(rootElement, true)

    const bar = wrapper.find('.timebar-center')
    await dragBar(wrapper, bar, 500, 500)

    const cuts = wrapper.emitted('bar-cut')
    expect(cuts).toHaveLength(1)
    // the payload arrives as the reactive proxy of the fixture
    expect(cuts[0][0].id).toBe(rootElement.id)
    // the day the cursor sat on, at 20px per day from 2026-07-05
    expect(cuts[0][1]).toBe('2026-07-29')
    expect(wrapper.emitted('root-element-selected')).toBeFalsy()

    wrapper.unmount()
  })

  test('selects rather than cuts while the tool is not armed', async () => {
    const rootElement = buildRootElement()
    const wrapper = mountSchedule(rootElement, false)

    const bar = wrapper.find('.timebar-center')
    await dragBar(wrapper, bar, 500, 500)

    expect(wrapper.emitted('bar-cut')).toBeFalsy()
    expect(wrapper.emitted('root-element-selected')).toBeTruthy()

    wrapper.unmount()
  })

  test('cuts rather than dragging the bar it presses on', async () => {
    const rootElement = buildRootElement()
    const wrapper = mountSchedule(rootElement, true)

    const bar = wrapper.find('.timebar-center')
    await dragBar(wrapper, bar, 500, 560)

    // the press never starts a move, so the bar keeps its dates and the
    // gesture reads as a plain cut on the day it started from
    expect(rootElement.startDate.isSame(moment('2026-08-15'))).toBe(true)
    expect(wrapper.emitted('bar-cut')).toHaveLength(1)

    wrapper.unmount()
  })

  // A drag released with the cursor off the bar fires no trailing click, so
  // the flag that suppresses a drag's own click stays armed. The next cut
  // must not be the click that gets suppressed: the tool would appear dead
  // for one press, with nothing shown to the user.
  test('cuts on the first click after a drag released off the bar', async () => {
    const rootElement = buildRootElement()
    const wrapper = mountSchedule(rootElement, false)

    const bar = wrapper.find('.timebar-center')
    await bar.trigger('mousedown', { clientX: 500 })
    document.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 560 })
    )
    document.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, clientX: 560 })
    )
    await wrapper.vm.$nextTick()

    await wrapper.setProps({ cutMode: true })
    await dragBar(wrapper, bar, 600, 600)

    expect(wrapper.emitted('bar-cut')).toHaveLength(1)

    wrapper.unmount()
  })
})
