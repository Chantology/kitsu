<template>
  <div
    class="subchild"
    :class="{ 'drop-item-target': reassignable }"
    :style="{ height: `${40 * getNbLines(tasks)}px` }"
    :data-entity-type-id="childElement.object_id"
    :data-person-id="personId"
  >
    <div
      class="day-off"
      :key="`dayoff-${dayOff.id}-${index}`"
      :style="dayOffStyle(dayOff)"
      :title="dayOff.description"
      v-for="(dayOff, index) in daysOffRange"
    >
      <briefcase-icon class="day-off-icon" :size="14" />
    </div>
    <template :key="index" v-for="(task, index) in tasks">
      <div
        class="cut-gap-catcher"
        :style="cutGapCatcherStyle(task, 5 + 38 * lineOf(tasks, task), 34)"
        @click="$emit('bar-cut', task, $event)"
        v-if="cutMode"
      ></div>
      <div
        class="timebar"
        :class="{
          selected: isSelected(bar),
          'timebar-cut': isCut(task)
        }"
        :key="barIndex"
        :style="
          timebarSubchildStyle(
            bar,
            rootElement,
            task,
            isSelected(bar),
            lineOf(tasks, task)
          )
        "
        :title="timebarSubchildTitle(task, bar)"
        v-for="(bar, barIndex) in getBars(task)"
      >
        <div
          class="timebar-left-hand"
          @mousedown="$emit('left-handle-down', bar, $event)"
          @touchstart="$emit('left-handle-down', bar, $event)"
          v-if="hasHandles(task, bar)"
        ></div>
        <div
          class="timebar-center ellipsis"
          role="button"
          tabindex="0"
          @mousedown="$emit('bar-down', bar, $event)"
          @touchstart="$emit('bar-down', bar, $event)"
          @click="$emit('bar-click', task, $event)"
          @keydown.enter.prevent="$emit('bar-enter', task)"
        >
          {{ barIndex === 0 ? task.entity.name : '' }}
        </div>
        <div
          class="timebar-right-hand"
          @mousedown="$emit('right-handle-down', bar, $event)"
          @touchstart="$emit('right-handle-down', bar, $event)"
          v-if="hasHandles(task, bar)"
        ></div>
      </div>
    </template>
  </div>
</template>

<script setup>
/*
 * One person row of the schedule widget: the task bars of one assignee
 * under an entity row. A component of its own so a frame of drag or a
 * selection change re-renders this row alone, not every bar of the
 * schedule. The geometry helpers stay in Schedule.vue (they read its zoom
 * and date range) and come in through its scheduleRowHelpers injection;
 * the selection comes in as the ids of this row only, so the rows of the
 * other people never follow it.
 */
import { BriefcaseIcon } from 'lucide-vue-next'
import { computed, inject } from 'vue'

// Props / Emits
// --------------------------------------------------------------------------
const props = defineProps({
  personId: { type: String, default: '' },
  tasks: { type: Array, default: () => [] },
  rootElement: { type: Object, default: () => ({}) },
  childElement: { type: Object, default: () => ({}) },
  daysOffRange: { type: Array, default: () => [] },
  reassignable: { type: Boolean, default: false },
  cutMode: { type: Boolean, default: false },
  // ids of the selected tasks of this row, comma separated
  selectedKey: { type: String, default: '' },
  withHandles: { type: Boolean, default: false }
})

defineEmits([
  'bar-click',
  'bar-cut',
  'bar-down',
  'bar-enter',
  'left-handle-down',
  'right-handle-down'
])

const {
  cutGapCatcherStyle,
  dayOffStyle,
  getBars,
  getNbLines,
  isCut,
  lineOf,
  timebarSubchildStyle,
  timebarSubchildTitle
} = inject('scheduleRowHelpers')

// Computed
// --------------------------------------------------------------------------
const selectedIds = computed(
  () => new Set(props.selectedKey.split(',').filter(Boolean))
)

// Functions
// --------------------------------------------------------------------------
const isSelected = task => selectedIds.value.has(task.id)

const hasHandles = (task, bar = task) =>
  props.withHandles && isSelected(bar) && task.editable && !task.unresizable
</script>
