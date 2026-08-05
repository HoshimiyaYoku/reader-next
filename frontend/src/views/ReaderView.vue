<template>
  <div
    class="reader-view"
    :class="{ 'disable-system-callout': disableSystemCallout }"
    :style="{
      ...readerBackgroundStyle,
      color: theme.fontColor,
      fontFamily: currentFontFamily,
      '--color-primary': '#c97f3a',
      '--reader-status-shadow': store.isNight ? '#000' : '#fff',
      '--reader-summary-sider-width': showSideAiPanel ? `${aiPanelSiderWidth}px` : '0px'
    }"
    @click="handleBackgroundClick"
    @contextmenu.prevent="handleContextMenu"
  >
    <!-- Left Drawer Panels -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="store.activePanel" class="reader-overlay" @click="store.closePanel()"></div>
      </Transition>
      <Transition name="slide-left">
        <div v-if="store.activePanel" class="reader-drawer" :style="{ background: chromeTheme.popup }">
          <ReaderCatalog
            v-if="store.activePanel === 'catalog' || store.activePanel === 'bookmark'"
            :initial-tab="store.activePanel === 'bookmark' ? 'bookmarks' : 'chapters'"
            @jump-chapter="jumpFromCatalog"
          />
          <ReadSettings v-else-if="store.activePanel === 'settings'" />
          <ReaderBookshelf v-else-if="store.activePanel === 'bookshelf'" />
          <ReaderSource v-else-if="store.activePanel === 'source'" />
          <ReplaceRuleManager v-else-if="store.activePanel === 'rule'" />
          <CacheManager v-else-if="store.activePanel === 'cache'" />
        </div>
      </Transition>
    </Teleport>

    <!-- PC Desktop Toolbars (Always shown) -->
    <ReaderSidebar
      v-if="!isMobile"
      :show-add-to-shelf="showAddToShelf"
      :adding-to-shelf="addingToShelf"
      @goHome="goHome"
      @addToShelf="handleAddToShelf"
      @scrollTop="scrollToTop"
      @scrollBottom="scrollToBottom"
    />
    <ReaderToolbar
      v-if="!isMobile"
      :is-speaking="store.isSpeaking"
      :is-paused="store.isPaused"
      :show-ai-panel="showAiPanel"
      @bookmark="toggleBookmark"
      @search="toggleSearch"
      @info="openInfo"
      @ai="openAiBook"
      @toggleAiPanel="toggleAiPanel"
      @tts="handleTTS"
      @prev="prevChapter"
      @next="nextChapter"
      @progress="openCachePanel"
    />

    <!-- Mobile Controls (Click to toggle) -->
    <ReaderMobileControls
      v-if="isMobile"
      :show="showControls || !!store.activePanel"
      :show-add-to-shelf="showAddToShelf"
      :adding-to-shelf="addingToShelf"
      :horizontal-page-mode="isHorizontalPageMode"
      :current-page="horizontalCurrentPage"
      :total-pages="horizontalPageCount"
      :page-progress="horizontalPageProgress"
      @goHome="goHome"
      @addToShelf="handleAddToShelf"
      @scrollTop="scrollToTop"
      @scrollBottom="scrollToBottom"
      @prev="prevChapter"
      @next="nextChapter"
      @bookmark="toggleBookmark"
      @search="openSearch"
      @info="openInfo"
      @ai="openAiBook"
      @tts="handleTTS"
      @progress="openCachePanel"
      @seekPage="seekHorizontalPage"
    />

    <ReaderTtsPanel
      :show="showTTSPanel"
      :theme="chromeTheme"
      :chapter-title="store.currentChapter?.title"
      :provider="store.speechConfig.provider"
      :provider-label="store.speechProviderLabel"
      :is-speaking="store.isSpeaking"
      :is-loading="store.isSpeechLoading"
      :is-paused="store.isPaused"
      :voices="store.voiceList"
      :voice-name="store.speechConfig.voiceName"
      :rate="store.speechConfig.speechRate"
      :pitch="store.speechConfig.speechPitch"
      :volume="store.speechConfig.speechVolume"
      :supports-pitch="store.speechConfig.provider === 'system' || store.speechConfig.provider === 'azure'"
      :openai-model="store.speechConfig.openaiModel"
      :openai-voice="store.speechConfig.openaiVoice"
      :openai-source="store.speechConfig.openaiSource"
      :azure-region="store.speechConfig.azureRegion"
      :azure-voice="store.speechConfig.azureVoice"
      :stop-after-minutes="store.speechConfig.stopAfterMinutes"
      :timer-text="speechTimerText"
      @close="closeTTSPanel"
      @prev="speechPrev"
      @toggle-play="toggleSpeechFromPanel"
      @stop="handleStopTTS"
      @next="speechNext"
      @voice-change="changeVoice"
      @openai-voice-change="changeOpenAIVoice"
      @azure-voice-change="changeAzureVoice"
      @rate-change="adjustSpeechRate"
      @pitch-change="adjustSpeechPitch"
      @volume-change="changeSpeechVolume"
      @timer-change="setSpeechTimer"
    />

    <div class="reader-page-status reader-ui-font">
      <div class="reader-page-status-item status-chapter" :title="store.currentChapter?.title || ''">
        <span v-if="store.chapters.length">第 {{ store.currentIndex + 1 }} 章 / 共 {{ store.chapters.length }} 章</span>
        <span class="status-chapter-name">{{ store.currentChapter?.title || '正在加载章节' }}</span>
      </div>
      <div class="reader-page-status-item status-book" :title="store.book?.name || ''">
        {{ store.book?.name || '阅读' }}
      </div>
      <div class="reader-page-status-item status-progress">全书 {{ store.readingProgress }}</div>
      <time class="reader-page-status-item status-time">{{ currentTimeText }}</time>
    </div>

    <!-- Main Content Area -->
    <div
      class="reader-scroll-container"
      :class="{ 'horizontal-page-mode': isHorizontalPageMode }"
      ref="scrollContainerRef"
      @scroll="handleScroll"
      @mousedown="stopAutoScroll"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @click="handleGlobalClick"
    >
      <div v-if="store.loading" class="content-loading">
        <div class="loading-spinner"></div>
      </div>

      <div v-else-if="offlineBannerText" class="offline-banner">
        {{ offlineBannerText }}
      </div>

      <article
        v-if="!store.loading && !isContinuousMode"
        class="chapter-content"
        :class="{ 'horizontal-page-article': isHorizontalPageMode }"
        :style="{
          maxWidth: isHorizontalPageMode ? 'none' : (config.pageWidth + 'px'),
          fontSize: config.fontSize + 'px',
          fontWeight: config.fontWeight,
          lineHeight: config.lineHeight,
          '--reader-page-width': config.pageWidth + 'px',
          '--reader-side-padding': '24px',
          '--reader-page-step': horizontalPageStepStyle,
        }"
      >
        <div v-if="isHorizontalPageMode" class="horizontal-page-layout">
          <section class="horizontal-content-page">
            <div
              ref="chapterTextRef"
              class="horizontal-pages"
              :style="{
                transform: horizontalPageTransform,
                transitionDuration: horizontalPageTransitionDuration,
              }"
            >
              <section v-for="(page, idx) in horizontalPages" :key="`h-page-${idx}`" class="horizontal-page">
                <div
                  class="chapter-text horizontal-page-content"
                  :style="{
                    '--p-spacing': config.paragraphSpacing + 'em',
                  }"
                  v-html="page"
                ></div>
              </section>
            </div>
          </section>
        </div>

        <div v-else>
          <div class="chapter-title">{{ store.currentChapter?.title || '加载中...' }}</div>

          <button
            v-if="showCollapsedAiPanel"
            class="chapter-summary-collapsed-pill"
            type="button"
            @click="expandCollapsedAiPanel"
          >
            <span class="summary-kicker">摘要</span>
            <span class="summary-muted">{{ chapterSummary ? '展开管理' : '打开摘要设置' }}</span>
          </button>

          <section v-if="showInlineAiPanel" class="chapter-summary-card">
            <div class="chapter-summary-header reader-ui-font">
              <div>
                <div class="summary-kicker">AI 面板</div>
                <div class="summary-muted">{{ store.currentChapter?.title || '当前章节' }}</div>
              </div>
              <div class="summary-tabs" role="tablist" aria-label="AI 面板">
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'summary' }"
                  :aria-selected="aiPanelActiveTab === 'summary'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'summary'"
                >摘要</button>
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'relationships' }"
                  :aria-selected="aiPanelActiveTab === 'relationships'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'relationships'"
                >人物关系</button>
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'map' }"
                  :aria-selected="aiPanelActiveTab === 'map'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'map'"
                >地图</button>
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'settings' }"
                  :aria-selected="aiPanelActiveTab === 'settings'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'settings'"
                >设置</button>
              </div>
            </div>

            <section v-if="aiPanelActiveTab === 'summary'" class="chapter-summary-body" role="tabpanel" :style="aiPanelBodyStyle">
              <div v-if="chapterSummaryStatus === 'loading'" class="summary-skeleton" aria-label="摘要生成中">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <p v-else-if="chapterSummary?.summary" class="summary-main">{{ chapterSummary.summary }}</p>
              <p v-else-if="chapterSummaryError" class="summary-error">{{ chapterSummaryError }}</p>
              <p v-else class="summary-main summary-muted">当前章节还没有摘要。</p>
              <div
                v-if="chapterSummary?.keyPoints.length"
                class="summary-list"
                :class="`style-${config.chapterSummaryKeyPointStyle}`"
              >
                <strong>要点</strong>
                <ul>
                  <li v-for="item in chapterSummary.keyPoints" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div class="summary-actions reader-ui-font">
                <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryForCurrentChapter(Boolean(chapterSummary))">
                  {{ chapterSummary ? '重新生成' : '生成摘要' }}
                </button>
                <button v-if="chapterSummary" class="summary-action" @click.stop="copyChapterSummary">复制</button>
              </div>
            </section>
            <ChapterSummaryRelationshipPanel
              v-else-if="aiPanelActiveTab === 'relationships'"
              :graph="chapterSummaryRelationshipGraph"
              :status="chapterSummaryRelationshipStatus"
              :body-style="aiPanelBodyStyle"
            />
            <AiBookMapPanel
              v-else-if="aiPanelActiveTab === 'map'"
              :map="chapterSummaryRelationshipMemory?.map"
              :locations="chapterSummaryRelationshipMemory?.locations || []"
              :busy="aiBookStore.isBusy || chapterSummaryRelationshipStatus === 'loading'"
              :body-style="aiPanelBodyStyle"
              @generate="generateAiBookMapForCurrentBook"
            />
            <section v-else class="chapter-summary-settings-panel reader-ui-font" role="tabpanel">
              <div class="summary-setting-group">
                <div class="summary-setting-title">显示</div>
                <div class="summary-setting-row">
                  <span>摘要栏</span>
                  <div class="summary-switch">
                    <button class="active" type="button">显示</button>
                    <button type="button" @click="hideAiPanel">隐藏</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>位置</span>
                  <div class="summary-switch">
                    <button :class="{ active: config.aiPanelLayout === 'auto' }" type="button" @click="store.updateConfig('aiPanelLayout', 'auto')">智能</button>
                    <button :class="{ active: config.aiPanelLayout === 'side' }" type="button" @click="store.updateConfig('aiPanelLayout', 'side')">右侧</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>栏宽</span>
                  <div class="summary-stepper">
                    <button type="button" @click="adjustAiPanelSiderWidth(-20)">−</button>
                    <span>{{ aiPanelSiderWidth }}</span>
                    <button type="button" @click="adjustAiPanelSiderWidth(20)">+</button>
                  </div>
                </div>
              </div>
              <div class="summary-setting-group">
                <div class="summary-setting-title">阅读</div>
                <div class="summary-setting-row">
                  <span>摘要字号</span>
                  <div class="summary-stepper">
                    <button type="button" @click="adjustAiPanelFontSize(-1)">A-</button>
                    <span>{{ config.aiPanelFontSize }}</span>
                    <button type="button" @click="adjustAiPanelFontSize(1)">A+</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>要点样式</span>
                  <div class="summary-switch">
                    <button :class="{ active: config.chapterSummaryKeyPointStyle === 'card' }" type="button" @click="store.updateConfig('chapterSummaryKeyPointStyle', 'card')">整块</button>
                    <button :class="{ active: config.chapterSummaryKeyPointStyle === 'list' }" type="button" @click="store.updateConfig('chapterSummaryKeyPointStyle', 'list')">列表</button>
                  </div>
                </div>
              </div>
              <div class="summary-setting-group">
                <div class="summary-setting-title">生成</div>
                <div class="summary-setting-row">
                  <span>功能启用</span>
                  <div class="summary-switch">
                    <button :class="{ active: chapterSummaryConfigDraft.enabledText === 'true' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.enabledText = 'true'">开</button>
                    <button :class="{ active: chapterSummaryConfigDraft.enabledText === 'false' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.enabledText = 'false'">关</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>自动生成</span>
                  <div class="summary-switch">
                    <button :class="{ active: config.enableChapterSummaryAuto }" type="button" @click="store.updateConfig('enableChapterSummaryAuto', true)">开</button>
                    <button :class="{ active: !config.enableChapterSummaryAuto }" type="button" @click="store.updateConfig('enableChapterSummaryAuto', false)">关</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>详细程度</span>
                  <div class="summary-switch">
                    <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'short' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'short'">短</button>
                    <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'normal' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'normal'">正常</button>
                    <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'detailed' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'detailed'">详细</button>
                  </div>
                </div>
                <label class="summary-setting-field">
                  <span>最大字数</span>
                  <input v-model.number="chapterSummaryConfigDraft.maxWords" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="80" max="600">
                </label>
                <label class="summary-setting-field">
                  <span>最短正文</span>
                  <input v-model.number="chapterSummaryConfigDraft.minContentChars" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="0" max="5000">
                </label>
                <label class="summary-setting-field">
                  <span>Temperature</span>
                  <input v-model.number="chapterSummaryConfigDraft.temperature" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="0" max="1.5" step="0.1">
                </label>
                <div class="summary-actions compact">
                  <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryAfterSavingSettings(false)">生成摘要</button>
                  <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryAfterSavingSettings(true)">重新生成</button>
                  <button class="summary-action" :disabled="savingChapterSummaryConfig || !chapterSummaryConfig?.isAdmin" @click="saveChapterSummaryGenerationSettings">
                    {{ savingChapterSummaryConfig ? '保存中...' : '保存生成设置' }}
                  </button>
                </div>
              </div>
              <div class="summary-setting-group">
                <div class="summary-setting-title">Prompt</div>
                <textarea v-model="chapterSummaryConfigDraft.prompt" :disabled="!chapterSummaryConfig?.isAdmin" class="summary-prompt-input" rows="6"></textarea>
                <div class="summary-actions compact">
                  <button class="summary-action" :disabled="!chapterSummaryConfig?.isAdmin" @click="restoreDefaultChapterSummaryPrompt">恢复当前</button>
                  <button class="summary-action" :disabled="savingChapterSummaryConfig || !chapterSummaryConfig?.isAdmin" @click="saveChapterSummaryGenerationSettings">保存 Prompt</button>
                </div>
              </div>
              <div class="summary-setting-group" data-section="server-model">
                <div class="summary-setting-title">后端模型</div>
                <div class="summary-model-status">
                  <span>{{ aiModelStatusTitle }}</span>
                  <small>{{ aiModelStatusMessage }}</small>
                </div>
                <details class="summary-model-details">
                  <summary>模型设置</summary>
                  <div class="summary-model-form">
                    <label class="summary-switch-line">
                      <input v-model="aiModelConfig.text.enabled" type="checkbox" />
                      <span>启用文本模型</span>
                    </label>
                    <label class="summary-setting-field">
                      <span>文本 Base URL</span>
                      <input v-model="aiModelConfig.text.baseUrl" placeholder="https://api.openai.com" />
                    </label>
                    <label class="summary-setting-field">
                      <span>文本模型</span>
                      <input v-model="aiModelConfig.text.model" placeholder="gpt-4o-mini" />
                    </label>
                    <label class="summary-setting-field">
                      <span>文本路径</span>
                      <input v-model="aiModelConfig.text.path" placeholder="/v1/chat/completions" />
                    </label>
                    <label class="summary-setting-field">
                      <span>文本 API Key</span>
                      <input v-model="aiModelConfig.text.apiKey" type="password" autocomplete="off" />
                    </label>

                    <label class="summary-switch-line">
                      <input v-model="aiModelConfig.image.enabled" type="checkbox" />
                      <span>启用图片模型</span>
                    </label>
                    <label class="summary-setting-field">
                      <span>图片 Base URL</span>
                      <input v-model="aiModelConfig.image.baseUrl" />
                    </label>
                    <label class="summary-setting-field">
                      <span>图片模型</span>
                      <input v-model="aiModelConfig.image.model" placeholder="gpt-image-1" />
                    </label>
                    <label class="summary-setting-field">
                      <span>图片路径</span>
                      <input v-model="aiModelConfig.image.path" placeholder="/v1/images/generations" />
                    </label>
                    <label class="summary-setting-field">
                      <span>图片 API Key</span>
                      <input v-model="aiModelConfig.image.apiKey" type="password" autocomplete="off" />
                    </label>

                    <label class="summary-switch-line">
                      <input v-model="aiModelConfig.speech.enabled" type="checkbox" />
                      <span>启用语音模型</span>
                    </label>
                    <label class="summary-setting-field">
                      <span>语音 Base URL</span>
                      <input v-model="aiModelConfig.speech.baseUrl" />
                    </label>
                    <label class="summary-setting-field">
                      <span>语音模型</span>
                      <input v-model="aiModelConfig.speech.model" placeholder="gpt-4o-mini-tts" />
                    </label>
                    <label class="summary-setting-field">
                      <span>语音路径</span>
                      <input v-model="aiModelConfig.speech.path" placeholder="/v1/audio/speech" />
                    </label>
                    <label class="summary-setting-field">
                      <span>语音 API Key</span>
                      <input v-model="aiModelConfig.speech.apiKey" type="password" autocomplete="off" />
                    </label>

                    <div class="summary-actions compact">
                      <button class="summary-action" :disabled="!aiModelIsAdmin || aiModelSaving" @click="handleSaveAiModelConfig">
                        {{ aiModelSaving ? '保存中...' : '保存后端模型' }}
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            </section>
          </section>
          <div
            ref="chapterTextRef"
            class="chapter-text"
            :style="{
              '--p-spacing': config.paragraphSpacing + 'em',
            }"
            v-html="formattedContent"
          ></div>

          <div class="chapter-footer">
            <button class="next-btn" :disabled="!store.hasNext" @click="nextChapter">
              {{ store.hasNext ? '下一章' : '没有更多了' }}
            </button>
          </div>
        </div>
      </article>

      <Transition name="fade">
        <div v-if="!store.loading && isHorizontalPageMode && isHorizontalAtEnd" class="horizontal-next-floating">
          <button class="next-btn" :disabled="!store.hasNext" @click="nextChapter">
            {{ store.hasNext ? '下一章' : '没有更多了' }}
          </button>
        </div>
      </Transition>

      <div
        v-if="!store.loading && isContinuousMode"
        class="continuous-reading"
        :style="{
          maxWidth: config.pageWidth + 'px',
          fontSize: config.fontSize + 'px',
          fontWeight: config.fontWeight,
          lineHeight: config.lineHeight,
        }"
      >
        <div v-if="continuousLoadingPrev" class="continuous-loading-inline">正在加载上一章...</div>

        <section
          v-for="chapter in continuousChapters"
          :key="chapter.index"
          class="chapter-content continuous-chapter"
          :data-chapter-index="chapter.index"
        >
          <div class="chapter-title">{{ chapter.title }}</div>

          <button
            v-if="showCollapsedAiPanel && chapter.index === store.currentIndex"
            class="chapter-summary-collapsed-pill"
            type="button"
            @click="expandCollapsedAiPanel"
          >
            <span class="summary-kicker">摘要</span>
            <span class="summary-muted">{{ chapterSummary ? '展开管理' : '打开摘要设置' }}</span>
          </button>

          <section
            v-if="showInlineAiPanel && chapter.index === store.currentIndex"
            class="chapter-summary-card"
          >
            <div class="chapter-summary-header reader-ui-font">
              <div>
                <div class="summary-kicker">AI 面板</div>
                <div class="summary-muted">{{ chapter.title || '当前章节' }}</div>
              </div>
              <div class="summary-tabs" role="tablist" aria-label="AI 面板">
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'summary' }"
                  :aria-selected="aiPanelActiveTab === 'summary'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'summary'"
                >摘要</button>
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'relationships' }"
                  :aria-selected="aiPanelActiveTab === 'relationships'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'relationships'"
                >人物关系</button>
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'map' }"
                  :aria-selected="aiPanelActiveTab === 'map'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'map'"
                >地图</button>
                <button
                  class="summary-tab"
                  :class="{ active: aiPanelActiveTab === 'settings' }"
                  :aria-selected="aiPanelActiveTab === 'settings'"
                  role="tab"
                  type="button"
                  @click="aiPanelActiveTab = 'settings'"
                >设置</button>
              </div>
            </div>

            <section v-if="aiPanelActiveTab === 'summary'" class="chapter-summary-body" role="tabpanel" :style="aiPanelBodyStyle">
              <div v-if="chapterSummaryStatus === 'loading'" class="summary-skeleton" aria-label="摘要生成中">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <p v-else-if="chapterSummary?.summary" class="summary-main">{{ chapterSummary.summary }}</p>
              <p v-else-if="chapterSummaryError" class="summary-error">{{ chapterSummaryError }}</p>
              <p v-else class="summary-main summary-muted">当前章节还没有摘要。</p>
              <div
                v-if="chapterSummary?.keyPoints.length"
                class="summary-list"
                :class="`style-${config.chapterSummaryKeyPointStyle}`"
              >
                <strong>要点</strong>
                <ul>
                  <li v-for="item in chapterSummary.keyPoints" :key="item">{{ item }}</li>
                </ul>
              </div>
              <div class="summary-actions reader-ui-font">
                <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryForCurrentChapter(Boolean(chapterSummary))">
                  {{ chapterSummary ? '重新生成' : '生成摘要' }}
                </button>
                <button v-if="chapterSummary" class="summary-action" @click.stop="copyChapterSummary">复制</button>
              </div>
            </section>
            <ChapterSummaryRelationshipPanel
              v-else-if="aiPanelActiveTab === 'relationships'"
              :graph="chapterSummaryRelationshipGraph"
              :status="chapterSummaryRelationshipStatus"
              :body-style="aiPanelBodyStyle"
            />
            <AiBookMapPanel
              v-else-if="aiPanelActiveTab === 'map'"
              :map="chapterSummaryRelationshipMemory?.map"
              :locations="chapterSummaryRelationshipMemory?.locations || []"
              :busy="aiBookStore.isBusy || chapterSummaryRelationshipStatus === 'loading'"
              :body-style="aiPanelBodyStyle"
              @generate="generateAiBookMapForCurrentBook"
            />
            <section v-else class="chapter-summary-settings-panel reader-ui-font" role="tabpanel">
              <div class="summary-setting-group">
                <div class="summary-setting-title">显示</div>
                <div class="summary-setting-row">
                  <span>摘要栏</span>
                  <div class="summary-switch">
                    <button class="active" type="button">显示</button>
                    <button type="button" @click="hideAiPanel">隐藏</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>位置</span>
                  <div class="summary-switch">
                    <button :class="{ active: config.aiPanelLayout === 'auto' }" type="button" @click="store.updateConfig('aiPanelLayout', 'auto')">智能</button>
                    <button :class="{ active: config.aiPanelLayout === 'side' }" type="button" @click="store.updateConfig('aiPanelLayout', 'side')">右侧</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>栏宽</span>
                  <div class="summary-stepper">
                    <button type="button" @click="adjustAiPanelSiderWidth(-20)">−</button>
                    <span>{{ aiPanelSiderWidth }}</span>
                    <button type="button" @click="adjustAiPanelSiderWidth(20)">+</button>
                  </div>
                </div>
              </div>
              <div class="summary-setting-group">
                <div class="summary-setting-title">阅读</div>
                <div class="summary-setting-row">
                  <span>摘要字号</span>
                  <div class="summary-stepper">
                    <button type="button" @click="adjustAiPanelFontSize(-1)">A-</button>
                    <span>{{ config.aiPanelFontSize }}</span>
                    <button type="button" @click="adjustAiPanelFontSize(1)">A+</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>要点样式</span>
                  <div class="summary-switch">
                    <button :class="{ active: config.chapterSummaryKeyPointStyle === 'card' }" type="button" @click="store.updateConfig('chapterSummaryKeyPointStyle', 'card')">整块</button>
                    <button :class="{ active: config.chapterSummaryKeyPointStyle === 'list' }" type="button" @click="store.updateConfig('chapterSummaryKeyPointStyle', 'list')">列表</button>
                  </div>
                </div>
              </div>
              <div class="summary-setting-group">
                <div class="summary-setting-title">生成</div>
                <div class="summary-setting-row">
                  <span>功能启用</span>
                  <div class="summary-switch">
                    <button :class="{ active: chapterSummaryConfigDraft.enabledText === 'true' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.enabledText = 'true'">开</button>
                    <button :class="{ active: chapterSummaryConfigDraft.enabledText === 'false' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.enabledText = 'false'">关</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>自动生成</span>
                  <div class="summary-switch">
                    <button :class="{ active: config.enableChapterSummaryAuto }" type="button" @click="store.updateConfig('enableChapterSummaryAuto', true)">开</button>
                    <button :class="{ active: !config.enableChapterSummaryAuto }" type="button" @click="store.updateConfig('enableChapterSummaryAuto', false)">关</button>
                  </div>
                </div>
                <div class="summary-setting-row">
                  <span>详细程度</span>
                  <div class="summary-switch">
                    <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'short' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'short'">短</button>
                    <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'normal' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'normal'">正常</button>
                    <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'detailed' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'detailed'">详细</button>
                  </div>
                </div>
                <label class="summary-setting-field">
                  <span>最大字数</span>
                  <input v-model.number="chapterSummaryConfigDraft.maxWords" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="80" max="600">
                </label>
                <label class="summary-setting-field">
                  <span>最短正文</span>
                  <input v-model.number="chapterSummaryConfigDraft.minContentChars" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="0" max="5000">
                </label>
                <label class="summary-setting-field">
                  <span>Temperature</span>
                  <input v-model.number="chapterSummaryConfigDraft.temperature" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="0" max="1.5" step="0.1">
                </label>
                <div class="summary-actions compact">
                  <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryAfterSavingSettings(false)">生成摘要</button>
                  <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryAfterSavingSettings(true)">重新生成</button>
                  <button class="summary-action" :disabled="savingChapterSummaryConfig || !chapterSummaryConfig?.isAdmin" @click="saveChapterSummaryGenerationSettings">
                    {{ savingChapterSummaryConfig ? '保存中...' : '保存生成设置' }}
                  </button>
                </div>
              </div>
              <div class="summary-setting-group">
                <div class="summary-setting-title">Prompt</div>
                <textarea v-model="chapterSummaryConfigDraft.prompt" :disabled="!chapterSummaryConfig?.isAdmin" class="summary-prompt-input" rows="6"></textarea>
                <div class="summary-actions compact">
                  <button class="summary-action" :disabled="!chapterSummaryConfig?.isAdmin" @click="restoreDefaultChapterSummaryPrompt">恢复当前</button>
                  <button class="summary-action" :disabled="savingChapterSummaryConfig || !chapterSummaryConfig?.isAdmin" @click="saveChapterSummaryGenerationSettings">保存 Prompt</button>
                </div>
              </div>
              <div class="summary-setting-group" data-section="server-model">
                <div class="summary-setting-title">后端模型</div>
                <div class="summary-model-status">
                  <span>{{ aiModelStatusTitle }}</span>
                  <small>{{ aiModelStatusMessage }}</small>
                </div>
                <details class="summary-model-details">
                  <summary>模型设置</summary>
                  <div class="summary-model-form">
                    <label class="summary-switch-line">
                      <input v-model="aiModelConfig.text.enabled" type="checkbox" />
                      <span>启用文本模型</span>
                    </label>
                    <label class="summary-setting-field">
                      <span>文本 Base URL</span>
                      <input v-model="aiModelConfig.text.baseUrl" placeholder="https://api.openai.com" />
                    </label>
                    <label class="summary-setting-field">
                      <span>文本模型</span>
                      <input v-model="aiModelConfig.text.model" placeholder="gpt-4o-mini" />
                    </label>
                    <label class="summary-setting-field">
                      <span>文本路径</span>
                      <input v-model="aiModelConfig.text.path" placeholder="/v1/chat/completions" />
                    </label>
                    <label class="summary-setting-field">
                      <span>文本 API Key</span>
                      <input v-model="aiModelConfig.text.apiKey" type="password" autocomplete="off" />
                    </label>

                    <label class="summary-switch-line">
                      <input v-model="aiModelConfig.image.enabled" type="checkbox" />
                      <span>启用图片模型</span>
                    </label>
                    <label class="summary-setting-field">
                      <span>图片 Base URL</span>
                      <input v-model="aiModelConfig.image.baseUrl" />
                    </label>
                    <label class="summary-setting-field">
                      <span>图片模型</span>
                      <input v-model="aiModelConfig.image.model" placeholder="gpt-image-1" />
                    </label>
                    <label class="summary-setting-field">
                      <span>图片路径</span>
                      <input v-model="aiModelConfig.image.path" placeholder="/v1/images/generations" />
                    </label>
                    <label class="summary-setting-field">
                      <span>图片 API Key</span>
                      <input v-model="aiModelConfig.image.apiKey" type="password" autocomplete="off" />
                    </label>

                    <label class="summary-switch-line">
                      <input v-model="aiModelConfig.speech.enabled" type="checkbox" />
                      <span>启用语音模型</span>
                    </label>
                    <label class="summary-setting-field">
                      <span>语音 Base URL</span>
                      <input v-model="aiModelConfig.speech.baseUrl" />
                    </label>
                    <label class="summary-setting-field">
                      <span>语音模型</span>
                      <input v-model="aiModelConfig.speech.model" placeholder="gpt-4o-mini-tts" />
                    </label>
                    <label class="summary-setting-field">
                      <span>语音路径</span>
                      <input v-model="aiModelConfig.speech.path" placeholder="/v1/audio/speech" />
                    </label>
                    <label class="summary-setting-field">
                      <span>语音 API Key</span>
                      <input v-model="aiModelConfig.speech.apiKey" type="password" autocomplete="off" />
                    </label>

                    <div class="summary-actions compact">
                      <button class="summary-action" :disabled="!aiModelIsAdmin || aiModelSaving" @click="handleSaveAiModelConfig">
                        {{ aiModelSaving ? '保存中...' : '保存后端模型' }}
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            </section>
          </section>
          <div
            class="chapter-text"
            data-role="continuous"
            :data-chapter-index="chapter.index"
            :style="{
              '--p-spacing': config.paragraphSpacing + 'em',
            }"
            v-html="chapter.html"
          ></div>

          <div v-if="chapter.index === continuousChapters[continuousChapters.length - 1]?.index" class="chapter-footer">
            <button class="next-btn" :disabled="!store.hasNext" @click="nextChapter">
              {{ store.hasNext ? '继续加载下一章' : '已经到底了' }}
            </button>
          </div>
        </section>

        <div v-if="continuousLoadingNext" class="continuous-loading-inline">正在加载下一章...</div>
      </div>
    </div>

    <aside
      v-if="showSideAiPanel"
      class="chapter-summary-sider"
      :class="{ resizing: aiPanelSiderResizing }"
      :style="aiPanelSiderStyle"
      @click.stop
    >
      <div class="chapter-summary-resize-handle" @pointerdown="startAiPanelSiderResize"></div>
      <div class="chapter-summary-sider-head reader-ui-font">
        <div>
          <div class="summary-kicker">AI 面板</div>
          <div class="summary-muted">{{ store.currentChapter?.title || '当前章节' }}</div>
        </div>
        <div class="summary-tabs" role="tablist" aria-label="AI 面板">
          <button
            class="summary-tab"
            :class="{ active: aiPanelActiveTab === 'summary' }"
            :aria-selected="aiPanelActiveTab === 'summary'"
            role="tab"
            type="button"
            @click="aiPanelActiveTab = 'summary'"
          >摘要</button>
          <button
            class="summary-tab"
            :class="{ active: aiPanelActiveTab === 'relationships' }"
            :aria-selected="aiPanelActiveTab === 'relationships'"
            role="tab"
            type="button"
            @click="aiPanelActiveTab = 'relationships'"
          >人物关系</button>
          <button
            class="summary-tab"
            :class="{ active: aiPanelActiveTab === 'map' }"
            :aria-selected="aiPanelActiveTab === 'map'"
            role="tab"
            type="button"
            @click="aiPanelActiveTab = 'map'"
          >地图</button>
          <button
            class="summary-tab"
            :class="{ active: aiPanelActiveTab === 'settings' }"
            :aria-selected="aiPanelActiveTab === 'settings'"
            role="tab"
            type="button"
            @click="aiPanelActiveTab = 'settings'"
          >设置</button>
        </div>
      </div>

      <section v-if="aiPanelActiveTab === 'summary'" class="chapter-summary-card side" role="tabpanel">
        <div class="chapter-summary-body" :style="aiPanelBodyStyle">
          <div v-if="chapterSummaryStatus === 'loading'" class="summary-skeleton" aria-label="摘要生成中">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p v-else-if="chapterSummary?.summary" class="summary-main">{{ chapterSummary.summary }}</p>
          <p v-else-if="chapterSummaryError" class="summary-error">{{ chapterSummaryError }}</p>
          <p v-else class="summary-main summary-muted">当前章节还没有摘要。</p>
          <div
            v-if="chapterSummary?.keyPoints.length"
            class="summary-list"
            :class="`style-${config.chapterSummaryKeyPointStyle}`"
          >
            <strong>要点</strong>
            <ul>
              <li v-for="item in chapterSummary.keyPoints" :key="item">{{ item }}</li>
            </ul>
          </div>
          <div class="summary-actions reader-ui-font">
            <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryForCurrentChapter(Boolean(chapterSummary))">
              {{ chapterSummary ? '重新生成' : '生成摘要' }}
            </button>
            <button v-if="chapterSummary" class="summary-action" @click.stop="copyChapterSummary">复制</button>
            <button class="summary-action" @click="hideAiPanel">隐藏</button>
          </div>
        </div>
      </section>
      <ChapterSummaryRelationshipPanel
        v-else-if="aiPanelActiveTab === 'relationships'"
        :graph="chapterSummaryRelationshipGraph"
        :status="chapterSummaryRelationshipStatus"
        :body-style="aiPanelBodyStyle"
      />
      <AiBookMapPanel
        v-else-if="aiPanelActiveTab === 'map'"
        :map="chapterSummaryRelationshipMemory?.map"
        :locations="chapterSummaryRelationshipMemory?.locations || []"
        :busy="aiBookStore.isBusy || chapterSummaryRelationshipStatus === 'loading'"
        :body-style="aiPanelBodyStyle"
        @generate="generateAiBookMapForCurrentBook"
      />
      <section v-else class="chapter-summary-settings-panel reader-ui-font" role="tabpanel">
        <div class="summary-setting-group">
          <div class="summary-setting-title">显示</div>
          <div class="summary-setting-row">
            <span>摘要栏</span>
            <div class="summary-switch">
              <button class="active" type="button">显示</button>
                <button type="button" @click="hideAiPanel">隐藏</button>
            </div>
          </div>
          <div class="summary-setting-row">
            <span>位置</span>
            <div class="summary-switch">
              <button :class="{ active: config.aiPanelLayout === 'auto' }" type="button" @click="store.updateConfig('aiPanelLayout', 'auto')">智能</button>
              <button :class="{ active: config.aiPanelLayout === 'side' }" type="button" @click="store.updateConfig('aiPanelLayout', 'side')">右侧</button>
            </div>
          </div>
          <div class="summary-setting-row">
            <span>栏宽</span>
            <div class="summary-stepper">
              <button type="button" @click="adjustAiPanelSiderWidth(-20)">−</button>
              <span>{{ aiPanelSiderWidth }}</span>
              <button type="button" @click="adjustAiPanelSiderWidth(20)">+</button>
            </div>
          </div>
        </div>
        <div class="summary-setting-group">
          <div class="summary-setting-title">阅读</div>
          <div class="summary-setting-row">
            <span>摘要字号</span>
            <div class="summary-stepper">
              <button type="button" @click="adjustAiPanelFontSize(-1)">A-</button>
              <span>{{ config.aiPanelFontSize }}</span>
              <button type="button" @click="adjustAiPanelFontSize(1)">A+</button>
            </div>
          </div>
          <div class="summary-setting-row">
            <span>要点样式</span>
            <div class="summary-switch">
              <button :class="{ active: config.chapterSummaryKeyPointStyle === 'card' }" type="button" @click="store.updateConfig('chapterSummaryKeyPointStyle', 'card')">整块</button>
              <button :class="{ active: config.chapterSummaryKeyPointStyle === 'list' }" type="button" @click="store.updateConfig('chapterSummaryKeyPointStyle', 'list')">列表</button>
            </div>
          </div>
        </div>
        <div class="summary-setting-group">
          <div class="summary-setting-title">生成</div>
          <div class="summary-setting-row">
            <span>功能启用</span>
            <div class="summary-switch">
              <button :class="{ active: chapterSummaryConfigDraft.enabledText === 'true' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.enabledText = 'true'">开</button>
              <button :class="{ active: chapterSummaryConfigDraft.enabledText === 'false' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.enabledText = 'false'">关</button>
            </div>
          </div>
          <div class="summary-setting-row">
            <span>自动生成</span>
            <div class="summary-switch">
              <button :class="{ active: config.enableChapterSummaryAuto }" type="button" @click="store.updateConfig('enableChapterSummaryAuto', true)">开</button>
              <button :class="{ active: !config.enableChapterSummaryAuto }" type="button" @click="store.updateConfig('enableChapterSummaryAuto', false)">关</button>
            </div>
          </div>
          <div class="summary-setting-row">
            <span>详细程度</span>
            <div class="summary-switch">
              <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'short' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'short'">短</button>
              <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'normal' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'normal'">正常</button>
              <button :class="{ active: chapterSummaryConfigDraft.detailLevel === 'detailed' }" :disabled="!chapterSummaryConfig?.isAdmin" type="button" @click="chapterSummaryConfigDraft.detailLevel = 'detailed'">详细</button>
            </div>
          </div>
          <label class="summary-setting-field">
            <span>最大字数</span>
            <input v-model.number="chapterSummaryConfigDraft.maxWords" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="80" max="600">
          </label>
          <label class="summary-setting-field">
            <span>最短正文</span>
            <input v-model.number="chapterSummaryConfigDraft.minContentChars" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="0" max="5000">
          </label>
          <label class="summary-setting-field">
            <span>Temperature</span>
            <input v-model.number="chapterSummaryConfigDraft.temperature" :disabled="!chapterSummaryConfig?.isAdmin" type="number" min="0" max="1.5" step="0.1">
          </label>
          <div class="summary-actions compact">
            <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryAfterSavingSettings(false)">生成摘要</button>
            <button class="summary-action" :disabled="chapterSummaryStatus === 'loading'" @click.stop="generateChapterSummaryAfterSavingSettings(true)">重新生成</button>
            <button class="summary-action" :disabled="savingChapterSummaryConfig || !chapterSummaryConfig?.isAdmin" @click="saveChapterSummaryGenerationSettings">
              {{ savingChapterSummaryConfig ? '保存中...' : '保存生成设置' }}
            </button>
          </div>
        </div>
        <div class="summary-setting-group">
          <div class="summary-setting-title">Prompt</div>
          <textarea v-model="chapterSummaryConfigDraft.prompt" :disabled="!chapterSummaryConfig?.isAdmin" class="summary-prompt-input" rows="6"></textarea>
          <div class="summary-actions compact">
            <button class="summary-action" :disabled="!chapterSummaryConfig?.isAdmin" @click="restoreDefaultChapterSummaryPrompt">恢复当前</button>
            <button class="summary-action" :disabled="savingChapterSummaryConfig || !chapterSummaryConfig?.isAdmin" @click="saveChapterSummaryGenerationSettings">保存 Prompt</button>
          </div>
        </div>
        <div class="summary-setting-group" data-section="server-model">
          <div class="summary-setting-title">后端模型</div>
          <div class="summary-model-status">
            <span>{{ aiModelStatusTitle }}</span>
            <small>{{ aiModelStatusMessage }}</small>
          </div>
          <details class="summary-model-details">
            <summary>模型设置</summary>
            <div class="summary-model-form">
              <label class="summary-switch-line">
                <input v-model="aiModelConfig.text.enabled" type="checkbox" />
                <span>启用文本模型</span>
              </label>
              <label class="summary-setting-field">
                <span>文本 Base URL</span>
                <input v-model="aiModelConfig.text.baseUrl" placeholder="https://api.openai.com" />
              </label>
              <label class="summary-setting-field">
                <span>文本模型</span>
                <input v-model="aiModelConfig.text.model" placeholder="gpt-4o-mini" />
              </label>
              <label class="summary-setting-field">
                <span>文本路径</span>
                <input v-model="aiModelConfig.text.path" placeholder="/v1/chat/completions" />
              </label>
              <label class="summary-setting-field">
                <span>文本 API Key</span>
                <input v-model="aiModelConfig.text.apiKey" type="password" autocomplete="off" />
              </label>

              <label class="summary-switch-line">
                <input v-model="aiModelConfig.image.enabled" type="checkbox" />
                <span>启用图片模型</span>
              </label>
              <label class="summary-setting-field">
                <span>图片 Base URL</span>
                <input v-model="aiModelConfig.image.baseUrl" />
              </label>
              <label class="summary-setting-field">
                <span>图片模型</span>
                <input v-model="aiModelConfig.image.model" placeholder="gpt-image-1" />
              </label>
              <label class="summary-setting-field">
                <span>图片路径</span>
                <input v-model="aiModelConfig.image.path" placeholder="/v1/images/generations" />
              </label>
              <label class="summary-setting-field">
                <span>图片 API Key</span>
                <input v-model="aiModelConfig.image.apiKey" type="password" autocomplete="off" />
              </label>

              <label class="summary-switch-line">
                <input v-model="aiModelConfig.speech.enabled" type="checkbox" />
                <span>启用语音模型</span>
              </label>
              <label class="summary-setting-field">
                <span>语音 Base URL</span>
                <input v-model="aiModelConfig.speech.baseUrl" />
              </label>
              <label class="summary-setting-field">
                <span>语音模型</span>
                <input v-model="aiModelConfig.speech.model" placeholder="gpt-4o-mini-tts" />
              </label>
              <label class="summary-setting-field">
                <span>语音路径</span>
                <input v-model="aiModelConfig.speech.path" placeholder="/v1/audio/speech" />
              </label>
              <label class="summary-setting-field">
                <span>语音 API Key</span>
                <input v-model="aiModelConfig.speech.apiKey" type="password" autocomplete="off" />
              </label>

              <div class="summary-actions compact">
                <button class="summary-action" :disabled="!aiModelIsAdmin || aiModelSaving" @click="handleSaveAiModelConfig">
                  {{ aiModelSaving ? '保存中...' : '保存后端模型' }}
                </button>
              </div>
            </div>
          </details>
        </div>
      </section>
    </aside>


    <ReaderSearchPanel
      :show="showSearch"
      :theme="chromeTheme"
      :query="searchQuery"
      :results="searchResults"
      :active-index="searchIndex"
      :count="searchCount"
      :status="bookSearchStatus"
      @close="closeSearch"
      @search="runSearch"
      @next="nextSearchResult"
      @prev="prevSearchResult"
      @update:query="searchQuery = $event"
      @jump="jumpToSearchResult"
    />

    <Transition name="fade">
      <div
        v-if="selectionMenu.visible"
        class="selection-menu"
        @click.stop
        :style="{
          top: selectionMenu.top + 'px',
          left: selectionMenu.left + 'px',
          background: chromeTheme.popup,
          color: chromeTheme.fontColor,
        }"
      >
        <div class="selection-menu-text">{{ selectionMenu.text }}</div>
        <div class="selection-menu-actions">
          <button @click="startSpeechFromSelection">从本段听</button>
          <button @click="addSelectionBookmark">加入书签</button>
          <button @click="addSelectionReplaceRule('book')">本书净化</button>
          <button @click="addSelectionReplaceRule('source')">书源净化</button>
        </div>
      </div>
    </Transition>

    <BookDetailModal
      v-model="showBookInfo"
      :book="bookInfoBook"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, defineAsyncComponent } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useReaderStore, fontPresets } from '../stores/reader'
import { useBookshelfStore } from '../stores/bookshelf'
import { useAiBookStore } from '../stores/aiBook'
import { useAppStore } from '../stores/app'
import { getBookInfo, getShelfBook, saveBook } from '../api/bookshelf'
import { getAiBookMemory } from '../api/ai/book'
import {
  getChapterSummary,
  generateChapterSummary,
  getChapterSummaryConfig,
  saveChapterSummaryConfig,
} from '../api/ai/chapterSummary'
import { applySystemTheme } from '../utils/systemUi'
import { countBrowserBookCache } from '../utils/browserCache'
import { APP_VIEWPORT_CHANGE_EVENT, syncViewportSize } from '../utils/viewport'
import { isReaderInteractiveClickTarget } from '../utils/readerClick'
import { createReaderProgressAutoSaveScheduler, createReaderProgressExitSaver } from '../utils/readerProgressAutoSave'
import { buildReaderShelfBook, isBookOnShelf } from '../utils/readerShelf'
import {
  chooseSavedChapterProgress,
  clampPageIndex,
  getPageIndexFromProgress,
  getPageProgress,
} from '../utils/readerPagination'
import { buildChapterSummaryIdentity, isCurrentChapterSummaryIdentity } from '../utils/chapterSummaryState'
import { buildSummaryRelationshipGraph } from '../utils/summaryRelationshipGraph'
import { chooseChapterSummaryPlacement, clampChapterSummarySiderWidth, getChapterSummaryFontSize } from '../utils/chapterSummaryLayout'
import { getAiModelConfig, saveAiModelConfig } from '../api/ai/model'
import type { AiBookMemoryViewModel, AiServerModelConfig, Book, ChapterSummaryConfigResponse, ChapterSummaryRecord } from '../types'

import ReaderSidebar from '../components/reader/ReaderSidebar.vue'
import ReaderToolbar from '../components/reader/ReaderToolbar.vue'
import ReaderMobileControls from '../components/reader/ReaderMobileControls.vue'
import ChapterSummaryRelationshipPanel from '../components/reader/ChapterSummaryRelationshipPanel.vue'
import AiBookMapPanel from '../components/reader/AiBookMapPanel.vue'
import { useReaderSearch } from '../composables/useReaderSearch'
import { useReaderSelection } from '../composables/useReaderSelection'
import { useHorizontalPaging } from '../composables/useHorizontalPaging'
import { useContinuousReading } from '../composables/useContinuousReading'
import { useReaderAutoPlayback } from '../composables/useReaderAutoPlayback'
import {
  buildReaderBackgroundStyle,
  formatReaderChapterHtml,
  formatReaderClock,
  formatSpeechTimer,
} from './reader/readerViewPresentation'

const ReaderCatalog = defineAsyncComponent(() => import('../components/reader/ReaderCatalog.vue'))
const ReadSettings = defineAsyncComponent(() => import('../components/reader/ReadSettings.vue'))
const ReaderBookshelf = defineAsyncComponent(() => import('../components/reader/ReaderBookshelf.vue'))
const ReaderSource = defineAsyncComponent(() => import('../components/reader/ReaderSource.vue'))
const ReplaceRuleManager = defineAsyncComponent(() => import('../components/reader/ReplaceRuleManager.vue'))
const CacheManager = defineAsyncComponent(() => import('../components/reader/CacheManager.vue'))
const BookDetailModal = defineAsyncComponent(() => import('../components/BookDetailModal.vue'))
const ReaderTtsPanel = defineAsyncComponent(() => import('../components/reader/ReaderTtsPanel.vue'))
const ReaderSearchPanel = defineAsyncComponent(() => import('../components/reader/ReaderSearchPanel.vue'))

const router = useRouter()
const store = useReaderStore()
const shelfStore = useBookshelfStore()
const aiBookStore = useAiBookStore()
const appStore = useAppStore()
const READER_POSITION_PREFIX = 'reader-position:'
const SERVER_PROGRESS_AUTOSAVE_MS = 10000

interface SavedReadingPosition {
  chapterIndex: number
  progress: number
  paragraphIndex?: number
  paragraphProgress?: number
  updatedAt: number
}

const CONTINUOUS_POSITION_ANCHOR_RATIO = 0.12

function debugPositionLog(message: string, payload?: unknown) {
  void message
  void payload
}

const config = computed(() => store.config)
const theme = computed(() => store.currentTheme)

const readerBackgroundStyle = computed(() => {
  const background = store.readerBackgroundConfig
  const imageUrl = background.readerEnabled ? store.readerBackgroundUrl : ''
  return buildReaderBackgroundStyle(theme.value.body, background, imageUrl)
})
const chromeTheme = computed(() => {
  if (store.isNight || appStore.theme === 'dark') {
    return {
      ...store.currentTheme,
      popup: 'var(--color-bg-elevated)',
      fontColor: 'var(--color-text)',
    }
  }
  return store.currentTheme
})

const scrollContainerRef = ref<HTMLElement>()
const chapterTextRef = ref<HTMLElement>()
const showControls = ref(false)
const isMobile = ref(false)
const suppressHorizontalPageTransition = ref(false)
const readerShelfStatus = ref<'checking' | 'available' | 'added'>('checking')
const addingToShelf = ref(false)
const showAddToShelf = computed(() => readerShelfStatus.value === 'available' || addingToShelf.value)
const viewportWidth = ref(typeof window === 'undefined' ? 0 : window.innerWidth)
let readerShelfCheckRequestId = 0
let speechTimerTicker: number | null = null
let suppressNextTapUntil = 0
let restorePositionTimer: number | null = null
let persistPositionTimer: number | null = null
let horizontalTransitionSuppressionId = 0
const pendingRestorePosition = ref<SavedReadingPosition | null>(null)
let pendingRestoreAttempts = 0
let suppressPositionSaveUntil = 0
let suppressContinuousScrollSyncUntil = 0
let suppressContinuousAutoLoadUntil = 0
let pendingChapterNavigationFallback: 'start' | 'end' | null = null
const restoreStabilizeTimers: number[] = []
const serverProgressAutoSaveScheduler = createReaderProgressAutoSaveScheduler({
  intervalMs: SERVER_PROGRESS_AUTOSAVE_MS,
  flush: () => store.flushProgressToServer(),
})
const readerProgressExitSaver = createReaderProgressExitSaver({
  disposeAutoSave: () => serverProgressAutoSaveScheduler.dispose(),
  savePosition: () => saveReadingPosition({ force: true }),
  flushToServer: () => store.flushProgressToServer(true),
  flushToServerKeepalive: () => store.flushProgressToServerKeepalive(true),
})
const isContinuousMode = computed(() =>
  config.value.readMethod === '上下滚动' || config.value.readMethod === '上下滚动2',
)
const hideReadChaptersMode = computed(() => config.value.readMethod === '上下滚动2')
const isHorizontalPageMode = computed(() => config.value.readMethod === '左右翻页')
const isIosWebkit = computed(() => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
})
const disableSystemCallout = computed(() => {
  return isIosWebkit.value && isMobile.value && config.value.selectAction === 'popup'
})
const touchState = ref({
  startX: 0,
  startY: 0,
  startAt: 0,
  moving: false,
  horizontalLocked: false,
})
const showBookInfo = ref(false)
const bookInfoBook = ref<Book | null>(null)
const showTTSPanel = ref(false)
const ttsPanelDismissed = ref(false)
const offlineCachedCount = ref(0)
const chapterSummary = ref<ChapterSummaryRecord | null>(null)
const chapterSummaryStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const chapterSummaryError = ref('')
const showAiPanel = ref(config.value.showAiPanel)
type AiPanelTab = 'summary' | 'relationships' | 'map' | 'settings'
const aiPanelActiveTab = ref<AiPanelTab>(config.value.aiPanelActiveTab)
const chapterSummaryRelationshipMemory = ref<AiBookMemoryViewModel | null>(null)
const chapterSummaryRelationshipStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const chapterSummaryConfig = ref<ChapterSummaryConfigResponse | null>(null)
const savingChapterSummaryConfig = ref(false)
const chapterSummaryConfigDraft = reactive({
  enabledText: 'true',
  autoEnabledDefaultText: 'true',
  detailLevel: 'normal' as 'short' | 'normal' | 'detailed',
  maxWords: 300,
  temperature: 0.3,
  minContentChars: 300,
  prompt: '',
})
const aiPanelSiderWidth = ref(clampChapterSummarySiderWidth(config.value.aiPanelSiderWidth))
const aiModelConfig = reactive<AiServerModelConfig>({
  text: { enabled: false, baseUrl: '', apiKey: '', model: '', path: '/v1/chat/completions', useFullUrl: false },
  image: { enabled: false, baseUrl: '', apiKey: '', model: 'gpt-image-1', path: '/v1/images/generations', useFullUrl: false, imageSize: '1024x1024' },
  speech: { enabled: false, baseUrl: '', apiKey: '', model: 'gpt-4o-mini-tts', path: '/v1/audio/speech', useFullUrl: false, voice: 'alloy', responseFormat: 'mp3' },
})
const aiModelLoading = ref(false)
const aiModelSaving = ref(false)
const aiModelIsAdmin = ref(false)
const aiModelCanUse = ref(false)
const aiModelLoaded = ref(false)
const aiPanelSiderResizing = ref(false)
let aiPanelResizeStartX = 0
let aiPanelResizeStartWidth = 0
let chapterSummaryTimer: number | null = null
let chapterSummaryRequestId = 0
let chapterSummaryRelationshipRequestId = 0
const speechTimerNow = ref(Date.now())
const currentTimeText = computed(() => formatReaderClock(speechTimerNow.value))
const speechTimerText = computed(() => formatSpeechTimer(store.speechStopAt, speechTimerNow.value))
const {
  showSearch,
  searchQuery,
  searchResults,
  searchIndex,
  searchCount,
  bookSearchStatus,
  toggleSearch,
  openSearch,
  closeSearch,
  runSearch,
  nextSearchResult,
  prevSearchResult,
  jumpToSearchResult,
  handleContentUpdated,
  handlePresentationUpdated,
} = useReaderSearch(store)
const {
  selectionMenu,
  suppressSelectionCloseUntil,
  hideSelectionMenu,
  scheduleSelectionMenuUpdate,
  handleMouseUpSelection,
  handleTouchEndSelection,
  handleSelectionChange,
  addSelectionBookmark,
  addSelectionReplaceRule,
  getSelectionStartParagraph,
  clearSelectionState,
  disposeSelection,
} = useReaderSelection(
  store,
  appStore,
  computed(() => ({ selectAction: config.value.selectAction })),
  scrollContainerRef,
)

const offlineBannerText = computed(() => {
  if (appStore.isOnline) return ''
  if (offlineCachedCount.value > 0) {
    return `离线模式：当前书已缓存 ${offlineCachedCount.value} 章，可继续阅读已缓存章节`
  }
  return '离线模式：当前书尚未缓存到浏览器，未缓存章节将无法打开'
})

const currentChapterSummaryIdentity = computed(() => buildChapterSummaryIdentity(
  store.book?.bookUrl,
  store.currentChapter?.url,
  store.currentIndex,
))

const aiPanelPlacement = computed(() => chooseChapterSummaryPlacement({
  mode: config.value.aiPanelLayout,
  viewportWidth: viewportWidth.value,
  pageWidth: config.value.pageWidth,
  isMobile: isMobile.value,
  siderWidth: aiPanelSiderWidth.value,
}))
const showSideAiPanel = computed(() => showAiPanel.value && aiPanelPlacement.value === 'side' && !isHorizontalPageMode.value)
const showCollapsedAiPanel = computed(() => showAiPanel.value && aiPanelPlacement.value === 'collapsed' && !isHorizontalPageMode.value)
const showInlineAiPanel = computed(() => showAiPanel.value && aiPanelPlacement.value === 'inline' && !isHorizontalPageMode.value)
const aiPanelSiderStyle = computed(() => ({
  width: `${aiPanelSiderWidth.value}px`,
  background: chromeTheme.value.popup,
  color: chromeTheme.value.fontColor,
}))
const aiPanelBodyStyle = computed(() => ({
  fontSize: `${getChapterSummaryFontSize(config.value.aiPanelFontSize)}px`,
  fontFamily: currentFontFamily.value || 'var(--font-body)',
}))
const chapterSummaryRelationshipGraph = computed(() => buildSummaryRelationshipGraph({
  memory: chapterSummaryRelationshipMemory.value,
  currentChapterIndex: store.currentIndex,
}))

function clearChapterSummaryTimer() {
  if (!chapterSummaryTimer) return
  window.clearTimeout(chapterSummaryTimer)
  chapterSummaryTimer = null
}

function resetChapterSummaryState() {
  clearChapterSummaryTimer()
  chapterSummary.value = null
  chapterSummaryStatus.value = 'idle'
  chapterSummaryError.value = ''
}

function resetChapterSummaryRelationshipState() {
  chapterSummaryRelationshipRequestId += 1
  chapterSummaryRelationshipMemory.value = null
  chapterSummaryRelationshipStatus.value = 'idle'
}

async function loadChapterSummaryRelationshipMemory() {
  const bookUrl = store.book?.bookUrl
  if (!bookUrl) {
    resetChapterSummaryRelationshipState()
    return
  }

  const requestId = ++chapterSummaryRelationshipRequestId
  chapterSummaryRelationshipMemory.value = null
  chapterSummaryRelationshipStatus.value = 'loading'
  try {
    const response = await getAiBookMemory(bookUrl)
    if (requestId !== chapterSummaryRelationshipRequestId || store.book?.bookUrl !== bookUrl) return
    chapterSummaryRelationshipMemory.value = response.memory
    chapterSummaryRelationshipStatus.value = 'ready'
  } catch {
    if (requestId !== chapterSummaryRelationshipRequestId || store.book?.bookUrl !== bookUrl) return
    chapterSummaryRelationshipMemory.value = null
    chapterSummaryRelationshipStatus.value = 'error'
  }
}


function applyChapterSummaryConfigDraft(response: ChapterSummaryConfigResponse) {
  chapterSummaryConfig.value = response
  chapterSummaryConfigDraft.enabledText = response.config.enabled ? 'true' : 'false'
  chapterSummaryConfigDraft.autoEnabledDefaultText = response.config.autoEnabledDefault ? 'true' : 'false'
  chapterSummaryConfigDraft.detailLevel = response.config.detailLevel
  chapterSummaryConfigDraft.maxWords = response.config.maxWords
  chapterSummaryConfigDraft.temperature = response.config.temperature
  chapterSummaryConfigDraft.minContentChars = response.config.minContentChars
  chapterSummaryConfigDraft.prompt = response.config.prompt
}

async function loadChapterSummaryConfigForSider() {
  try {
    applyChapterSummaryConfigDraft(await getChapterSummaryConfig())
  } catch {
    chapterSummaryConfig.value = null
  }
}

function normalizeFiniteNumber(value: unknown, fallback: number) {
  if (value === '' || value === null || value === undefined) return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

async function saveChapterSummaryGenerationSettings(options: { silent?: boolean } | Event = {}) {
  const silent = !(options instanceof Event) && Boolean(options.silent)
  if (!chapterSummaryConfig.value?.isAdmin) {
    appStore.showToast('请输入管理密码后再保存生成设置', 'warning')
    return
  }
  savingChapterSummaryConfig.value = true
  try {
    const saved = await saveChapterSummaryConfig({
      enabled: chapterSummaryConfigDraft.enabledText === 'true',
      autoEnabledDefault: chapterSummaryConfigDraft.autoEnabledDefaultText === 'true',
      detailLevel: chapterSummaryConfigDraft.detailLevel,
      maxWords: normalizeFiniteNumber(chapterSummaryConfigDraft.maxWords, 300),
      temperature: normalizeFiniteNumber(chapterSummaryConfigDraft.temperature, 0.3),
      minContentChars: normalizeFiniteNumber(chapterSummaryConfigDraft.minContentChars, 300),
      prompt: chapterSummaryConfigDraft.prompt,
    })
    applyChapterSummaryConfigDraft(saved)
    if (!silent) appStore.showToast('摘要生成设置已保存', 'success')
  } catch (error) {
    appStore.showToast((error as Error).message || '摘要生成设置保存失败', 'error')
  } finally {
    savingChapterSummaryConfig.value = false
  }
}

async function generateChapterSummaryAfterSavingSettings(force: boolean) {
  if (chapterSummaryConfig.value?.isAdmin) {
    await saveChapterSummaryGenerationSettings({ silent: true })
  }
  await generateChapterSummaryForCurrentChapter(force)
}

function restoreDefaultChapterSummaryPrompt() {
  // Task 4 UI 文案计划为“恢复当前”，这里恢复的是当前已保存到服务端的 prompt。
  const fallback = chapterSummaryConfig.value?.config.prompt || ''
  chapterSummaryConfigDraft.prompt = fallback
}

async function loadChapterSummaryForCurrentChapter() {
  const bookUrl = store.book?.bookUrl
  const chapterUrl = store.currentChapter?.url
  if (!bookUrl || !chapterUrl) {
    resetChapterSummaryState()
    return
  }

  const identity = currentChapterSummaryIdentity.value
  const requestId = ++chapterSummaryRequestId
  chapterSummaryError.value = ''
  try {
    const res = await getChapterSummary(bookUrl, chapterUrl)
    if (requestId !== chapterSummaryRequestId || !isCurrentChapterSummaryIdentity(currentChapterSummaryIdentity.value, identity)) return
    chapterSummary.value = res.summary
    chapterSummaryStatus.value = res.summary ? 'ready' : 'idle'
    if (!res.summary) scheduleAutoChapterSummary(identity)
  } catch (error) {
    if (requestId !== chapterSummaryRequestId) return
    chapterSummaryStatus.value = 'error'
    chapterSummaryError.value = (error as Error).message || '摘要加载失败'
  }
}

function scheduleAutoChapterSummary(identity: string) {
  clearChapterSummaryTimer()
  if (!showAiPanel.value) return
  if (!config.value.enableChapterSummaryAuto) return
  if (isHorizontalPageMode.value) return
  if (!store.displayContent || store.displayContent.trim().length < 300) return
  chapterSummaryTimer = window.setTimeout(() => {
    if (!showAiPanel.value) return
    if (!isCurrentChapterSummaryIdentity(currentChapterSummaryIdentity.value, identity)) return
    void generateChapterSummaryForCurrentChapter(false)
  }, 1500)
}

async function generateChapterSummaryForCurrentChapter(force: boolean) {
  const bookUrl = store.book?.bookUrl
  const chapter = store.currentChapter
  if (!bookUrl || !chapter?.url || !store.displayContent.trim()) return

  const identity = currentChapterSummaryIdentity.value
  const requestId = ++chapterSummaryRequestId
  clearChapterSummaryTimer()
  chapterSummaryStatus.value = 'loading'
  chapterSummaryError.value = ''
  try {
    const res = await generateChapterSummary({
      bookUrl,
      chapterUrl: chapter.url,
      chapterIndex: store.currentIndex,
      chapterTitle: chapter.title,
      content: store.displayContent,
      force,
      previousChapters: buildPreviousChapterSummaryContext(),
    })
    if (requestId !== chapterSummaryRequestId || !isCurrentChapterSummaryIdentity(currentChapterSummaryIdentity.value, identity)) return
    chapterSummary.value = res.summary
    chapterSummaryStatus.value = res.summary ? 'ready' : 'idle'
  } catch (error) {
    if (requestId !== chapterSummaryRequestId) return
    chapterSummaryStatus.value = chapterSummary.value ? 'ready' : 'error'
    chapterSummaryError.value = (error as Error).message || '摘要生成失败'
  }
}

async function generateAiBookMapForCurrentBook() {
  const bookUrl = store.book?.bookUrl
  if (!bookUrl) return
  try {
    const map = await aiBookStore.generateMap({
      bookUrl,
      sourceChapterIndex: store.currentIndex,
    })
    if (aiBookStore.memoryView?.bookUrl === bookUrl) {
      chapterSummaryRelationshipMemory.value = aiBookStore.memoryView
      chapterSummaryRelationshipStatus.value = 'ready'
    } else if (map) {
      await loadChapterSummaryRelationshipMemory()
    }
    appStore.showToast('AI 地图已生成', 'success')
  } catch (error) {
    appStore.showToast((error as Error).message || 'AI 地图生成失败', 'error')
    await loadChapterSummaryRelationshipMemory()
  }
}

function expandCollapsedAiPanel() {
  aiPanelActiveTab.value = chapterSummary.value ? 'summary' : 'settings'
  store.updateConfig('aiPanelLayout', 'auto')
}

function copyChapterSummary() {
  if (!chapterSummary.value) return
  const text = [
    chapterSummary.value.summary,
    chapterSummary.value.keyPoints.length ? `要点：${chapterSummary.value.keyPoints.join('；')}` : '',
  ].filter(Boolean).join('\n')
  void navigator.clipboard?.writeText(text)
  appStore.showToast('摘要已复制', 'success')
}

function buildPreviousChapterSummaryContext() {
  const end = Math.max(0, store.currentIndex)
  return store.chapters
    .slice(Math.max(0, end - 5), end)
    .map((chapter) => ({
      chapterUrl: chapter.url,
      chapterIndex: chapter.index,
      chapterTitle: chapter.title,
    }))
}

function adjustAiPanelFontSize(delta: number) {
  store.updateConfig('aiPanelFontSize', getChapterSummaryFontSize(config.value.aiPanelFontSize + delta))
}

function adjustAiPanelSiderWidth(delta: number) {
  aiPanelSiderWidth.value = clampChapterSummarySiderWidth(aiPanelSiderWidth.value + delta)
  store.updateConfig('aiPanelSiderWidth', aiPanelSiderWidth.value)
}

function handleAiPanelSiderResize(event: PointerEvent) {
  if (!aiPanelSiderResizing.value) return
  aiPanelSiderWidth.value = clampChapterSummarySiderWidth(aiPanelResizeStartWidth + aiPanelResizeStartX - event.clientX)
}

function stopAiPanelSiderResize() {
  if (!aiPanelSiderResizing.value) return
  aiPanelSiderResizing.value = false
  window.removeEventListener('pointermove', handleAiPanelSiderResize)
  window.removeEventListener('pointerup', stopAiPanelSiderResize)
  store.updateConfig('aiPanelSiderWidth', aiPanelSiderWidth.value)
}

function startAiPanelSiderResize(event: PointerEvent) {
  event.preventDefault()
  aiPanelSiderResizing.value = true
  aiPanelResizeStartX = event.clientX
  aiPanelResizeStartWidth = aiPanelSiderWidth.value
  window.addEventListener('pointermove', handleAiPanelSiderResize)
  window.addEventListener('pointerup', stopAiPanelSiderResize)
}

async function refreshOfflineCacheState() {
  if (!store.book) {
    offlineCachedCount.value = 0
    return
  }
  offlineCachedCount.value = await countBrowserBookCache(store.book.bookUrl).catch(() => 0)
}

let refreshOfflineCacheStateTimer: number | null = null

function scheduleRefreshOfflineCacheState() {
  if (refreshOfflineCacheStateTimer) clearTimeout(refreshOfflineCacheStateTimer)
  refreshOfflineCacheStateTimer = window.setTimeout(() => {
    void refreshOfflineCacheState()
  }, 120)
}

function checkMedia() {
  viewportWidth.value = window.innerWidth
  isMobile.value = window.innerWidth <= 768
  window.setTimeout(() => {
    updateHorizontalMetrics()
    if (isHorizontalPageMode.value) {
      rebuildHorizontalPages()
    }
  }, 0)
}

function handleViewportChange() {
  syncViewportSize()
  checkMedia()
  scheduleRestoreReadingPosition()
}

const currentFontFamily = computed(() => {
  const preset = fontPresets.find(p => p.value === config.value.fontFamily)
  return preset ? preset.family : ''
})

function formatChapterHtml(rawText: string) {
  return formatReaderChapterHtml(rawText, {
    firstLineIndent: config.value.firstLineIndent,
    paragraphSpacing: config.value.paragraphSpacing,
    searchQuery: showSearch.value ? searchQuery.value : '',
  })
}

function renderChapterHtml(rawText: string) {
  return formatChapterHtml(store.processContentForDisplay(rawText || ''))
}

const formattedContent = computed(() => formatChapterHtml(store.displayContent || ''))

const {
  horizontalPageIndex,
  horizontalPageStep,
  horizontalPageStepStyle,
  horizontalPages,
  isHorizontalAtEnd,
  rebuildHorizontalPages,
  updateHorizontalMetrics,
  updateHorizontalEndState,
  alignHorizontalToNearestPage,
  resetHorizontalPagePosition,
} = useHorizontalPaging(
  store,
  computed(() => ({
    fontSize: config.value.fontSize,
    fontWeight: config.value.fontWeight,
    lineHeight: config.value.lineHeight,
  })),
  currentFontFamily,
  formattedContent,
  isHorizontalPageMode,
  scrollContainerRef,
)

const horizontalPageTransform = computed(() => {
  const offset = horizontalPageIndex.value * Math.max(1, horizontalPageStep.value)
  return `translate3d(${-offset}px, 0, 0)`
})
const horizontalPageTransitionDuration = computed(() => {
  if (suppressHorizontalPageTransition.value) return '0ms'
  const duration = Number(config.value.animateDuration) || 0
  if (duration <= 0) return '0ms'
  return `${Math.min(220, duration)}ms`
})
const horizontalPageCount = computed(() => Math.max(1, horizontalPages.value.length))
const horizontalCurrentPage = computed(() => clampPageIndex(
  horizontalPageIndex.value,
  horizontalPageCount.value,
) + 1)
const horizontalPageProgress = computed(() => getPageProgress(
  horizontalPageIndex.value,
  horizontalPageCount.value,
))
const {
  continuousChapters,
  continuousLoadingNext,
  continuousLoadingPrev,
  suppressContinuousSync,
  syncContinuousChapterHtml,
  getContinuousChapter,
  setContinuousActiveChapter,
  initializeContinuousChapters,
  syncContinuousToStoreState,
  loadContinuousNext,
  getContinuousSections,
  pruneReadChapters,
  clearContinuousChapters,
  disposeContinuousReading,
} = useContinuousReading(
  store,
  renderChapterHtml,
  isContinuousMode,
  hideReadChaptersMode,
  scrollContainerRef,
)

function syncHorizontalPageState() {
  const maxPage = horizontalPageCount.value - 1
  const progress = horizontalPageProgress.value
  store.setChapterScrollProgress(progress)
  updateHorizontalEndState()
  if (config.value.enablePreload && maxPage > 0 && horizontalPageIndex.value >= maxPage - 1) {
    store.preloadAroundChapter(store.currentIndex)
  }
  scheduleSaveReadingPosition()
  serverProgressAutoSaveScheduler.schedule()
}

function seekHorizontalPage(pageIndex: number) {
  if (!isHorizontalPageMode.value) return
  horizontalPageIndex.value = clampPageIndex(pageIndex, horizontalPageCount.value)
  scrollContainerRef.value?.scrollTo({ left: 0, behavior: 'auto' })
  syncHorizontalPageState()
}

function pageForward() {
  const container = scrollContainerRef.value
  if (!container) return
  if (isHorizontalPageMode.value) {
    const maxPage = Math.max(0, horizontalPages.value.length - 1)
    if (horizontalPageIndex.value >= maxPage) {
      nextChapter()
      return
    }
    horizontalPageIndex.value = Math.min(maxPage, horizontalPageIndex.value + 1)
    container.scrollTo({ left: 0, behavior: 'auto' })
    syncHorizontalPageState()
    return
  }
  const step = container.clientHeight * 0.88
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
    nextChapter()
    return
  }
  container.scrollBy({ top: step, behavior: 'smooth' })
}

function pageBackward() {
  const container = scrollContainerRef.value
  if (!container) return
  if (isHorizontalPageMode.value) {
    if (horizontalPageIndex.value <= 0) {
      prevChapter()
      return
    }
    horizontalPageIndex.value = Math.max(0, horizontalPageIndex.value - 1)
    container.scrollTo({ left: 0, behavior: 'auto' })
    syncHorizontalPageState()
    return
  }
  const step = container.clientHeight * 0.88
  if (container.scrollTop <= 10) {
    prevChapter()
    return
  }
  container.scrollBy({ top: -step, behavior: 'smooth' })
}

// Navigation
async function goHome() {
  await persistReadingProgressBeforeLeave()
  router.replace('/')
}

async function refreshReaderShelfStatus() {
  const requestId = ++readerShelfCheckRequestId
  const currentBook = store.book
  if (!currentBook?.bookUrl) {
    readerShelfStatus.value = 'checking'
    return
  }
  if (isBookOnShelf(shelfStore.books, currentBook.bookUrl)) {
    readerShelfStatus.value = 'added'
    return
  }

  readerShelfStatus.value = 'checking'
  const shelfBook = await getShelfBook(currentBook.bookUrl).catch(() => null)
  if (requestId !== readerShelfCheckRequestId || store.book?.bookUrl !== currentBook.bookUrl) return
  readerShelfStatus.value = shelfBook ? 'added' : 'available'
}

async function handleAddToShelf() {
  if (!store.book || addingToShelf.value || readerShelfStatus.value === 'added') return
  addingToShelf.value = true
  try {
    const savedBook = await saveBook(buildReaderShelfBook(
      store.book,
      store.currentIndex,
      store.currentChapter?.title,
    ))
    readerShelfCheckRequestId += 1
    readerShelfStatus.value = 'added'
    Object.assign(store.book, savedBook)
    await shelfStore.fetchBooks().catch(() => undefined)
    appStore.showToast(`"${store.book.name}" 已加入书架`, 'success')
  } catch (error: unknown) {
    appStore.showToast((error as Error).message || '加入书架失败', 'error')
  } finally {
    addingToShelf.value = false
  }
}

function handlePageHide() {
  persistReadingProgressKeepalive()
}

function handleBeforeUnload() {
  persistReadingProgressKeepalive()
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'hidden') return
  persistReadingProgressTemporaryKeepalive()
}

async function persistReadingProgressBeforeLeave() {
  await readerProgressExitSaver.flushBeforeRouteLeave()
}

function persistReadingProgressKeepalive() {
  readerProgressExitSaver.flushKeepalive()
}

function persistReadingProgressTemporaryKeepalive() {
  readerProgressExitSaver.flushTemporaryKeepalive()
}

async function prevChapter() {
  const targetIndex = store.currentIndex - 1
  if (targetIndex < 0) return

  if (!isContinuousMode.value) {
    saveReadingPosition({ force: true })
    pendingChapterNavigationFallback = 'end'
    await store.prevChapter()
    return
  }

  await rebuildContinuousAtChapter(targetIndex)
}

async function nextChapter() {
  const targetIndex = store.currentIndex + 1
  if (targetIndex >= store.chapters.length) return

  if (!isContinuousMode.value) {
    saveReadingPosition({ force: true })
    pendingChapterNavigationFallback = 'start'
    await store.nextChapter()
    return
  }

  await rebuildContinuousAtChapter(targetIndex)
}

async function jumpFromCatalog(targetIndex: number) {
  if (targetIndex < 0 || targetIndex >= store.chapters.length) return

  if (!isContinuousMode.value) {
    await store.loadChapter(targetIndex)
    store.closePanel()
    scrollToTop()
    return
  }

  await rebuildContinuousAtChapter(targetIndex)
  store.closePanel()
}

async function rebuildContinuousAtChapter(targetIndex: number) {
  suppressContinuousScrollSyncUntil = Date.now() + 500
  suppressContinuousAutoLoadUntil = Date.now() + 500
  await initializeContinuousChapters(targetIndex, false)
}

function scrollToTop() {
  if (scrollContainerRef.value) {
    if (isHorizontalPageMode.value) {
      scrollContainerRef.value.scrollTo({ left: 0, behavior: 'smooth' })
    } else {
      scrollContainerRef.value.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
}

function scrollToBottom() {
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTo({ top: scrollContainerRef.value.scrollHeight, behavior: 'smooth' })
  }
}

function getPositionStorageKey(chapterIndex = store.currentIndex) {
  return store.book?.bookUrl ? `${READER_POSITION_PREFIX}${store.book.bookUrl}:${chapterIndex}` : ''
}

function getLegacyPositionStorageKey() {
  return store.book?.bookUrl ? `${READER_POSITION_PREFIX}${store.book.bookUrl}` : ''
}

function normalizePositionTimestamp(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function buildServerSavedPosition(): SavedReadingPosition | null {
  if (!store.book) return null
  if (store.book.durChapterIndex !== store.currentIndex) return null
  const rawPos = typeof store.book.durChapterPos === 'number' ? store.book.durChapterPos : 0
  const progress = rawPos > 1 ? rawPos / 10000 : rawPos
  return {
    chapterIndex: store.currentIndex,
    progress: Math.max(0, Math.min(1, progress || 0)),
    updatedAt: normalizePositionTimestamp(store.book.durChapterTime),
  }
}

function loadSavedReadingPosition() {
  const key = getPositionStorageKey()
  if (!key) {
    pendingRestorePosition.value = null
    pendingRestoreAttempts = 0
    debugPositionLog('skip load: no storage key')
    return
  }
  try {
    const legacyKey = getLegacyPositionStorageKey()
    const chapterRaw = localStorage.getItem(key)
    const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : null
    const chapterSaved = chapterRaw ? JSON.parse(chapterRaw) as SavedReadingPosition : null
    const legacySaved = legacyRaw ? JSON.parse(legacyRaw) as SavedReadingPosition : null
    const serverSaved = buildServerSavedPosition()
    const normalizedChapterSaved = chapterSaved
      ? { ...chapterSaved, updatedAt: normalizePositionTimestamp(chapterSaved.updatedAt) }
      : null
    const normalizedLegacySaved = legacySaved
      ? { ...legacySaved, updatedAt: normalizePositionTimestamp(legacySaved.updatedAt) }
      : null
    const eligibleServerSaved = pendingChapterNavigationFallback && !chapterSaved && !legacySaved
      ? null
      : serverSaved
    const selection = chooseSavedChapterProgress(
      store.currentIndex,
      normalizedChapterSaved,
      normalizedLegacySaved,
      eligibleServerSaved,
    )
    const selected = selection.position
    const source = selection.source

    if (!selected) {
      pendingRestorePosition.value = pendingChapterNavigationFallback
        ? {
            chapterIndex: store.currentIndex,
            progress: pendingChapterNavigationFallback === 'end' ? 1 : 0,
            updatedAt: Date.now(),
          }
        : null
      pendingRestoreAttempts = 0
      clearRestoreStabilizers()
      debugPositionLog(chapterRaw || legacyRaw ? 'ignored saved position' : 'no saved position', {
        key,
        currentIndex: store.currentIndex,
        chapterSaved,
        legacySaved,
        serverSaved,
        fallback: pendingChapterNavigationFallback,
      })
      pendingChapterNavigationFallback = null
      return
    }

    pendingRestorePosition.value = selected
    pendingChapterNavigationFallback = null
    pendingRestoreAttempts = 0
    clearRestoreStabilizers()
    debugPositionLog('loaded saved position', {
      key,
      saved: selected,
      source,
      chapterSaved,
      legacySaved,
      serverSaved,
      currentIndex: store.currentIndex,
      accepted: !!pendingRestorePosition.value,
    })
    if (pendingRestorePosition.value) {
      suppressPositionSaveUntil = Date.now() + 2500
    }
  } catch {
    pendingRestorePosition.value = null
    pendingRestoreAttempts = 0
    clearRestoreStabilizers()
    debugPositionLog('failed to parse saved position', { key })
  }
}

function saveReadingPosition(options: { force?: boolean } = {}) {
  const key = getPositionStorageKey()
  const container = scrollContainerRef.value
  const suppressed = !options.force && Date.now() < suppressPositionSaveUntil
  if (!key || !container || store.loading || !store.book || suppressed) {
    debugPositionLog('skip save', {
      key,
      hasContainer: !!container,
      loading: store.loading,
      hasBook: !!store.book,
      suppressed,
      currentIndex: store.currentIndex,
    })
    return
  }

  const basePosition: SavedReadingPosition = {
    chapterIndex: store.currentIndex,
    progress: store.chapterScrollProgress,
    updatedAt: Date.now(),
  }

  const anchorRatio = isContinuousMode.value ? CONTINUOUS_POSITION_ANCHOR_RATIO : 0.3
  const anchorViewportY = container.getBoundingClientRect().top + container.clientHeight * anchorRatio
  if (isContinuousMode.value && continuousChapters.value.length) {
    const section = container.querySelector(`.continuous-chapter[data-chapter-index="${store.currentIndex}"]`) as HTMLElement | null
    const paragraphs = Array.from(section?.querySelectorAll('.chapter-text p') || []) as HTMLElement[]
    if (paragraphs.length) {
      let activeParagraph = paragraphs[0]
      let paragraphIndex = 0
      paragraphs.forEach((paragraph, index) => {
        if (paragraph.getBoundingClientRect().top <= anchorViewportY) {
          activeParagraph = paragraph
          paragraphIndex = index
        }
      })
      const rect = activeParagraph.getBoundingClientRect()
      const paragraphProgress = rect.height > 0 ? Math.max(0, Math.min(1, (anchorViewportY - rect.top) / rect.height)) : 0
      basePosition.paragraphIndex = paragraphIndex
      basePosition.paragraphProgress = paragraphProgress
    }
  } else if (!isHorizontalPageMode.value) {
    const paragraphs = Array.from(chapterTextRef.value?.querySelectorAll('p') || []) as HTMLElement[]
    if (paragraphs.length) {
      let activeParagraph = paragraphs[0]
      let paragraphIndex = 0
      paragraphs.forEach((paragraph, index) => {
        if (paragraph.getBoundingClientRect().top <= anchorViewportY) {
          activeParagraph = paragraph
          paragraphIndex = index
        }
      })
      const rect = activeParagraph.getBoundingClientRect()
      const paragraphProgress = rect.height > 0 ? Math.max(0, Math.min(1, (anchorViewportY - rect.top) / rect.height)) : 0
      basePosition.paragraphIndex = paragraphIndex
      basePosition.paragraphProgress = paragraphProgress
    }
  }

  localStorage.setItem(key, JSON.stringify(basePosition))
  debugPositionLog('saved position', { key, position: basePosition })
}

function scheduleSaveReadingPosition() {
  if (persistPositionTimer) clearTimeout(persistPositionTimer)
  persistPositionTimer = window.setTimeout(() => {
    saveReadingPosition()
  }, 120)
}

function restoreReadingPosition() {
  return restoreReadingPositionInternal(pendingRestorePosition.value, true)
}

function clearRestoreStabilizers() {
  while (restoreStabilizeTimers.length) {
    const timer = restoreStabilizeTimers.pop()
    if (typeof timer === 'number') clearTimeout(timer)
  }
}

function scheduleRestoreStabilization(saved: SavedReadingPosition) {
  clearRestoreStabilizers()
  if (!isIosWebkit.value || isHorizontalPageMode.value) return
  ;[140, 320, 680].forEach((delay) => {
    const timer = window.setTimeout(() => {
      if (store.loading || !scrollContainerRef.value || saved.chapterIndex !== store.currentIndex) return
      void nextTick(() => {
        restoreReadingPositionInternal(saved, false)
      })
    }, delay)
    restoreStabilizeTimers.push(timer)
  })
}

function restoreReadingPositionInternal(saved: SavedReadingPosition | null, finalize: boolean) {
  const container = scrollContainerRef.value
  if (!saved || !container || saved.chapterIndex !== store.currentIndex) {
    debugPositionLog('restore aborted', {
      hasSaved: !!saved,
      hasContainer: !!container,
      savedChapterIndex: saved?.chapterIndex,
      currentIndex: store.currentIndex,
    })
    return false
  }

  if (isHorizontalPageMode.value) {
    if (store.loading || !horizontalPages.value.length) {
      debugPositionLog('restore waiting: horizontal content not ready', {
        saved,
        loading: store.loading,
        pageCount: horizontalPages.value.length,
      })
      return false
    }
    horizontalPageIndex.value = getPageIndexFromProgress(
      saved.progress || 0,
      horizontalPageCount.value,
    )
    store.setChapterScrollProgress(horizontalPageProgress.value)
    container.scrollTo({ left: 0, behavior: 'auto' })
    updateHorizontalEndState()
    if (finalize) {
      pendingRestorePosition.value = null
      pendingRestoreAttempts = 0
    }
    debugPositionLog('restored horizontal position', {
      saved,
      pageIndex: horizontalPageIndex.value,
      pageCount: horizontalPageCount.value,
    })
    return true
  }

  const anchorOffset = container.clientHeight * (isContinuousMode.value ? CONTINUOUS_POSITION_ANCHOR_RATIO : 0.3)
  let targetTop = 0

  if (isContinuousMode.value) {
    if (store.loading || !continuousChapters.value.length) {
      debugPositionLog('restore waiting: continuous content not ready', {
        saved,
        loading: store.loading,
        continuousCount: continuousChapters.value.length,
      })
      return false
    }
    const section = container.querySelector(`.continuous-chapter[data-chapter-index="${saved.chapterIndex}"]`) as HTMLElement | null
    if (!section) {
      debugPositionLog('restore failed: section not found', {
        saved,
        availableSections: Array.from(container.querySelectorAll('.continuous-chapter')).map((el) => (el as HTMLElement).dataset.chapterIndex),
      })
      return false
    }
    const paragraphs = Array.from(section.querySelectorAll('.chapter-text p')) as HTMLElement[]
    if (typeof saved.paragraphIndex === 'number' && !paragraphs.length) {
      debugPositionLog('restore waiting: continuous paragraphs not ready', {
        saved,
        sectionIndex: saved.chapterIndex,
      })
      return false
    }
    if (paragraphs.length && typeof saved.paragraphIndex === 'number') {
      const paragraph = paragraphs[Math.max(0, Math.min(paragraphs.length - 1, saved.paragraphIndex))]
      const top = paragraph.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
      const paragraphProgress = Math.max(0, Math.min(1, saved.paragraphProgress || 0))
      targetTop = Math.max(section.offsetTop, top + paragraph.offsetHeight * paragraphProgress - anchorOffset)
    } else {
      const nextSection = section.nextElementSibling as HTMLElement | null
      const sectionHeight = Math.max(1, (nextSection ? nextSection.offsetTop : container.scrollHeight) - section.offsetTop)
      if ((saved.progress || 0) > 0 && sectionHeight <= Math.max(1, container.clientHeight * 0.25)) {
        debugPositionLog('restore waiting: continuous section height not ready', {
          saved,
          sectionHeight,
          clientHeight: container.clientHeight,
        })
        return false
      }
      targetTop = Math.max(
        section.offsetTop,
        section.offsetTop + sectionHeight * Math.max(0, Math.min(1, saved.progress || 0)),
      )
    }
  } else {
    const paragraphs = Array.from(chapterTextRef.value?.querySelectorAll('p') || []) as HTMLElement[]
    if (store.loading || !chapterTextRef.value) {
      debugPositionLog('restore waiting: chapter content not ready', {
        saved,
        loading: store.loading,
        hasChapterText: !!chapterTextRef.value,
      })
      return false
    }
    if (typeof saved.paragraphIndex === 'number' && !paragraphs.length) {
      debugPositionLog('restore waiting: chapter paragraphs not ready', {
        saved,
      })
      return false
    }
    if (paragraphs.length && typeof saved.paragraphIndex === 'number') {
      const paragraph = paragraphs[Math.max(0, Math.min(paragraphs.length - 1, saved.paragraphIndex))]
      const top = paragraph.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
      const paragraphProgress = Math.max(0, Math.min(1, saved.paragraphProgress || 0))
      targetTop = top + paragraph.offsetHeight * paragraphProgress - anchorOffset
    } else {
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
      if ((saved.progress || 0) > 0 && maxScroll <= 4) {
        debugPositionLog('restore waiting: max scroll not ready', {
          saved,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          maxScroll,
        })
        return false
      }
      targetTop = maxScroll * Math.max(0, Math.min(1, saved.progress || 0))
    }
  }

  container.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' })
  if (finalize) {
    pendingRestorePosition.value = null
    pendingRestoreAttempts = 0
    const suppressMs = isContinuousMode.value && isIosWebkit.value ? 1600 : 500
    suppressContinuousScrollSyncUntil = Date.now() + suppressMs
    suppressContinuousAutoLoadUntil = Date.now() + suppressMs
    scheduleRestoreStabilization(saved)
  }
  suppressPositionSaveUntil = Date.now() + 400
  debugPositionLog('restored vertical position', {
    saved,
    targetTop,
    isContinuous: isContinuousMode.value,
    finalize,
  })
  return true
}

function scheduleRestoreReadingPosition() {
  if (restorePositionTimer) clearTimeout(restorePositionTimer)
  debugPositionLog('schedule restore', {
    attempts: pendingRestoreAttempts,
    hasPending: !!pendingRestorePosition.value,
    currentIndex: store.currentIndex,
  })
  restorePositionTimer = window.setTimeout(() => {
    void nextTick(() => {
      const restored = restoreReadingPosition()
      if (!restored && pendingRestorePosition.value && pendingRestoreAttempts < 12) {
        pendingRestoreAttempts += 1
        debugPositionLog('restore retry', {
          attempts: pendingRestoreAttempts,
          pending: pendingRestorePosition.value,
          currentIndex: store.currentIndex,
        })
        scheduleRestoreReadingPosition()
      } else if (!restored) {
        debugPositionLog('restore gave up', {
          attempts: pendingRestoreAttempts,
          pending: pendingRestorePosition.value,
          currentIndex: store.currentIndex,
        })
        pendingRestorePosition.value = null
        pendingRestoreAttempts = 0
      }
    })
  }, pendingRestoreAttempts === 0 ? 0 : 80)
}

const {
  clearReadingClass,
  startAutoScroll,
  stopAutoScroll,
  startSpeech,
  speechPrev,
  speechNext,
  restartSpeechFromCurrentParagraph,
  cancelSpeechTransition,
  resetAutoParagraphIndex,
  handleContentChanged,
  disposeAutoPlayback,
} = useReaderAutoPlayback(
  store,
  computed(() => ({
    autoPageMode: config.value.autoPageMode,
    clickAction: config.value.clickAction,
    scrollPixel: config.value.scrollPixel,
    pageSpeed: config.value.pageSpeed,
    fontSize: config.value.fontSize,
    lineHeight: config.value.lineHeight,
  })),
  isContinuousMode,
  scrollContainerRef,
  chapterTextRef,
  nextChapter,
  prevChapter,
  {
    isEnabled: isHorizontalPageMode,
    getPageIndex: () => horizontalPageIndex.value,
    showPage: seekHorizontalPage,
  },
)

function startSpeechFromSelection() {
  const paragraph = getSelectionStartParagraph()
  if (!paragraph) return
  cancelSpeechTransition()
  clearSelectionState()
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
  startSpeech(paragraph)
}

// Click behavior
function handleBackgroundClick(e: Event) {
  // If clicked directly on the reader-view wrapper, toggle controls
  if ((e.target as HTMLElement).classList.contains('reader-view')) {
    showControls.value = false
  }
}

function handleContextMenu(event: Event) {
  if (!disableSystemCallout.value) return
  event.preventDefault()
}

function handleGlobalClick(e: MouseEvent) {
  if (store.activePanel) return
  if (Date.now() < suppressNextTapUntil) return
  if (Date.now() < suppressSelectionCloseUntil.value) return
  if (selectionMenu.value.visible) {
    hideSelectionMenu()
    return
  }
  if (window.getSelection?.()?.toString().trim()) return

  const target = e.target as HTMLElement | null
  if (isReaderInteractiveClickTarget(target)) return
  if (showControls.value && !store.activePanel) {
    showControls.value = false
    return
  }
  if (store.isAutoScrolling) return
  
  if (isHorizontalPageMode.value && isMobile.value) {
    const x = e.clientX / window.innerWidth
    if (x < 0.3) {
      clickZoneAction('prev')
    } else if (x > 0.7) {
      clickZoneAction('next')
    } else {
      clickZoneAction('menu')
    }
  } else {
    const y = e.clientY / window.innerHeight
    if (y < 0.3) {
      clickZoneAction('prev')
    } else if (y > 0.7) {
      clickZoneAction('next')
    } else {
      clickZoneAction('menu')
    }
  }
}

function clickZoneAction(zone: 'prev' | 'menu' | 'next') {
  if (store.isAutoScrolling) return

  if (zone === 'menu') {
    if (isMobile.value) {
      showControls.value = !showControls.value
    }
    return
  }
  
  if (config.value.clickAction === 'none') return
  
  const container = scrollContainerRef.value
  if (!container) return
  
  if (isHorizontalPageMode.value) {
    if (zone === 'next') pageForward()
    else pageBackward()
    return
  }

  const h = container.clientHeight
  const delta = h * 0.8 // Page scroll amount

  if (config.value.clickAction === 'next') {
    pageForward()
    return
  }
  
  if (zone === 'next') {
    if (container.scrollTop + h >= container.scrollHeight - 10) {
      if (config.value.clickAction === 'auto') nextChapter()
    } else {
      container.scrollBy({ top: delta, behavior: 'smooth' })
    }
  } else {
    if (container.scrollTop === 0) {
      if (config.value.clickAction === 'auto') prevChapter()
    } else {
      container.scrollBy({ top: -delta, behavior: 'smooth' })
    }
  }
}

function handleScroll() {
  hideSelectionMenu()
  const container = scrollContainerRef.value
  if (container && isContinuousMode.value && continuousChapters.value.length) {
    if (Date.now() < suppressContinuousScrollSyncUntil) {
      scheduleSaveReadingPosition()
      return
    }
    const sections = getContinuousSections()
    if (sections.length) {
      const anchorLine = container.scrollTop + container.clientHeight * CONTINUOUS_POSITION_ANCHOR_RATIO
      let activeSection = sections[0]
      for (const section of sections) {
        if (section.offsetTop <= anchorLine) {
          activeSection = section
        } else {
          break
        }
      }

      const activeIndex = Number(activeSection.dataset.chapterIndex || 0)
      const activeChapter = getContinuousChapter(activeIndex)
      const nextSection = sections[sections.indexOf(activeSection) + 1] || null
      const sectionRange = Math.max(
        1,
        (nextSection ? nextSection.offsetTop : container.scrollHeight) - activeSection.offsetTop,
      )
      const progress = Math.max(0, Math.min(1, (container.scrollTop - activeSection.offsetTop) / sectionRange))
      if (activeChapter) {
        if (store.currentIndex !== activeIndex || store.content !== activeChapter.content) {
          setContinuousActiveChapter(activeIndex, activeChapter.content, progress)
        } else {
          store.setChapterScrollProgress(progress)
        }
      }
    }

    if (Date.now() >= suppressContinuousAutoLoadUntil && container.scrollHeight - (container.scrollTop + container.clientHeight) < 480) {
      loadContinuousNext()
    }
  } else if (container) {
    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight)
    const progress = isHorizontalPageMode.value
      ? (() => {
          const maxPage = Math.max(0, horizontalPages.value.length - 1)
          return maxPage <= 0 ? 1 : horizontalPageIndex.value / maxPage
        })()
      : (container.scrollHeight <= container.clientHeight ? 1 : container.scrollTop / maxScroll)
    store.setChapterScrollProgress(progress)
    if (isHorizontalPageMode.value) {
      updateHorizontalMetrics()
      const maxPage = Math.max(0, horizontalPages.value.length - 1)
      horizontalPageIndex.value = Math.max(0, Math.min(maxPage, horizontalPageIndex.value))
      if (container.scrollLeft !== 0) {
        container.scrollTo({ left: 0, behavior: 'auto' })
      }
      updateHorizontalEndState()
      if (config.value.enablePreload && maxPage > 0 && horizontalPageIndex.value >= maxPage - 1) {
        store.preloadAroundChapter(store.currentIndex)
      }
    } else if (config.value.enablePreload && container.scrollHeight - (container.scrollTop + container.clientHeight) < container.clientHeight * 1.5) {
      store.preloadAroundChapter(store.currentIndex)
    }
  }
  if (showControls.value && !store.activePanel) {
    showControls.value = false
  }
  scheduleSaveReadingPosition()
  serverProgressAutoSaveScheduler.schedule()
}

function handleTouchStart(event: TouchEvent) {
  stopAutoScroll()
  hideSelectionMenu()
  const touch = event.touches[0]
  if (!touch) return
  touchState.value = {
    startX: touch.clientX,
    startY: touch.clientY,
    startAt: Date.now(),
    moving: true,
    horizontalLocked: false,
  }
}

function handleTouchMove(event: TouchEvent) {
  if (!isMobile.value || config.value.readMethod !== '左右翻页' || !touchState.value.moving) return
  const selectedText = window.getSelection?.()?.toString().trim()
  if (selectedText) return
  // Keep long-press text selection gestures available on mobile.
  if (Date.now() - touchState.value.startAt > 220) return
  const touch = event.touches[0]
  if (!touch) return
  const deltaX = touch.clientX - touchState.value.startX
  const deltaY = touch.clientY - touchState.value.startY
  if (Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) {
    touchState.value.horizontalLocked = true
    event.preventDefault()
  }
}

function handleTouchEnd(event: TouchEvent) {
  if (!isMobile.value || config.value.readMethod !== '左右翻页' || !touchState.value.moving) {
    touchState.value.moving = false
    return
  }
  const target = event.target as HTMLElement | null
  if (isReaderInteractiveClickTarget(target)) {
    touchState.value.moving = false
    return
  }
  const touchDuration = Date.now() - touchState.value.startAt
  const selectedText = window.getSelection?.()?.toString().trim()
  if (selectedText) {
    suppressNextTapUntil = Date.now() + 900
    touchState.value.moving = false
    scheduleSelectionMenuUpdate(260)
    return
  }
  const touch = event.changedTouches[0]
  if (!touch) {
    touchState.value.moving = false
    return
  }
  const deltaX = touch.clientX - touchState.value.startX
  const deltaY = touch.clientY - touchState.value.startY
  let didPageTurn = false
  if (Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY)) {
    suppressNextTapUntil = Date.now() + 350
    if (deltaX < 0) {
      pageForward()
    } else {
      pageBackward()
    }
    didPageTurn = true
  }
  touchState.value.moving = false
  if (!didPageTurn && touchDuration > 260) {
    // Long-press should be reserved for native text selection, not page action.
    suppressNextTapUntil = Date.now() + 900
    scheduleSelectionMenuUpdate(260)
    return
  }
  if (!didPageTurn) {
    const moved = Math.hypot(deltaX, deltaY)
    if (touchDuration <= 260 && moved < 10) {
      suppressNextTapUntil = Date.now() + 350
      if (showControls.value && !store.activePanel) {
        showControls.value = false
      } else {
        const x = touch.clientX / window.innerWidth
        if (x < 0.3) {
          clickZoneAction('prev')
        } else if (x > 0.7) {
          clickZoneAction('next')
        } else {
          clickZoneAction('menu')
        }
      }
    } else {
      window.setTimeout(() => {
        alignHorizontalToNearestPage(touchState.value.moving)
      }, 120)
    }
  }
  scheduleSelectionMenuUpdate(260)
}

function openCachePanel() {
  store.togglePanel('cache')
}

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  const activeElement = document.activeElement as HTMLElement | null
  const tagName = activeElement?.tagName?.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || activeElement?.isContentEditable) {
    return
  }

  // Handle Escape key first - close panels or go home
  if (e.key === 'Escape') {
    if (store.activePanel) {
      store.closePanel()
      return
    }
    if (selectionMenu.value.visible) {
      hideSelectionMenu()
      return
    }
    if (showSearch.value) {
      closeSearch()
      return
    }
    if (showTTSPanel.value) {
      closeTTSPanel()
      return
    }
    if (showBookInfo.value) {
      showBookInfo.value = false
      return
    }
    if (showControls.value) {
      showControls.value = false
      return
    }
    // If nothing is open, go home
    goHome()
    return
  }

  // Don't process other keys when panels are open
  if (store.activePanel) return

  const container = scrollContainerRef.value
  if (!container) return

  const h = container.clientHeight

  switch (e.key) {
    case ' ':
    case 'Space':
      e.preventDefault()
      pageForward()
      break
    case 'ArrowDown':
    case 'PageDown':
      e.preventDefault()
      if (isHorizontalPageMode.value) {
        pageForward()
      } else {
        container.scrollBy({ top: h * 0.8, behavior: 'smooth' })
      }
      break
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault()
      if (isHorizontalPageMode.value) {
        pageBackward()
      } else {
        container.scrollBy({ top: -(h * 0.8), behavior: 'smooth' })
      }
      break
    case 'ArrowRight':
      e.preventDefault()
      if (isHorizontalPageMode.value) {
        pageForward()
      } else {
        nextChapter()
      }
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (isHorizontalPageMode.value) {
        pageBackward()
      } else {
        prevChapter()
      }
      break
    case 'Home':
      e.preventDefault()
      scrollToTop()
      break
    case 'End':
      e.preventDefault()
      scrollToBottom()
      break
  }
}

// Toolbar actions
async function toggleBookmark() {
  store.togglePanel('bookmark')
}

function handleTTS() {
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
}

function closeTTSPanel() {
  showTTSPanel.value = false
  ttsPanelDismissed.value = true
}

function toggleSpeechFromPanel() {
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
  if (!store.isSpeaking) {
    startSpeech()
    return
  }
  cancelSpeechTransition()
  store.pauseTTS()
}

function handleStopTTS() {
  cancelSpeechTransition()
  store.stopTTS()
}

watch(() => store.isAutoScrolling, (val) => {
  store.autoReading = val
  if (val) startAutoScroll()
  else stopAutoScroll()
})

watch(showTTSPanel, (visible) => {
  if (!visible) return
})

function changeVoice(name: string) {
  store.setVoiceName(name)
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
  if (store.isSpeaking && !store.isPaused) {
    restartSpeechFromCurrentParagraph()
  }
}

function changeOpenAIVoice(voiceId: string) {
  if (store.speechConfig.openaiSource === 'server') return
  store.setOpenAISpeechVoice(voiceId)
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
  if (store.isSpeaking && !store.isPaused) {
    restartSpeechFromCurrentParagraph()
  }
}

function changeAzureVoice(voiceId: string) {
  store.setAzureSpeechVoice(voiceId)
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
  if (store.isSpeaking && !store.isPaused) {
    restartSpeechFromCurrentParagraph()
  }
}

function adjustSpeechRate(delta: number) {
  const next = Math.max(0.5, Math.min(3, parseFloat((store.speechConfig.speechRate + delta).toFixed(1))))
  store.setSpeechRate(next)
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
  if (store.isSpeaking && !store.isPaused) {
    restartSpeechFromCurrentParagraph()
  }
}

function adjustSpeechPitch(delta: number) {
  const next = Math.max(0.5, Math.min(2, parseFloat((store.speechConfig.speechPitch + delta).toFixed(1))))
  store.setSpeechPitch(next)
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
  if (store.isSpeaking && !store.isPaused) {
    restartSpeechFromCurrentParagraph()
  }
}

function changeSpeechVolume(volume: number) {
  store.setSpeechVolume(volume)
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
}

function setSpeechTimer(minutes: number) {
  store.setSpeechStopTimer(minutes)
  ttsPanelDismissed.value = false
  showTTSPanel.value = true
}
async function openInfo() {
  if (!store.book) return
  showBookInfo.value = true
  bookInfoBook.value = {
    ...store.book,
    durChapterIndex: store.currentIndex,
    durChapterTitle: store.currentChapter?.title || store.book.durChapterTitle,
  }
  try {
    const latest = await getBookInfo(store.book.bookUrl, store.book.origin)
    bookInfoBook.value = {
      ...store.book,
      ...latest,
      durChapterIndex: store.currentIndex,
      durChapterTitle: store.currentChapter?.title || latest.durChapterTitle || store.book.durChapterTitle,
    }
  } catch {
    appStore.showToast('获取书籍详情失败，已显示当前缓存信息', 'warning')
  }
}

function toggleAiPanel() {
  showAiPanel.value = !showAiPanel.value
  store.updateConfig('showAiPanel', showAiPanel.value)
  if (showAiPanel.value && !chapterSummary.value && chapterSummaryStatus.value !== 'loading') {
    scheduleAutoChapterSummary(currentChapterSummaryIdentity.value)
  } else if (!showAiPanel.value) {
    clearChapterSummaryTimer()
  }
  appStore.showToast(showAiPanel.value ? '已显示 AI 面板' : '已隐藏 AI 面板', 'success')
}

function hideAiPanel() {
  showAiPanel.value = false
  store.updateConfig('showAiPanel', false)
  clearChapterSummaryTimer()
}

function openAiBook() {
  if (!store.book) return
  router.push({
    name: 'ai-book',
    query: { bookUrl: store.book.bookUrl },
  })
}

function cloneAiModelConfig(config: AiServerModelConfig): AiServerModelConfig {
  return JSON.parse(JSON.stringify(config))
}

async function loadAiModelConfig() {
  aiModelLoading.value = true
  try {
    const response = await getAiModelConfig()
    Object.assign(aiModelConfig, cloneAiModelConfig(response.config))
    aiModelIsAdmin.value = response.isAdmin
    aiModelCanUse.value = response.canUseServerModel
    aiModelLoaded.value = true
  } catch (error) {
    appStore.showToast((error as Error).message || '后端模型配置读取失败', 'error')
  } finally {
    aiModelLoading.value = false
  }
}

async function handleSaveAiModelConfig() {
  if (!aiModelIsAdmin.value) return
  aiModelSaving.value = true
  try {
    const response = await saveAiModelConfig(cloneAiModelConfig(aiModelConfig))
    Object.assign(aiModelConfig, cloneAiModelConfig(response.config))
    aiModelIsAdmin.value = response.isAdmin
    aiModelCanUse.value = response.canUseServerModel
    appStore.showToast('后端模型配置已保存', 'success')
  } catch (error) {
    appStore.showToast((error as Error).message || '后端模型配置保存失败', 'error')
  } finally {
    aiModelSaving.value = false
  }
}

const aiModelStatusTitle = computed(() => {
  if (aiModelLoading.value) return '正在读取后端模型配置'
  if (aiModelIsAdmin.value) return '管理员可编辑后端模型配置'
  return aiModelCanUse.value ? '当前账号可使用后端模型' : '当前账号未开启 AI 模型权限'
})

const aiModelStatusMessage = computed(() => {
  if (aiModelLoading.value) return '加载中...'
  if (aiModelIsAdmin.value) return '配置保存到服务器，AI资料生成会使用这里的文本模型。'
  return aiModelCanUse.value ? '当前账号可使用后端模型' : '请让管理员在用户管理中开启"AI 模型"权限'
})

onBeforeRouteLeave(() => {
  clearChapterSummaryTimer()
  stopAiPanelSiderResize()
  persistReadingProgressKeepalive()
  return true
})

onMounted(async () => {
  syncViewportSize()
  void loadChapterSummaryConfigForSider()
  if (aiPanelActiveTab.value === 'settings') {
    void loadAiModelConfig()
  }
  appStore.startReadingSession()
  if (!store.book) {
    const restored = await store.restorePersistedSession()
    if (!restored) {
      router.replace('/')
      return
    }
    appStore.showToast('已恢复最近阅读的离线章节', 'success')
  }
  loadSavedReadingPosition()
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('mouseup', handleMouseUpSelection)
  document.addEventListener('touchend', handleTouchEndSelection)
    document.addEventListener('selectionchange', handleSelectionChange)
    checkMedia()
    window.addEventListener('resize', checkMedia)
    window.addEventListener(APP_VIEWPORT_CHANGE_EVENT, handleViewportChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    store.fetchVoices()
  applySystemTheme(store.isNight ? 'dark' : appStore.theme, store.currentTheme.body)
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => store.fetchVoices()
  }
  speechTimerTicker = window.setInterval(() => {
    speechTimerNow.value = Date.now()
  }, 15000)
  await Promise.all([
    store.fetchBookmarks(),
    store.fetchReplaceRules(),
  ])
  scheduleRefreshOfflineCacheState()
  updateHorizontalMetrics()
  await rebuildHorizontalPages()
  if (isContinuousMode.value) {
    await initializeContinuousChapters(store.currentIndex, false)
  }
  scheduleRestoreReadingPosition()
})

onUnmounted(() => {
    clearChapterSummaryTimer()
    stopAiPanelSiderResize()
    persistReadingProgressKeepalive()
    appStore.stopReadingSession()
    window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('mouseup', handleMouseUpSelection)
  document.removeEventListener('touchend', handleTouchEndSelection)
    document.removeEventListener('selectionchange', handleSelectionChange)
    window.removeEventListener('resize', checkMedia)
    window.removeEventListener(APP_VIEWPORT_CHANGE_EVENT, handleViewportChange)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (speechTimerTicker) clearInterval(speechTimerTicker)
  if (restorePositionTimer) clearTimeout(restorePositionTimer)
  if (persistPositionTimer) clearTimeout(persistPositionTimer)
  if (refreshOfflineCacheStateTimer) clearTimeout(refreshOfflineCacheStateTimer)
  clearRestoreStabilizers()
  disposeSelection()
  disposeContinuousReading()
  disposeAutoPlayback()
  store.stopTTS()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = null
  }
  applySystemTheme(appStore.theme)
  store.closePanel()
})

watch(() => config.value.autoPageMode, () => {
  if (!store.isAutoScrolling) return
  stopAutoScroll()
  store.isAutoScrolling = true
  startAutoScroll()
})

watch(() => config.value.readMethod, async () => {
  clearSelectionState()
  if (isContinuousMode.value) {
    await initializeContinuousChapters(store.currentIndex, false)
  } else {
    clearContinuousChapters()
    await nextTick()
    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }
  if (isHorizontalPageMode.value && scrollContainerRef.value) {
    resetHorizontalPagePosition()
  }
  await rebuildHorizontalPages()
  updateHorizontalEndState()
  scheduleRestoreReadingPosition()
})

watch(() => store.currentIndex, () => {
  if (!isHorizontalPageMode.value) return
  resetHorizontalPagePosition()
  rebuildHorizontalPages()
  updateHorizontalEndState()
})

watch(
  () => [store.book?.bookUrl, store.currentChapter?.url, store.currentIndex, store.displayContent] as const,
  () => {
    resetChapterSummaryState()
    void loadChapterSummaryForCurrentChapter()
  },
  { immediate: true },
)

watch(() => store.book?.bookUrl, () => {
  void refreshReaderShelfStatus()
}, { immediate: true })

watch(() => store.book?.bookUrl, () => {
  resetChapterSummaryRelationshipState()
  if (aiPanelActiveTab.value === 'relationships') {
    void loadChapterSummaryRelationshipMemory()
  }
  if (aiPanelActiveTab.value === 'map') {
    void loadChapterSummaryRelationshipMemory()
  }
})

watch(aiPanelActiveTab, (tab) => {
  store.updateConfig('aiPanelActiveTab', tab)
  if (tab === 'relationships' && chapterSummaryRelationshipStatus.value === 'idle') {
    void loadChapterSummaryRelationshipMemory()
  }
  if (tab === 'map' && chapterSummaryRelationshipStatus.value === 'idle') {
    void loadChapterSummaryRelationshipMemory()
  }
  if (tab === 'settings' && !aiModelLoaded.value) {
    void loadAiModelConfig()
  }
})

watch(
  () => config.value.aiPanelSiderWidth,
  (width) => {
    if (!aiPanelSiderResizing.value) {
      aiPanelSiderWidth.value = clampChapterSummarySiderWidth(width)
    }
  },
)

watch(
  [() => store.content, () => config.value.fontSize, () => config.value.fontWeight, () => config.value.lineHeight, () => config.value.paragraphSpacing, () => config.value.firstLineIndent, showSearch, searchQuery],
  async () => {
    if (isHorizontalPageMode.value) {
      const suppressionId = ++horizontalTransitionSuppressionId
      suppressHorizontalPageTransition.value = true
      horizontalPageIndex.value = 0
      await rebuildHorizontalPages()
      window.setTimeout(() => {
        if (suppressionId === horizontalTransitionSuppressionId) {
          suppressHorizontalPageTransition.value = false
        }
      }, 0)
    }
  },
)

watch(
  () => horizontalPages.value.length,
  (pageCount) => {
    const saved = pendingRestorePosition.value
    if (
      !isHorizontalPageMode.value
      || pageCount <= 0
      || !saved
      || saved.chapterIndex !== store.currentIndex
    ) {
      return
    }
    horizontalPageIndex.value = getPageIndexFromProgress(saved.progress || 0, pageCount)
    store.setChapterScrollProgress(getPageProgress(horizontalPageIndex.value, pageCount))
    updateHorizontalEndState()
  },
  { flush: 'sync' },
)

watch(() => store.currentIndex, async () => {
  loadSavedReadingPosition()
  if (!pendingRestorePosition.value && !isContinuousMode.value) {
    if (isHorizontalPageMode.value) {
      resetHorizontalPagePosition()
    } else {
      scrollContainerRef.value?.scrollTo({ top: 0, behavior: 'auto' })
    }
  }
  resetAutoParagraphIndex()
  if (!store.isSpeaking) {
    clearReadingClass()
  }
  if (hideReadChaptersMode.value) {
    pruneReadChapters(store.currentIndex)
  }
  if (!isContinuousMode.value && config.value.enablePreload) {
    store.preloadAroundChapter(store.currentIndex)
  }
  if (isContinuousMode.value && !suppressContinuousSync.value) {
    await syncContinuousToStoreState()
  }
  scheduleRefreshOfflineCacheState()
  scheduleRestoreReadingPosition()
})

watch(
  [() => store.chapters.length, () => store.chaptersLoading, () => store.loading, isContinuousMode],
  async ([chapterCount, chaptersLoading, loadingNow, continuousMode]) => {
    if (!continuousMode || !chapterCount || chaptersLoading || loadingNow || continuousChapters.value.length) return
    await initializeContinuousChapters(store.currentIndex, false)
    scheduleRestoreReadingPosition()
  },
  { immediate: true },
)

watch(() => store.content, () => {
  resetAutoParagraphIndex()
  if (isContinuousMode.value) {
    const current = getContinuousChapter(store.currentIndex)
    if (current) {
      current.content = store.content
      current.html = renderChapterHtml(store.content)
    } else if (store.content) {
      void initializeContinuousChapters(store.currentIndex, false)
    }
  }
  handleContentChanged()
  handleContentUpdated()
  scheduleRefreshOfflineCacheState()
  scheduleRestoreReadingPosition()
})

watch(() => store.loading, (loading) => {
  if (!loading && pendingRestorePosition.value) {
    scheduleRestoreReadingPosition()
  }
})

watch(() => store.book?.bookUrl, () => {
  loadSavedReadingPosition()
  scheduleRefreshOfflineCacheState()
})

watch([showSearch, searchQuery, () => config.value.paragraphSpacing, () => config.value.firstLineIndent, () => config.value.chineseMode, () => store.replaceRules], () => {
  if (isContinuousMode.value) {
    syncContinuousChapterHtml()
  }
  handlePresentationUpdated()
})

watch(() => config.value.selectAction, (value) => {
  if (value !== 'popup') {
    clearSelectionState()
  }
})

watch(() => store.isSpeaking, (speaking) => {
  if (speaking && !ttsPanelDismissed.value) {
    showTTSPanel.value = true
  }
  if (!speaking && !store.isAutoScrolling) {
    clearReadingClass()
  }
})

watch(
  [() => store.isNight, () => store.currentTheme.body, () => appStore.theme],
  ([isNight, body]) => {
    applySystemTheme(isNight ? 'dark' : appStore.theme, body)
  },
  { immediate: true },
)
</script>

<style scoped src="../styles/reader-view.css"></style>
