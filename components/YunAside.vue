<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore, useFrontmatter } from 'valaxy'

const frontmatter = useFrontmatter()
const { t } = useI18n()
const app = useAppStore()
const toggleButton = ref<HTMLButtonElement>()
const aside = ref<HTMLElement>()
// Keep initial server/client markup identical; CSS handles the first viewport.
const isDesktop = ref(true)
let desktopQuery: MediaQueryList | undefined

function closeSidebar(restoreFocus = true) {
  app.toggleRightSidebar(false)
  if (restoreFocus)
    toggleButton.value?.focus({ preventScroll: true })
}

async function toggleSidebar() {
  if (app.isRightSidebarOpen) {
    closeSidebar()
    return
  }
  app.toggleRightSidebar(true)
  await nextTick()
  const firstLink = aside.value?.querySelector<HTMLAnchorElement>('.outline-link')
  ;(firstLink || aside.value)?.focus({ preventScroll: true })
}

function handleOutlineClick(event: MouseEvent) {
  if (isDesktop.value || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return

  const target = event.target as Element | null
  const link = target?.closest?.('a.outline-link[href]') as HTMLAnchorElement | null
  if (!link)
    return

  closeSidebar(false)
  try {
    const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)))
    if (heading) {
      if (!heading.hasAttribute('tabindex'))
        heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }
  catch {
    // Leave malformed author-provided hashes to normal link navigation.
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !isDesktop.value && app.isRightSidebarOpen) {
    event.preventDefault()
    closeSidebar()
  }
}

function updateViewport() {
  isDesktop.value = desktopQuery?.matches ?? true
  if (isDesktop.value)
    closeSidebar(false)
}

onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 1280px)')
  updateViewport()
  desktopQuery.addEventListener('change', updateViewport)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  desktopQuery?.removeEventListener('change', updateViewport)
  document.removeEventListener('keydown', handleKeydown)
  app.toggleRightSidebar(false)
})
</script>

<template>
  <button
    ref="toggleButton"
    type="button"
    class="xl:hidden toc-btn shadow fixed yun-icon-btn"
    opacity="75" right="2" bottom="19"
    :aria-label="t('sidebar.toc')"
    :title="t('sidebar.toc')"
    aria-controls="article-toc"
    :aria-expanded="app.isRightSidebarOpen"
    @click="toggleSidebar"
  >
    <div i-ri-file-list-line aria-hidden="true" />
  </button>

  <ValaxyOverlay class="xl:hidden" :show="app.isRightSidebarOpen" @click="closeSidebar()" />

  <aside
    id="article-toc"
    ref="aside"
    class="va-card yun-aside"
    :class="app.isRightSidebarOpen && 'open'"
    :aria-label="t('sidebar.toc')"
    :aria-hidden="!isDesktop && !app.isRightSidebarOpen"
    :inert="!isDesktop && !app.isRightSidebarOpen"
    tabindex="-1"
    m="l-4" text="center" overflow="auto"
    @click="handleOutlineClick"
  >
    <div class="aside-container" flex="~ col">
      <h2 v-if="frontmatter.toc !== false" m="t-6 b-2" font="serif black">
        {{ t('sidebar.toc') }}
      </h2>
      <YunOutline v-if="frontmatter.toc !== false" />
      <div class="flex-grow" />
      <div v-if="$slots.default" class="custom-container">
        <slot />
      </div>
    </div>
  </aside>
</template>

<style lang="scss">
@use 'valaxy/client/styles/mixins/index.scss' as *;

.yun-aside {
  display: none;
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(var(--va-sidebar-width, 300px), calc(100vw - 48px));
  transition: box-shadow var(--va-transition-duration), background-color var(--va-transition-duration);

  &.open {
    display: block;
    z-index: var(--yun-z-sidebar, 10);
  }
}

@include screen('xl') {
  .yun-aside {
    display: block;
  }
}

.toc-btn {
  color: var(--va-c-primary);
  background-color: var(--va-c-bg-light);
  // Keep the same toggle reachable above both the drawer and its backdrop.
  z-index: calc(var(--yun-z-sidebar, 10) + 1);
}
</style>
