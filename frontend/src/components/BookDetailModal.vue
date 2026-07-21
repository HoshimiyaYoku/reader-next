<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modelValue" class="modal-overlay" @click="close"></div>
    </Transition>
    <Transition name="scale">
      <div v-if="modelValue && book" class="modal-container" @click.self="close">
        <div class="detail-modal">
          <button class="modal-close" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <!-- Book Header -->
          <div class="book-header">
            <div class="book-cover-lg">
              <img
                v-if="coverSrc"
                :src="coverSrc"
                :alt="displayName"
                @error="coverFailed = true"
              />
              <div v-else class="cover-placeholder-lg">
                <span>{{ displayName }}</span>
              </div>
            </div>
            <div class="book-header-info">
              <h2>{{ displayName }}</h2>
              <p class="author">{{ book.author || '未知作者' }}</p>
              <div class="book-tags">
                <span v-if="book.kind" class="tag">{{ book.kind }}</span>
                <span v-if="(book as Book).totalChapterNum" class="tag">共{{ (book as Book).totalChapterNum }}章</span>
                <span v-if="(book as Book).originName" class="tag origin">{{ (book as Book).originName }}</span>
              </div>
              <p v-if="(book as Book).durChapterTitle" class="progress">
                已读至：{{ (book as Book).durChapterTitle }}
              </p>
            </div>
          </div>

          <div v-if="isLocal" class="local-book-tools">
            <div class="local-tool-row">
              <strong>本地书籍</strong>
              <button type="button" class="tool-btn" @click="editingName = !editingName">
                重命名
              </button>
              <button type="button" class="tool-btn" :disabled="coverSearching" @click="searchCovers">
                {{ coverSearching ? '搜索中…' : '搜索封面' }}
              </button>
              <button type="button" class="tool-btn" @click="coverFileInput?.click()">
                上传封面
              </button>
              <input
                ref="coverFileInput"
                class="file-input"
                type="file"
                accept="image/*"
                @change="uploadCover"
              />
            </div>
            <form v-if="editingName" class="rename-form" @submit.prevent="renameLocalBook">
              <input v-model="nameDraft" maxlength="120" aria-label="书名" />
              <button type="submit" class="tool-btn primary" :disabled="savingLocalBook">保存</button>
              <button type="button" class="tool-btn" @click="editingName = false">取消</button>
            </form>
            <div v-if="coverCandidates.length" class="cover-candidates">
              <button
                v-for="candidate in coverCandidates"
                :key="candidate.coverUrl"
                type="button"
                class="cover-candidate"
                :title="`${candidate.name} · ${candidate.author || '未知作者'}`"
                @click="selectCover(candidate.coverUrl)"
              >
                <img :src="getCoverUrl(candidate.coverUrl)" :alt="candidate.name" />
              </button>
            </div>
          </div>

          <!-- Intro -->
          <div v-if="book.intro" class="book-intro">
            <h3>简介</h3>
            <p>{{ book.intro }}</p>
          </div>

          <!-- Chapters -->
          <div class="chapter-section" v-if="chapters.length > 0">
            <h3>目录 ({{ chapters.length }})</h3>
            <div class="chapter-list">
              <div
                v-for="(chapter, i) in displayChapters"
                :key="chapter.url"
                class="chapter-item"
                :class="{ current: i === (book as Book).durChapterIndex }"
                @click="readChapter(i)"
              >
                <span class="chapter-index">{{ i + 1 }}</span>
                <span class="chapter-title">{{ chapter.title }}</span>
              </div>
            </div>
            <button
              v-if="chapters.length > 50 && !showAllChapters"
              class="show-more-btn"
              @click="showAllChapters = true"
            >
              显示全部 {{ chapters.length }} 章
            </button>
          </div>
          <div v-else-if="chaptersLoading" class="chapter-loading">
            <div class="loading-spinner"></div>
            加载目录中...
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button class="action-btn primary" @click="startReading">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              {{ (book as Book).durChapterIndex ? '继续阅读' : '开始阅读' }}
            </button>
            <button class="action-btn" @click="openAiBook">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M12 2v4" />
                <path d="M12 18v4" />
                <path d="M2 12h4" />
                <path d="M18 12h4" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              AI资料
            </button>
            <button class="action-btn" @click="close">关闭</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getCoverUrl, getChapterList, saveBook } from '../api/bookshelf'
import { searchBookMulti } from '../api/search'
import { useBookshelfStore } from '../stores/bookshelf'
import { useReaderStore } from '../stores/reader'
import { useAppStore } from '../stores/app'
import { isLocalBook } from '../utils/localBook'
import type { Book, SearchBook, BookChapter } from '../types'

const props = defineProps<{
  modelValue: boolean
  book: Book | SearchBook | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const router = useRouter()
const readerStore = useReaderStore()
const shelfStore = useBookshelfStore()
const appStore = useAppStore()

const coverFailed = ref(false)
const chapters = ref<BookChapter[]>([])
const chaptersLoading = ref(false)
const showAllChapters = ref(false)
const editingName = ref(false)
const nameDraft = ref('')
const savedName = ref('')
const savedCover = ref('')
const savingLocalBook = ref(false)
const coverSearching = ref(false)
const coverFileInput = ref<HTMLInputElement | null>(null)
const coverCandidates = ref<Array<Pick<SearchBook, 'name' | 'author' | 'coverUrl'> & { coverUrl: string }>>([])

const isLocal = computed(() => isLocalBook(props.book))
const displayName = computed(() => savedName.value || props.book?.name || '')

const coverSrc = computed(() => {
  if (coverFailed.value || !props.book) return ''
  const url = savedCover.value || (props.book as Book).customCoverUrl || props.book.coverUrl
  return url ? getCoverUrl(url) : ''
})

const displayChapters = computed(() => {
  if (showAllChapters.value) return chapters.value
  return chapters.value.slice(0, 50)
})

watch(() => props.modelValue, async (visible) => {
  if (visible && props.book) {
    coverFailed.value = false
    savedName.value = props.book.name
    savedCover.value = (props.book as Book).customCoverUrl || ''
    nameDraft.value = props.book.name
    editingName.value = false
    coverCandidates.value = []
    showAllChapters.value = false
    chapters.value = []
    chaptersLoading.value = true
    try {
      const b = props.book as Book
      chapters.value = await getChapterList({
        bookUrl: b.bookUrl,
        bookSourceUrl: b.origin,
        book: b,
      })
    } catch {
      chapters.value = []
    } finally {
      chaptersLoading.value = false
    }
  }
})

function close() {
  emit('update:modelValue', false)
}

async function saveLocalBookChanges(changes: Partial<Book>) {
  if (!props.book || !isLocal.value) return
  savingLocalBook.value = true
  try {
    const saved = await saveBook({
      ...(props.book as Book),
      name: savedName.value || props.book.name,
      customCoverUrl: savedCover.value || (props.book as Book).customCoverUrl,
      ...changes,
    })
    savedName.value = saved.name
    savedCover.value = saved.customCoverUrl || ''
    nameDraft.value = saved.name
    coverFailed.value = false
    await shelfStore.fetchBooks().catch(() => undefined)
    appStore.showToast('本地书籍信息已保存', 'success')
  } catch (error) {
    appStore.showToast((error as Error).message || '保存失败', 'error')
    throw error
  } finally {
    savingLocalBook.value = false
  }
}

async function renameLocalBook() {
  const name = nameDraft.value.trim()
  if (!name) {
    appStore.showToast('书名不能为空', 'warning')
    return
  }
  await saveLocalBookChanges({ name }).catch(() => undefined)
  editingName.value = false
}

async function searchCovers() {
  const key = displayName.value.trim()
  if (!key) return
  coverSearching.value = true
  coverCandidates.value = []
  try {
    const books = await searchBookMulti({ key, page: 1 })
    const seen = new Set<string>()
    coverCandidates.value = books
      .filter((book): book is SearchBook & { coverUrl: string } => {
        const coverUrl = book.coverUrl?.trim()
        if (!coverUrl || seen.has(coverUrl)) return false
        seen.add(coverUrl)
        return true
      })
      .slice(0, 24)
    if (!coverCandidates.value.length) {
      appStore.showToast('暂未搜索到可用封面', 'warning')
    }
  } catch (error) {
    appStore.showToast((error as Error).message || '搜索封面失败', 'error')
  } finally {
    coverSearching.value = false
  }
}

async function selectCover(coverUrl: string) {
  await saveLocalBookChanges({ customCoverUrl: coverUrl }).catch(() => undefined)
  coverCandidates.value = []
}

async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    appStore.showToast('请选择图片文件', 'warning')
    return
  }
  if (file.size > 3 * 1024 * 1024) {
    appStore.showToast('封面图片不能超过 3MB', 'warning')
    return
  }
  const dataUrl = await readFileAsDataUrl(file).catch(() => '')
  if (!dataUrl) {
    appStore.showToast('读取封面文件失败', 'error')
    return
  }
  await saveLocalBookChanges({ customCoverUrl: dataUrl }).catch(() => undefined)
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function startReading() {
  if (!props.book) return
  const b = props.book as Book
  await shelfStore.moveBookToFront(b.bookUrl).catch(() => undefined)
  await readerStore.loadBook(b)
  await readerStore.loadChapter(readerStore.currentIndex)
  close()
  router.push('/reader')
}

async function readChapter(index: number) {
  if (!props.book) return
  const b = props.book as Book
  await shelfStore.moveBookToFront(b.bookUrl).catch(() => undefined)
  await readerStore.loadBook(b)
  await readerStore.loadChapter(index)
  close()
  router.push('/reader')
}

function openAiBook() {
  if (!props.book) return
  const b = props.book as Book
  close()
  router.push({
    name: 'ai-book',
    query: { bookUrl: b.bookUrl },
  })
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: var(--z-overlay);
  backdrop-filter: blur(4px);
}

.modal-container {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    calc(var(--space-6) + var(--safe-area-top))
    calc(var(--space-6) + var(--safe-area-right))
    calc(var(--space-6) + var(--safe-area-bottom))
    calc(var(--space-6) + var(--safe-area-left));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.detail-modal {
  width: 100%;
  max-width: 600px;
  max-height: min(85vh, calc(var(--app-height, 100dvh) - var(--safe-area-top) - var(--safe-area-bottom) - 32px));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  position: relative;
  box-shadow: var(--shadow-xl);
}

.modal-close {
  position: absolute;
  top: max(var(--space-4), calc(var(--safe-area-top) * 0.35));
  right: var(--space-4);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  transition: all var(--duration-fast);
  z-index: 1;
}

.modal-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.modal-close svg {
  width: 18px;
  height: 18px;
}

.book-header {
  display: flex;
  gap: var(--space-5);
  margin-bottom: var(--space-6);
}

.book-cover-lg {
  width: 120px;
  height: 160px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-bg-sunken);
  box-shadow: var(--shadow-md);
}

.book-cover-lg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder-lg {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary-bg), var(--color-bg-sunken));
  padding: var(--space-3);
  text-align: center;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-primary);
}

.book-header-info {
  flex: 1;
  min-width: 0;
}

.book-header-info h2 {
  font-size: var(--text-xl);
  font-weight: 700;
  margin-bottom: var(--space-2);
  line-height: var(--leading-tight);
}

.author {
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}

.book-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.tag {
  padding: 2px var(--space-2);
  background: var(--color-bg-sunken);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.tag.origin {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.progress {
  font-size: var(--text-sm);
  color: var(--color-primary);
}

.local-book-tools {
  margin-bottom: var(--space-6);
  padding: var(--space-4);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg-sunken);
}

.local-tool-row,
.rename-form {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.local-tool-row strong {
  margin-right: auto;
  font-size: var(--text-sm);
}

.tool-btn {
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
}

.tool-btn:hover:not(:disabled) {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.tool-btn.primary {
  color: white;
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.tool-btn:disabled {
  opacity: 0.55;
}

.file-input {
  display: none;
}

.rename-form {
  margin-top: var(--space-3);
}

.rename-form input {
  flex: 1;
  min-width: 160px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
}

.cover-candidates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: var(--space-2);
  max-height: 240px;
  overflow-y: auto;
  margin-top: var(--space-3);
}

.cover-candidate {
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.cover-candidate:hover {
  border-color: var(--color-primary);
}

.cover-candidate img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-intro {
  margin-bottom: var(--space-6);
}

.book-intro h3 {
  font-size: var(--text-base);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.book-intro p {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--leading-relaxed);
  white-space: pre-wrap;
}

.chapter-section h3 {
  font-size: var(--text-base);
  font-weight: 600;
  margin-bottom: var(--space-3);
}

.chapter-list {
  max-height: 300px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

@media (max-width: 768px) {
  .detail-modal {
    padding: var(--space-6);
    border-radius: 20px;
  }
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  transition: background var(--duration-fast);
  font-size: var(--text-sm);
  border-bottom: 1px solid var(--color-divider);
}

.chapter-item:last-child {
  border-bottom: none;
}

.chapter-item:hover {
  background: var(--color-bg-hover);
}

.chapter-item.current {
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.chapter-index {
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
  min-width: 28px;
}

.chapter-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.show-more-btn {
  width: 100%;
  padding: var(--space-3);
  text-align: center;
  color: var(--color-primary);
  font-size: var(--text-sm);
  font-weight: 500;
  margin-top: var(--space-2);
  border-radius: var(--radius-md);
  transition: background var(--duration-fast);
}

.show-more-btn:hover {
  background: var(--color-primary-bg);
}

.chapter-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  color: var(--color-text-tertiary);
  font-size: var(--text-sm);
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.modal-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-divider);
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  transition: all var(--duration-fast);
}

.action-btn:hover {
  background: var(--color-bg-hover);
}

.action-btn.primary {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.action-btn.primary:hover {
  background: var(--color-primary-dark);
}
</style>
