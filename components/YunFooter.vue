<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import YunFooter from 'valaxy-theme-yun/components/YunFooter.vue'

const startTime = Date.parse('2024-07-28T10:00:00+08:00')
const elapsedSeconds = ref<number | null>(null)
const runningTime = computed(() => {
  const total = elapsedSeconds.value
  if (total === null)
    return null

  return {
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  }
})

function updateRunningTime() {
  elapsedSeconds.value = Math.max(0, Math.floor((Date.now() - startTime) / 1000))
}

let timer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  updateRunningTime()
  timer = setInterval(updateRunningTime, 1000)
})

onUnmounted(() => {
  if (timer !== undefined)
    clearInterval(timer)
})
</script>

<template>
  <YunFooter>
    <div class="statistics">
      本站已运行<span>{{ runningTime?.days ?? '—' }}</span>天<span>{{ runningTime?.hours ?? '—' }}</span>小时<span>{{ runningTime?.minutes ?? '—' }}</span>分钟<span>{{ runningTime?.seconds ?? '—' }}</span>秒
    </div>
  </YunFooter>
</template>

<style scoped>
.statistics span {
  display: inline-block;
  min-width: 30px;
  text-align: center;
}
</style>
