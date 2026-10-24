<script lang="ts" setup>
import { onMounted, ref } from 'vue'

const localSayings = [
  { content: '路旁青衣树上斜，明眸杉影叹妃曦。落尽红樱君不见，轻绘梨花泪沾衣。待到海棠花如雪，来世仍为君倾心。', author: '上杉·绘梨衣', from: '《龙族3・黑月之潮》' },
  { content: '“04.24，和Sakura去东京天空树，世界上最暖和的地方在天空树的顶上。” “04.25，和Sakura去明治神宫，有人在那里举办婚礼。” “04.26，和Sakura去迪士尼，鬼屋很可怕，但是有Sakura在，所以不可怕。” “Sakura最好了。”', author: '上杉·绘梨衣', from: '《龙族3・黑月之潮》' },
  { content: '我们都是小怪兽，终有一天会被正义的奥特曼杀死。', author: '上杉·绘梨衣', from: '《龙族3・黑月之潮》' },
]

// A stable initial entry keeps server and client HTML identical.
const activeSayingIndex = ref(0)

onMounted(() => {
  activeSayingIndex.value = Math.floor(Math.random() * localSayings.length)
})
</script>

<template>
  <div class="say">
    <div
      v-for="(saying, index) in localSayings"
      :key="saying.content"
      class="say-entry"
      :class="{ 'is-active': index === activeSayingIndex }"
      :aria-hidden="index !== activeSayingIndex"
    >
      <span class="say-content">{{ saying.content }}</span>
      <span class="say-author">{{ saying.author }}</span>
      <span class="say-from">{{ saying.from }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.say {
  color: var(--va-c-text);
  display: grid;
  align-items: center;
  text-align: center;
  font-family: var(--va-font-serif);
  font-weight: bold;
  padding: 0.5rem;
  border-top: var(--va-border-width) solid var(--va-c-text-light);
  border-bottom: var(--va-border-width) solid var(--va-c-text-light);
}

.say-entry {
  // Overlapping entries reserve enough height for every random selection.
  grid-area: 1 / 1;
  visibility: hidden;
}

.say-entry.is-active {
  visibility: visible;
}

.say-content,
.say-author,
.say-from {
  display: block;
}

.say-author,
.say-from {
  margin-top: 0.5rem;
}
</style>
