// ==UserScript==
// @name         招聘职位助手（51job/Boss/智联）
// @namespace    https://we.51job.com
// @version      1.6.5
// @description  管理屏蔽公司和职位关键词；支持 51job、Boss 直聘和智联招聘。
// @author       WorkBuddy
// @match        https://we.51job.com/*
// @match        https://*.51job.com/*
// @match        https://www.zhipin.com/*
// @match        https://*.zhipin.com/*
// @match        https://www.zhaopin.com/*
// @match        https://*.zhaopin.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
  
    /* =====================================================================
     * 站点配置
     * ===================================================================== */
  
    const SITES = {
      '51job.com': {
        card: [
          '.joblist-item-job[sensorsname="JobShortExposure"]',
          '.joblist-item-job.sensors_exposure',
          '.joblist-item-job',
          'li.joblist',
          '.j_joblist > div',
          '.joblist-box .item',
          '.job-card',
        ],
        company: [
          '.joblist-item-right .cname',
          'a.comp .cname',
          '.cname',
          '.e_com',
          '[data-company]',
          '[data-corp]',
          '[class*="company" i]',
          '[class*="corp" i]',
        ].join(','),
        title: [
          '.joblist-item-jobname .jname',
          '.joblist-item-jobname [title]',
          '.jname',
          '[class*="jobname" i]',
          '[class*="job-name" i]',
          '[class*="job-title" i]',
          '[class*="title" i]',
          'h3',
          'h2',
        ].join(','),
        link: [
          'a[href*="jobid"]',
          'a[href*="jobs.51job.com"][href*=".html"]:not(.comp)',
          'a[href*="/job/"]',
          'a[href*="position"]',
          'a[href*="post"]',
        ].join(','),
      },
  
      'zhipin.com': {
        card: [
          '.job-card-wrap',
        ],
        company: [
          '.job-card-footer a[href*="/gongsi/"]',
          'a[href*="/gongsi/"]',
          '.company-name',
          '[class*="company-name" i]',
        ].join(','),
        title: [
          '.job-title',
          '[class*="job-title" i]',
          '.job-name',
        ].join(','),
        link: [
          'a[href*="job_detail"]',
        ].join(','),
      },

      'zhaopin.com': {
        card: [
          '.joblist-box__item',
          '.joblist-box__iteminfo',
          '[class*="joblist-box__item"]',
          '[class*="job-card"]',
        ],
        company: [
          '.company-name',
          '[class*="company-name" i]',
          '[class*="companyname" i]',
          'a[href*="/companydetail/"]',
          'a[href*="company"]',
        ].join(','),
        title: [
          '.job-name',
          '[class*="job-name" i]',
          '[class*="jobname" i]',
          'a[href*="/jobdetail/"]',
          'a[href*="jobs.zhaopin.com"]',
        ].join(','),
        link: [
          'a[href*="/jobdetail/"]',
          'a[href*="jobs.zhaopin.com"]',
          'a[href*="jobDetail"]',
        ].join(','),
      },
    };
  
    function pickSite() {
      const hostname = location.hostname;
  
      for (const domain of Object.keys(SITES)) {
        if (
          hostname === domain ||
          hostname.endsWith(`.${domain}`)
        ) {
          return SITES[domain];
        }
      }
  
      return SITES['51job.com'];
    }
  
    const SITE = pickSite();
  
    const IS_51JOB =
      location.hostname === '51job.com' ||
      location.hostname.endsWith('.51job.com');

    const IS_BOSS =
      location.hostname === 'zhipin.com' ||
      location.hostname.endsWith('.zhipin.com');

    const IS_ZHILIAN =
      location.hostname === 'zhaopin.com' ||
      location.hostname.endsWith('.zhaopin.com');
  
    const CONFIG = {
      STORAGE_KEY: 'wj_blocked_companies',
      TITLE_STORAGE_KEY: 'wj_blocked_job_titles',
      BOSS_CONTACTED_KEY: 'wj_boss_contacted_job_ids',
      POSITION_KEY: 'wj_fab_pos',
      EXACT_KEY: 'wj_exact_match',
      DEFAULT_EXACT_MATCH: false,
      MAX_LOG: 200,
      SCAN_DELAY: 180,
      FAB_SIZE: 48,
      PANEL_WIDTH: 350,
      DELIVERY_MIN_DELAY: 800,
      DELIVERY_MAX_DELAY: 2000,
    };
  
    /* =====================================================================
     * 存储
     * ===================================================================== */
  
    const hasGM =
      typeof GM_getValue === 'function' &&
      typeof GM_setValue === 'function';
  
    function load(key, defaultValue) {
      try {
        if (hasGM) {
          const value = GM_getValue(key, null);
  
          if (value !== null && value !== undefined) {
            return typeof value === 'string'
              ? JSON.parse(value)
              : value;
          }
        }
      } catch {
        // GM 存储读取失败时回退至 localStorage。
      }
  
      try {
        const raw = localStorage.getItem(key);
  
        if (raw !== null) {
          return JSON.parse(raw);
        }
      } catch {
        // localStorage 不可用时返回默认值。
      }
  
      return defaultValue;
    }
  
    function save(key, value) {
      const raw = JSON.stringify(value);
  
      try {
        if (hasGM) {
          GM_setValue(key, raw);
        }
      } catch {
        // GM 存储失败不影响 localStorage。
      }
  
      try {
        localStorage.setItem(key, raw);
      } catch {
        // 某些隐私模式下 localStorage 可能不可用。
      }
    }
  
    function loadBlockedCompanies() {
      const value = load(CONFIG.STORAGE_KEY, []);
  
      if (!Array.isArray(value)) {
        return [];
      }
  
      return Array.from(
        new Set(
          value
            .filter((item) => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      );
    }

    function loadBlockedTitles() {
      const value = load(CONFIG.TITLE_STORAGE_KEY, []);

      if (!Array.isArray(value)) {
        return [];
      }

      return Array.from(
        new Set(
          value
            .filter((item) => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      );
    }

    function loadBossContactedJobIds() {
      const value = load(CONFIG.BOSS_CONTACTED_KEY, []);

      return Array.isArray(value)
        ? value.filter((item) => typeof item === 'string' && item)
        : [];
    }
  
    let blocked = loadBlockedCompanies();
    let blockedTitles = loadBlockedTitles();
    const bossContactedJobIds = new Set(loadBossContactedJobIds());
  
    let exactMatch = Boolean(
      load(
        CONFIG.EXACT_KEY,
        CONFIG.DEFAULT_EXACT_MATCH,
      ),
    );
  
    const filteredLog = [];
    const loggedJobs = new Set();
  
    let statDetected = 0;
    let statHidden = 0;
    let scanning = false;
    let scanQueued = false;
    let scanTimer = null;
  
    const deliveryState = {
      running: false,
      stopRequested: false,
      total: 0,
      completed: 0,
      triggered: 0,
      skipped: 0,
      currentTitle: '',
      currentCompany: '',
      message: '',
    };

    let lastBossPopupDiagnostic = null;
  
    /* =====================================================================
     * 文本及职位信息提取
     * ===================================================================== */
  
    function normalizeVisibleText(value) {
      return String(value || '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
    }
  
    function normalizeCompanyName(value) {
      return normalizeVisibleText(value)
        .replace(/\s+/g, '')
        .replace(/[（(][^（）()]{0,30}[）)]$/u, '')
        .trim();
    }
  
    function getElementText(element) {
      if (!element) {
        return '';
      }
  
      const title = element.getAttribute?.('title');
  
      if (title && title.trim()) {
        return normalizeVisibleText(title);
      }
  
      return normalizeVisibleText(element.textContent);
    }
  
    function extractText(card, selector) {
      if (!selector) {
        return '';
      }
  
      return getElementText(card.querySelector(selector));
    }
  
    const COMPANY_SUFFIX =
      /(公司|集团|股份|企业|有限责任|有限合伙|合作社|研究院|研究所|银行|保险|证券|基金|事务所|商行|商场|超市|酒店|饭店|学校|学院|医院|诊所|门诊|出版社|报社|电视台|电台|工作室|个体户|中心|厂|社|行|店)$/;
  
    function depthOf(element) {
      let depth = 0;
      let current = element;
  
      while (current && current !== document.body) {
        depth++;
        current = current.parentElement;
      }
  
      return depth;
    }
  
    function extractTitle(card) {
      let title = extractText(card, SITE.title);
  
      if (!title) {
        title = getElementText(
          card.querySelector(SITE.link),
        );
      }
  
      return title || '(未知职位)';
    }
  
    function extractCompany(card) {
      // 51job 新版页面的 .cname title 属性最可靠。
      const hint = card.querySelector(SITE.company);
      const hintedCompany = getElementText(hint);
  
      if (hintedCompany) {
        return hintedCompany;
      }
  
      // 页面结构变化时使用启发式识别。
      const title = normalizeCompanyName(
        extractTitle(card),
      );
  
      const walker = document.createTreeWalker(
        card,
        NodeFilter.SHOW_TEXT,
      );
  
      let node;
      let best = '';
      let bestScore = Number.NEGATIVE_INFINITY;
  
      while ((node = walker.nextNode())) {
        const raw = normalizeVisibleText(
          node.textContent,
        );
  
        const normalized = normalizeCompanyName(raw);
  
        if (
          normalized.length < 2 ||
          normalized.length > 50 ||
          normalized === title
        ) {
          continue;
        }
  
        const parent = node.parentElement;
  
        if (!parent) {
          continue;
        }
  
        const className =
          typeof parent.className === 'string'
            ? parent.className
            : '';
  
        const hasSuffix =
          COMPANY_SUFFIX.test(normalized);
  
        const hasCompanyHint =
          /(?:^|\s)(?:cname|comp|company-name)(?:\s|$)|ent|corp|e_com/i.test(
            className,
          );
  
        if (!hasSuffix && !hasCompanyHint) {
          continue;
        }
  
        const score =
          (hasSuffix ? 50 : 0) +
          (hasCompanyHint ? 35 : 0) -
          normalized.length -
          depthOf(parent);
  
        if (score > bestScore) {
          bestScore = score;
          best = raw;
        }
      }
  
      return best;
    }
  
    function matchCompany(card) {
      const company = normalizeCompanyName(
        extractCompany(card),
      );
  
      if (!company) {
        return null;
      }
  
      for (const blockedCompany of blocked) {
        const normalizedBlocked =
          normalizeCompanyName(blockedCompany);
  
        if (!normalizedBlocked) {
          continue;
        }
  
        if (exactMatch) {
          if (company === normalizedBlocked) {
            return blockedCompany;
          }
  
          continue;
        }
  
        if (company.includes(normalizedBlocked)) {
          return blockedCompany;
        }
      }
  
      return null;
    }

    function matchJobTitle(card) {
      const title = normalizeVisibleText(
        extractTitle(card),
      ).toLocaleLowerCase();

      if (!title) {
        return null;
      }

      for (const blockedTitle of blockedTitles) {
        const keyword = normalizeVisibleText(
          blockedTitle,
        ).toLocaleLowerCase();

        if (keyword && title.includes(keyword)) {
          return blockedTitle;
        }
      }

      return null;
    }
  
    /* =====================================================================
     * 职位卡片识别
     * ===================================================================== */
  
    function inferCard(linkElement) {
      let node = linkElement.parentElement;
      let depth = 0;
  
      while (
        node &&
        node !== document.body &&
        depth < 12
      ) {
        if (
          node.matches?.(
            '.joblist-item-job, .job-card-wrapper, .job-card-wrap, li.job-card',
          )
        ) {
          return node;
        }
  
        const parent = node.parentElement;
  
        if (!parent) {
          break;
        }
  
        const currentLinkCount =
          node.querySelectorAll?.(SITE.link).length || 0;
  
        const parentLinkCount =
          parent.querySelectorAll?.(SITE.link).length || 0;
  
        if (
          currentLinkCount > 0 &&
          parentLinkCount > currentLinkCount
        ) {
          return node;
        }
  
        node = parent;
        depth++;
      }
  
      return (
        linkElement.closest(
          '.joblist-item-job, .job-card-wrapper, .job-card-wrap, li.job-card, li, article',
        ) ||
        linkElement
      );
    }
  
    function removeDuplicateCards(cards) {
      const uniqueCards = Array.from(new Set(cards));
  
      // 移除包含其他职位卡片的外层容器。
      return uniqueCards.filter(
        (card) =>
          !uniqueCards.some(
            (other) =>
              other !== card &&
              card.contains(other),
          ),
      );
    }
  
    function getCards() {
      for (const selector of SITE.card) {
        let elements;
  
        try {
          elements = Array.from(
            document.querySelectorAll(selector),
          );
        } catch {
          continue;
        }
  
        if (elements.length > 0) {
          return removeDuplicateCards(elements);
        }
      }
  
      const links = document.querySelectorAll(
        SITE.link,
      );
  
      const inferredCards = [];
  
      for (const link of links) {
        const card = inferCard(link);
  
        if (card) {
          inferredCards.push(card);
        }
      }
  
      return removeDuplicateCards(inferredCards);
    }
  
    function getJobIdentity(card) {
      const sensorsData =
        card.getAttribute('sensorsdata');
  
      if (sensorsData) {
        try {
          const parsed = JSON.parse(sensorsData);
  
          if (parsed?.jobId) {
            return `51job:${parsed.jobId}`;
          }
        } catch {
          const match = sensorsData.match(
            /["']?jobId["']?\s*:\s*["']?(\d+)/i,
          );
  
          if (match) {
            return `51job:${match[1]}`;
          }
        }
      }
  
      const link = card.querySelector(SITE.link);
      const href = link?.href || '';
  
      if (href) {
        return `link:${href}`;
      }
  
      return [
        'fallback',
        normalizeCompanyName(extractCompany(card)),
        normalizeVisibleText(extractTitle(card)),
      ].join(':');
    }
  
    /* =====================================================================
     * HTML 转义
     * ===================================================================== */
  
    function escapeHtml(value) {
      return String(value).replace(
        /[&<>"']/g,
        (character) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[character],
      );
    }
  
    function escapeAttribute(value) {
      return escapeHtml(value);
    }
  
    /* =====================================================================
     * 样式
     * ===================================================================== */
  
    const STYLE = `
      .wj-fab {
        position: fixed;
        z-index: 2147483647;
        right: 18px;
        bottom: 18px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff6a3d, #ff3d3d);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
        box-shadow: 0 4px 14px rgba(255, 61, 61, 0.45);
        font-size: 20px;
        touch-action: none;
      }
  
      .wj-fab:active {
        cursor: grabbing;
      }
  
      .wj-fab .wj-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border-radius: 9px;
        background: #222;
        color: #fff;
        font-size: 11px;
        line-height: 18px;
        text-align: center;
        border: 2px solid #fff;
        box-sizing: content-box;
      }
  
      .wj-panel {
        position: fixed;
        z-index: 2147483647;
        width: 350px;
        max-height: 84vh;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.25);
        display: none;
        flex-direction: column;
        font-family:
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          Roboto,
          "PingFang SC",
          "Microsoft YaHei",
          sans-serif;
        font-size: 13px;
        color: #222;
        overflow: hidden;
        border: 1px solid #eee;
      }
  
      .wj-panel.wj-show {
        display: flex;
      }
  
      .wj-head {
        background: linear-gradient(135deg, #ff6a3d, #ff3d3d);
        color: #fff;
        padding: 12px 14px;
        font-weight: 600;
        font-size: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
  
      .wj-head .wj-close {
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        opacity: 0.9;
      }
  
      .wj-body {
        padding: 12px 14px;
        overflow-y: auto;
      }
  
      .wj-row {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
  
      .wj-row input {
        flex: 1;
        min-width: 0;
        padding: 7px 9px;
        border: 1px solid #ddd;
        border-radius: 7px;
        outline: none;
        font-size: 13px;
      }
  
      .wj-row input:focus {
        border-color: #ff6a3d;
      }
  
      .wj-btn {
        padding: 7px 12px;
        border: none;
        border-radius: 7px;
        background: #ff6a3d;
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
      }
  
      .wj-btn:hover {
        background: #ff5530;
      }
  
      .wj-btn.wj-ghost {
        background: #f1f1f1;
        color: #555;
      }
  
      .wj-btn.wj-ghost:hover {
        background: #e8e8e8;
      }
  
      .wj-sec-title {
        font-weight: 600;
        margin: 6px 0 8px;
        color: #444;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
  
      .wj-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #fff0ec;
        color: #ff3d3d;
        border: 1px solid #ffd5cc;
        padding: 4px 8px;
        border-radius: 14px;
        margin: 0 6px 6px 0;
        font-size: 12px;
      }
  
      .wj-chip .wj-x {
        cursor: pointer;
        font-weight: 700;
      }
  
      .wj-empty {
        color: #aaa;
        font-size: 12px;
        padding: 6px 0;
      }
  
      .wj-log {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 0;
        border-bottom: 1px dashed #eee;
      }
  
      .wj-log .wj-info {
        min-width: 0;
        overflow: hidden;
      }
  
      .wj-log .wj-co {
        color: #ff3d3d;
        font-weight: 600;
      }
  
      .wj-log .wj-ti {
        color: #333;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 190px;
      }
  
      .wj-log .wj-time {
        color: #bbb;
        font-size: 11px;
      }
  
      .wj-log .wj-unblock {
        background: none;
        border: 1px solid #ddd;
        color: #888;
        border-radius: 6px;
        padding: 2px 7px;
        cursor: pointer;
        font-size: 11px;
        white-space: nowrap;
      }
  
      .wj-log .wj-unblock:hover {
        border-color: #ff6a3d;
        color: #ff6a3d;
      }
  
      .wj-foot {
        padding: 10px 14px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 6px;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #888;
      }
  
      .wj-foot label {
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
      }
  
      .wj-block-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.68);
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 3px 8px;
        font-size: 11px;
        line-height: 18px;
        cursor: pointer;
        display: none;
        pointer-events: auto;
      }
  
      .wj-block-btn:hover,
      .wj-block-btn:focus-visible {
        background: #ff3d3d;
        outline: none;
      }
  
      .wj-hasbtn:hover > .wj-block-btn,
      .wj-block-btn:focus-visible {
        display: block;
      }
  
      .wj-job-hidden {
        display: none !important;
      }
  
      .wj-delivery {
        margin-top: 12px;
        padding: 10px;
        border: 1px solid #ffe0d8;
        border-radius: 9px;
        background: #fff8f6;
      }
  
      .wj-delivery-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
  
      .wj-delivery-start {
        flex: 1;
        background: linear-gradient(135deg, #ff6a3d, #ff3d3d);
      }
  
      .wj-delivery-start:hover {
        background: linear-gradient(135deg, #ff5730, #ed2929);
      }
  
      .wj-delivery-start.wj-delivery-stop {
        background: #555;
      }
  
      .wj-delivery-start.wj-delivery-stop:hover {
        background: #333;
      }
  
      .wj-delivery-count {
        color: #888;
        font-size: 11px;
        white-space: nowrap;
      }
  
      .wj-delivery-progress {
        height: 7px;
        margin-top: 9px;
        border-radius: 999px;
        background: #eadfdb;
        overflow: hidden;
      }
  
      .wj-delivery-progress-bar {
        width: 0;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #ff8b62, #ff3d3d);
        transition: width 180ms ease-out;
      }
  
      .wj-delivery-status {
        min-height: 17px;
        margin-top: 7px;
        color: #777;
        font-size: 11px;
        line-height: 17px;
        overflow-wrap: anywhere;
      }
  
      .wj-delivery-current {
        color: #444;
        font-weight: 500;
      }
  
      .wj-delivery-note {
        margin-top: 5px;
        color: #aaa;
        font-size: 10px;
        line-height: 15px;
      }

      .wj-diagnostic-status {
        min-height: 17px;
        margin-top: 7px;
        color: #777;
        font-size: 11px;
        line-height: 17px;
        overflow-wrap: anywhere;
      }
    `;
  
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
  
    /* =====================================================================
     * 构建浮窗
     * ===================================================================== */
  
    const deliveryPanelHtml = IS_51JOB || IS_BOSS
      ? `
        <div class="wj-delivery" id="wjDelivery">
          <div class="wj-delivery-actions">
            <button
              class="wj-btn wj-delivery-start"
              id="wjDeliveryStart"
              type="button"
            >
              ${IS_BOSS ? '一键沟通当前页' : '一键投递当前页'}
            </button>
  
            <span
              class="wj-delivery-count"
              id="wjDeliveryCount"
            >
              等待扫描
            </span>
          </div>
  
          <div
            class="wj-delivery-progress"
            id="wjDeliveryProgress"
            role="progressbar"
            aria-label="一键投递进度"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="0"
          >
            <div
              class="wj-delivery-progress-bar"
              id="wjDeliveryProgressBar"
            ></div>
          </div>
  
          <div
            class="wj-delivery-status"
            id="wjDeliveryStatus"
            aria-live="polite"
          >
            仅处理当前页面已加载且未屏蔽的职位。
          </div>
  
          <div class="wj-delivery-note">
            ${IS_BOSS
              ? '“已触发”表示已点击立即沟通，不代表对方已回复。'
              : '“已触发”表示已点击申请按钮，不代表服务端最终投递成功。'}
          </div>
        </div>
      `
      : '';

    const bossDiagnosticPanelHtml = IS_BOSS
      ? `
        <div class="wj-delivery" id="wjBossDiagnostic">
          <div class="wj-delivery-actions">
            <button
              class="wj-btn wj-delivery-start"
              id="wjBossDiagnosticStart"
              type="button"
            >
              生成 Boss 诊断
            </button>
          </div>

          <div
            class="wj-diagnostic-status"
            id="wjBossDiagnosticStatus"
            aria-live="polite"
          >
            无需打开 F12；报告不包含 Cookie、Token 或聊天内容。
          </div>
        </div>
      `
      : '';

    const zhilianDiagnosticPanelHtml = IS_ZHILIAN
      ? `
        <div class="wj-delivery" id="wjZhilianDiagnostic">
          <div class="wj-delivery-actions">
            <button
              class="wj-btn wj-delivery-start"
              id="wjZhilianDiagnosticStart"
              type="button"
            >
              生成智联诊断
            </button>
          </div>

          <div
            class="wj-diagnostic-status"
            id="wjZhilianDiagnosticStatus"
            aria-live="polite"
          >
            先验证卡片、公司、职位名称和投递按钮结构。
          </div>
        </div>
      `
      : '';
  
    const root = document.createElement('div');
    root.id = 'wjBlockerRoot';
  
    root.innerHTML = `
      <div
        class="wj-fab"
        id="wjFab"
        title="屏蔽招聘公司"
        role="button"
        tabindex="0"
        aria-label="打开招聘公司屏蔽器"
      >
        🛡️
        <span class="wj-badge" id="wjBadge">0</span>
      </div>
  
      <div
        class="wj-panel"
        id="wjPanel"
        role="dialog"
        aria-label="招聘公司屏蔽器"
      >
        <div class="wj-head">
          <span>招聘公司屏蔽器</span>
  
          <span
            class="wj-close"
            id="wjClose"
            role="button"
            tabindex="0"
            aria-label="关闭"
          >
            ×
          </span>
        </div>
  
        <div class="wj-body">
          <div class="wj-row">
            <input
              id="wjInput"
              type="text"
              autocomplete="off"
              placeholder="输入要屏蔽的公司名，回车添加"
            />
  
            <button
              class="wj-btn"
              id="wjAdd"
              type="button"
            >
              添加
            </button>
          </div>
  
          <div class="wj-sec-title">
            <span>
              已屏蔽公司
              (<b id="wjBCount">0</b>)
            </span>
          </div>
  
          <div id="wjBlockedList"></div>

          <div
            class="wj-sec-title"
            style="margin-top: 10px;"
          >
            <span>
              屏蔽职位关键词
              (<b id="wjTCount">0</b>)
            </span>
          </div>

          <div class="wj-row">
            <input
              id="wjTitleInput"
              type="text"
              autocomplete="off"
              placeholder="输入职位关键词，如：测试"
            />

            <button
              class="wj-btn"
              id="wjTitleAdd"
              type="button"
            >
              添加
            </button>
          </div>

          <div id="wjBlockedTitleList"></div>
  
          <div
            class="wj-sec-title"
            style="margin-top: 10px;"
          >
            <span>
              本次已过滤
              (<b id="wjFCount">0</b>)
            </span>
          </div>
  
          <div id="wjFilteredList"></div>
  
          <div
            class="wj-stats"
            id="wjStats"
            style="color: #aaa; font-size: 11px; margin-top: 8px;"
          ></div>
  
          ${deliveryPanelHtml}
          ${bossDiagnosticPanelHtml}
          ${zhilianDiagnosticPanelHtml}
        </div>
  
        <div class="wj-foot">
          <label style="flex: 1;">
            <input
              type="checkbox"
              id="wjExact"
              ${exactMatch ? 'checked' : ''}
            />
            精确匹配
          </label>
  
          <button
            class="wj-btn wj-ghost"
            id="wjReapply"
            type="button"
          >
            重新应用
          </button>
  
          <button
            class="wj-btn wj-ghost"
            id="wjClearLog"
            type="button"
          >
            清空记录
          </button>
        </div>
      </div>
    `;
  
    document.body.appendChild(root);
  
    function getById(id) {
      return root.querySelector(`#${id}`);
    }
  
    const fab = getById('wjFab');
    const panel = getById('wjPanel');
    const badge = getById('wjBadge');
    const input = getById('wjInput');
    const blockedList = getById('wjBlockedList');
    const titleInput = getById('wjTitleInput');
    const blockedTitleList = getById('wjBlockedTitleList');
    const filteredList = getById('wjFilteredList');
    const blockedCount = getById('wjBCount');
    const blockedTitleCount = getById('wjTCount');
    const filteredCount = getById('wjFCount');
    const statsElement = getById('wjStats');
    const exactCheckbox = getById('wjExact');
    const reapplyButton = getById('wjReapply');
  
    const deliveryStartButton = IS_51JOB || IS_BOSS
      ? getById('wjDeliveryStart')
      : null;
  
    const deliveryCountElement = IS_51JOB || IS_BOSS
      ? getById('wjDeliveryCount')
      : null;
  
    const deliveryProgressElement = IS_51JOB || IS_BOSS
      ? getById('wjDeliveryProgress')
      : null;
  
    const deliveryProgressBar = IS_51JOB || IS_BOSS
      ? getById('wjDeliveryProgressBar')
      : null;
  
    const deliveryStatusElement = IS_51JOB || IS_BOSS
      ? getById('wjDeliveryStatus')
      : null;

    const bossDiagnosticButton = IS_BOSS
      ? getById('wjBossDiagnosticStart')
      : null;

    const bossDiagnosticStatus = IS_BOSS
      ? getById('wjBossDiagnosticStatus')
      : null;

    const zhilianDiagnosticButton = IS_ZHILIAN
      ? getById('wjZhilianDiagnosticStart')
      : null;

    const zhilianDiagnosticStatus = IS_ZHILIAN
      ? getById('wjZhilianDiagnosticStatus')
      : null;

    /* =====================================================================
     * Boss 页面诊断（无需开发者工具）
     * ===================================================================== */

    function getSafeClassName(element) {
      return typeof element?.className === 'string'
        ? element.className
        : '';
    }

    function getSafeElementAttributes(element) {
      const allowed = [
        'role',
        'type',
        'title',
        'aria-label',
        'aria-disabled',
        'disabled',
        'ka',
      ];

      return Object.fromEntries(
        allowed.flatMap((name) => {
          const value = element.getAttribute(name);
          return value === null
            ? []
            : [[name, value.slice(0, 200)]];
        }),
      );
    }

    function buildBossDiagnosticReport() {
      const cardSelectors = [
        '.job-card-wrapper',
        '.job-card-wrap',
        'li.job-card',
        '[class*="job-card"]',
      ];
      const titleSelectors = [
        '.job-name',
        '.job-title',
        '[class*="job-name"]',
        '[class*="job-title"]',
      ];
      const companySelectors = [
        '.company-name',
        '[class*="company-name"]',
        '[class*="company"]',
      ];
      const cardSelector = cardSelectors.join(',');
      const titleSelector = titleSelectors.join(',');
      const companySelector = companySelectors.join(',');
      const cards = Array.from(
        new Set(document.querySelectorAll(cardSelector)),
      );
      const actionPattern =
        /沟通|投递|申请|打招呼|感兴趣|联系|chat|apply/i;
      const actionCandidates = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], [class*="btn"], [class*="button"]',
        ),
      )
        .filter((element) => {
          if (root.contains(element)) {
            return false;
          }

          const signature = [
            normalizeVisibleText(element.textContent),
            getSafeClassName(element),
            element.getAttribute('title') || '',
            element.getAttribute('aria-label') || '',
            element.getAttribute('ka') || '',
          ].join(' ');

          return actionPattern.test(signature);
        })
        .slice(0, 80)
        .map((element) => {
          const card = element.closest(cardSelector);
          return {
            tag: element.tagName.toLowerCase(),
            text: normalizeVisibleText(element.textContent).slice(0, 100),
            className: getSafeClassName(element).slice(0, 300),
            attributes: getSafeElementAttributes(element),
            visible: element.getClientRects().length > 0,
            insideKnownCard: Boolean(card),
            cardClassName: getSafeClassName(card).slice(0, 300),
          };
        });

      return {
        reportVersion: 1,
        lastPopupDiagnostic: lastBossPopupDiagnostic,
        generatedAt: new Date().toISOString(),
        page: {
          origin: location.origin,
          pathname: location.pathname,
        },
        selectorCounts: {
          cards: Object.fromEntries(
            cardSelectors.map((selector) => [
              selector,
              document.querySelectorAll(selector).length,
            ]),
          ),
          titles: Object.fromEntries(
            titleSelectors.map((selector) => [
              selector,
              document.querySelectorAll(selector).length,
            ]),
          ),
          companies: Object.fromEntries(
            companySelectors.map((selector) => [
              selector,
              document.querySelectorAll(selector).length,
            ]),
          ),
        },
        sampleCards: cards.slice(0, 8).map((card) => ({
          tag: card.tagName.toLowerCase(),
          className: getSafeClassName(card).slice(0, 300),
          title: getElementText(card.querySelector(titleSelector)).slice(0, 100),
          company: getElementText(card.querySelector(companySelector)).slice(0, 100),
          dataAttributeNames: Array.from(card.attributes)
            .map((attribute) => attribute.name)
            .filter((name) => name.startsWith('data-')),
          linkPath: (() => {
            const href = card.querySelector('a[href]')?.getAttribute('href');
            if (!href) return null;
            try {
              return new URL(href, location.href).pathname;
            } catch {
              return null;
            }
          })(),
        })),
        actionCandidates,
      };
    }

    function buildZhilianDiagnosticReport() {
      const cardSelectors = [
        '.joblist-box__item',
        '.joblist-box__iteminfo',
        '[class*="joblist-box__item"]',
        '[class*="job-card"]',
        'li[class*="job"]',
      ];
      const titleSelectors = [
        '.job-name',
        '[class*="job-name"]',
        '[class*="jobname"]',
        'a[href*="/jobdetail/"]',
        'a[href*="jobs.zhaopin.com"]',
      ];
      const companySelectors = [
        '.company-name',
        '[class*="company-name"]',
        '[class*="companyname"]',
        'a[href*="/companydetail/"]',
        'a[href*="company"]',
      ];
      const cardSelector = cardSelectors.join(',');
      const titleSelector = titleSelectors.join(',');
      const companySelector = companySelectors.join(',');
      const cards = Array.from(
        new Set(document.querySelectorAll(cardSelector)),
      );
      const actionPattern =
        /投递|申请|沟通|打招呼|感兴趣|立即|简历|apply|submit/i;
      const actionCandidates = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], [class*="btn"], [class*="button"]',
        ),
      )
        .filter((element) => {
          if (root.contains(element)) {
            return false;
          }

          const signature = [
            normalizeVisibleText(element.textContent),
            getSafeClassName(element),
            element.getAttribute('title') || '',
            element.getAttribute('aria-label') || '',
          ].join(' ');
          return actionPattern.test(signature);
        })
        .slice(0, 100)
        .map((element) => {
          const card = element.closest(cardSelector);
          return {
            tag: element.tagName.toLowerCase(),
            text: normalizeVisibleText(element.textContent).slice(0, 100),
            className: getSafeClassName(element).slice(0, 300),
            attributes: getSafeElementAttributes(element),
            visible: element.getClientRects().length > 0,
            insideKnownCard: Boolean(card),
            cardClassName: getSafeClassName(card).slice(0, 300),
          };
        });

      return {
        reportVersion: 1,
        site: 'zhaopin',
        generatedAt: new Date().toISOString(),
        page: {
          origin: location.origin,
          pathname: location.pathname,
        },
        selectorCounts: {
          cards: Object.fromEntries(
            cardSelectors.map((selector) => [
              selector,
              document.querySelectorAll(selector).length,
            ]),
          ),
          titles: Object.fromEntries(
            titleSelectors.map((selector) => [
              selector,
              document.querySelectorAll(selector).length,
            ]),
          ),
          companies: Object.fromEntries(
            companySelectors.map((selector) => [
              selector,
              document.querySelectorAll(selector).length,
            ]),
          ),
        },
        sampleCards: cards.slice(0, 10).map((card) => ({
          tag: card.tagName.toLowerCase(),
          className: getSafeClassName(card).slice(0, 300),
          title: getElementText(card.querySelector(titleSelector)).slice(0, 120),
          company: getElementText(card.querySelector(companySelector)).slice(0, 120),
          dataAttributeNames: Array.from(card.attributes)
            .map((attribute) => attribute.name)
            .filter((name) => name.startsWith('data-')),
          linkPath: (() => {
            const href = card.querySelector('a[href]')?.getAttribute('href');
            if (!href) return null;
            try {
              return new URL(href, location.href).pathname;
            } catch {
              return null;
            }
          })(),
        })),
        actionCandidates,
      };
    }

    function downloadDiagnostic(content, prefix) {
      const blob = new Blob([content], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${prefix}-diagnostic-${Date.now()}.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function copyDiagnosticText(content) {
      try {
        await navigator.clipboard.writeText(content);
        return true;
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
          return document.execCommand('copy');
        } catch {
          return false;
        } finally {
          textarea.remove();
        }
      }
    }

    async function generateBossDiagnostic() {
      if (!IS_BOSS || !bossDiagnosticStatus) {
        return;
      }

      bossDiagnosticStatus.textContent = '正在读取页面结构……';

      try {
        const report = buildBossDiagnosticReport();
        const content = JSON.stringify(report, null, 2);
        const copied = await copyDiagnosticText(content);

        if (copied) {
          bossDiagnosticStatus.textContent =
            `诊断已复制：卡片 ${report.sampleCards.length} 个样本，` +
            `操作入口 ${report.actionCandidates.length} 个。请直接粘贴发送。`;
        } else {
          downloadDiagnostic(content, 'boss');
          bossDiagnosticStatus.textContent =
            '剪贴板不可用，已下载 boss-diagnostic JSON 文件。';
        }
      } catch (error) {
        bossDiagnosticStatus.textContent =
          `诊断失败：${error instanceof Error ? error.message : String(error)}`;
      }
    }

    if (bossDiagnosticButton) {
      bossDiagnosticButton.addEventListener('click', () => {
        void generateBossDiagnostic();
      });
    }

    async function generateZhilianDiagnostic() {
      if (!IS_ZHILIAN || !zhilianDiagnosticStatus) {
        return;
      }

      zhilianDiagnosticStatus.textContent = '正在读取智联页面结构……';

      try {
        const report = buildZhilianDiagnosticReport();
        const content = JSON.stringify(report, null, 2);
        const copied = await copyDiagnosticText(content);

        if (copied) {
          zhilianDiagnosticStatus.textContent =
            `诊断已复制：卡片 ${report.sampleCards.length} 个样本，` +
            `操作入口 ${report.actionCandidates.length} 个。请直接粘贴发送。`;
        } else {
          downloadDiagnostic(content, 'zhilian');
          zhilianDiagnosticStatus.textContent =
            '剪贴板不可用，已下载 zhilian-diagnostic JSON 文件。';
        }
      } catch (error) {
        zhilianDiagnosticStatus.textContent =
          `诊断失败：${error instanceof Error ? error.message : String(error)}`;
      }
    }

    if (zhilianDiagnosticButton) {
      zhilianDiagnosticButton.addEventListener('click', () => {
        void generateZhilianDiagnostic();
      });
    }
  
    /* =====================================================================
     * 悬浮球位置及面板
     * ===================================================================== */
  
    let position = (() => {
      const saved = load(CONFIG.POSITION_KEY, null);
  
      if (
        saved &&
        typeof saved.x === 'number' &&
        typeof saved.y === 'number'
      ) {
        return {
          x: saved.x,
          y: saved.y,
        };
      }
  
      return {
        x:
          window.innerWidth -
          CONFIG.FAB_SIZE -
          18,
        y:
          window.innerHeight -
          CONFIG.FAB_SIZE -
          18,
      };
    })();
  
    function applyPosition() {
      position.x = Math.min(
        Math.max(position.x, 0),
        Math.max(
          window.innerWidth - CONFIG.FAB_SIZE,
          0,
        ),
      );
  
      position.y = Math.min(
        Math.max(position.y, 0),
        Math.max(
          window.innerHeight - CONFIG.FAB_SIZE,
          0,
        ),
      );
  
      fab.style.left = `${position.x}px`;
      fab.style.top = `${position.y}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  
    function positionPanel() {
      const panelWidth = Math.min(
        CONFIG.PANEL_WIDTH,
        window.innerWidth - 16,
      );
  
      panel.style.width = `${panelWidth}px`;
  
      const panelHeight = Math.min(
        panel.offsetHeight || 480,
        window.innerHeight * 0.84,
      );
  
      let left =
        position.x -
        panelWidth +
        CONFIG.FAB_SIZE;
  
      let top =
        position.y +
        CONFIG.FAB_SIZE +
        6;
  
      left = Math.min(
        Math.max(left, 8),
        Math.max(
          window.innerWidth - panelWidth - 8,
          8,
        ),
      );
  
      if (
        top + panelHeight >
        window.innerHeight - 8
      ) {
        top =
          position.y -
          panelHeight -
          6;
      }
  
      top = Math.min(
        Math.max(top, 8),
        Math.max(
          window.innerHeight - panelHeight - 8,
          8,
        ),
      );
  
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
  
    function openPanel() {
      panel.classList.add('wj-show');
  
      requestAnimationFrame(() => {
        positionPanel();
        renderBlocked();
        scheduleScan(0);
      });
    }
  
    function closePanel() {
      panel.classList.remove('wj-show');
    }
  
    function togglePanel() {
      if (panel.classList.contains('wj-show')) {
        closePanel();
      } else {
        openPanel();
      }
    }
  
    applyPosition();
  
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
  
    fab.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
  
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      baseX = position.x;
      baseY = position.y;
  
      fab.setPointerCapture(event.pointerId);
    });
  
    fab.addEventListener('pointermove', (event) => {
      if (!dragging) {
        return;
      }
  
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
  
      if (
        Math.abs(deltaX) +
          Math.abs(deltaY) >
        4
      ) {
        moved = true;
      }
  
      position.x = baseX + deltaX;
      position.y = baseY + deltaY;
  
      applyPosition();
  
      if (panel.classList.contains('wj-show')) {
        positionPanel();
      }
    });
  
    fab.addEventListener('pointerup', (event) => {
      if (!dragging) {
        return;
      }
  
      dragging = false;
  
      if (fab.hasPointerCapture(event.pointerId)) {
        fab.releasePointerCapture(event.pointerId);
      }
  
      save(CONFIG.POSITION_KEY, {
        x: position.x,
        y: position.y,
      });
  
      if (!moved) {
        togglePanel();
      }
    });
  
    fab.addEventListener('pointercancel', () => {
      dragging = false;
    });
  
    fab.addEventListener('keydown', (event) => {
      if (
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        togglePanel();
      }
    });
  
    getById('wjClose').addEventListener(
      'click',
      closePanel,
    );
  
    getById('wjClose').addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          closePanel();
        }
      },
    );
  
    /* =====================================================================
     * 屏蔽名单管理
     * ===================================================================== */
  
    function addCompany(value) {
      const company = normalizeVisibleText(value);
  
      if (!company) {
        return;
      }
  
      const normalizedCompany =
        normalizeCompanyName(company);
  
      const exists = blocked.some(
        (item) =>
          normalizeCompanyName(item) ===
          normalizedCompany,
      );
  
      if (!exists) {
        blocked.push(company);
        save(CONFIG.STORAGE_KEY, blocked);
      }
  
      renderBlocked();
      scheduleScan(0);
    }
  
    function removeCompany(value) {
      const normalizedCompany =
        normalizeCompanyName(value);
  
      blocked = blocked.filter(
        (item) =>
          normalizeCompanyName(item) !==
          normalizedCompany,
      );
  
      save(CONFIG.STORAGE_KEY, blocked);
      renderBlocked();
      scheduleScan(0);
    }

    function addBlockedTitle(value) {
      const keyword = normalizeVisibleText(value);

      if (!keyword) {
        return;
      }

      const normalizedKeyword = keyword.toLocaleLowerCase();
      const exists = blockedTitles.some(
        (item) =>
          normalizeVisibleText(item).toLocaleLowerCase() ===
          normalizedKeyword,
      );

      if (!exists) {
        blockedTitles.push(keyword);
        save(CONFIG.TITLE_STORAGE_KEY, blockedTitles);
      }

      renderBlockedTitles();
      scheduleScan(0);
    }

    function removeBlockedTitle(value) {
      const normalizedKeyword = normalizeVisibleText(
        value,
      ).toLocaleLowerCase();

      blockedTitles = blockedTitles.filter(
        (item) =>
          normalizeVisibleText(item).toLocaleLowerCase() !==
          normalizedKeyword,
      );

      save(CONFIG.TITLE_STORAGE_KEY, blockedTitles);
      renderBlockedTitles();
      scheduleScan(0);
    }
  
    function submitCompanyInput() {
      const company = input.value;
  
      input.value = '';
      addCompany(company);
      input.focus();
    }

    function submitTitleInput() {
      const keyword = titleInput.value;

      titleInput.value = '';
      addBlockedTitle(keyword);
      titleInput.focus();
    }
  
    getById('wjAdd').addEventListener(
      'click',
      submitCompanyInput,
    );
  
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitCompanyInput();
      }
    });

    getById('wjTitleAdd').addEventListener(
      'click',
      submitTitleInput,
    );

    titleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitTitleInput();
      }
    });
  
    exactCheckbox.addEventListener(
      'change',
      (event) => {
        exactMatch = Boolean(
          event.currentTarget.checked,
        );
  
        save(CONFIG.EXACT_KEY, exactMatch);
        scheduleScan(0);
      },
    );
  
    getById('wjClearLog').addEventListener(
      'click',
      () => {
        filteredLog.length = 0;
        loggedJobs.clear();
        renderFiltered();
      },
    );
  
    reapplyButton.addEventListener(
      'click',
      () => {
        blocked = loadBlockedCompanies();
        blockedTitles = loadBlockedTitles();
  
        exactMatch = Boolean(
          load(
            CONFIG.EXACT_KEY,
            CONFIG.DEFAULT_EXACT_MATCH,
          ),
        );
  
        exactCheckbox.checked = exactMatch;
  
        renderBlocked();
        renderBlockedTitles();
        updateStats('已重新读取并应用筛选配置');
        scheduleScan(0);
      },
    );
  
    function renderBlocked() {
      blockedCount.textContent = String(
        blocked.length,
      );
  
      badge.textContent = String(blocked.length);
  
      if (blocked.length === 0) {
        blockedList.innerHTML =
          '<div class="wj-empty">暂无屏蔽公司，添加后自动过滤其职位。</div>';
        return;
      }
  
      blockedList.innerHTML = blocked
        .map(
          (company) => `
            <span class="wj-chip">
              ${escapeHtml(company)}
  
              <span
                class="wj-x"
                data-company="${escapeAttribute(company)}"
                role="button"
                tabindex="0"
                aria-label="取消屏蔽 ${escapeAttribute(company)}"
              >
                ×
              </span>
            </span>
          `,
        )
        .join('');
  
      blockedList
        .querySelectorAll('.wj-x')
        .forEach((removeButton) => {
          function remove() {
            removeCompany(
              removeButton.getAttribute(
                'data-company',
              ),
            );
          }
  
          removeButton.addEventListener(
            'click',
            remove,
          );
  
          removeButton.addEventListener(
            'keydown',
            (event) => {
              if (
                event.key === 'Enter' ||
                event.key === ' '
              ) {
                event.preventDefault();
                remove();
              }
            },
          );
        });
    }
  
    /* =====================================================================
     * 已过滤记录
     * ===================================================================== */
  
    function logFiltered(card, company) {
      const identity = [
        getJobIdentity(card),
        normalizeCompanyName(company),
      ].join(':');
  
      if (loggedJobs.has(identity)) {
        return false;
      }
  
      loggedJobs.add(identity);
  
      filteredLog.unshift({
        company,
        title: extractTitle(card),
        time: new Date().toLocaleTimeString(
          'zh-CN',
          {
            hour: '2-digit',
            minute: '2-digit',
          },
        ),
      });
  
      if (filteredLog.length > CONFIG.MAX_LOG) {
        filteredLog.length = CONFIG.MAX_LOG;
      }
  
      return true;
    }
  
    function renderFiltered() {
      filteredCount.textContent = String(
        filteredLog.length,
      );
  
      if (filteredLog.length === 0) {
        filteredList.innerHTML =
          '<div class="wj-empty">还没有过滤任何职位。</div>';
        return;
      }
  
      filteredList.innerHTML = filteredLog
        .map(
          (entry, index) => `
            <div class="wj-log">
              <div class="wj-info">
                <div class="wj-co">
                  ${escapeHtml(entry.company)}
                </div>
  
                <div
                  class="wj-ti"
                  title="${escapeAttribute(entry.title)}"
                >
                  ${escapeHtml(entry.title)}
                </div>
  
                <div class="wj-time">
                  ${escapeHtml(entry.time)}
                </div>
              </div>
  
              <button
                class="wj-unblock"
                data-index="${index}"
                type="button"
              >
                取消屏蔽
              </button>
            </div>
          `,
        )
        .join('');
  
      filteredList
        .querySelectorAll('.wj-unblock')
        .forEach((button) => {
          button.addEventListener(
            'click',
            () => {
              const index = Number(
                button.getAttribute('data-index'),
              );
  
              const entry = filteredLog[index];
  
              if (entry) {
                removeCompany(entry.company);
              }
            },
          );
        });
    }
  
    /* =====================================================================
     * 职位卡片屏蔽按钮
     * ===================================================================== */
  
    function addBlockButton(card) {
      const existingButton = Array.from(
        card.children,
      ).find((child) =>
        child.classList?.contains('wj-block-btn'),
      );
  
      const company = extractCompany(card);
  
      // 页面可能复用卡片 DOM，因此持续更新公司名。
      if (existingButton) {
        existingButton.dataset.company =
          company || '';
        return;
      }
  
      const button = document.createElement('span');
  
      button.className = 'wj-block-btn';
      button.textContent = '屏蔽该公司';
      button.dataset.company = company || '';
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
  
      function blockCurrentCompany(event) {
        event.stopPropagation();
        event.preventDefault();
  
        const currentCompany =
          button.dataset.company ||
          extractCompany(card);
  
        if (currentCompany) {
          addCompany(currentCompany);
          return;
        }
  
        openPanel();
        input.focus();
      }
  
      button.addEventListener(
        'click',
        blockCurrentCompany,
      );
  
      button.addEventListener(
        'keydown',
        (event) => {
          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {
            blockCurrentCompany(event);
          }
        },
      );
  
      if (
        getComputedStyle(card).position ===
        'static'
      ) {
        card.style.position = 'relative';
      }
  
      card.classList.add('wj-hasbtn');
      card.appendChild(button);
    }
  
    /* =====================================================================
     * 51job 一键投递
     * ===================================================================== */
  
    const APPLY_BUTTON_SELECTOR = [
      'button.btn.apply',
      'button.apply',
      'button[class*="apply"]',
      'button[track-type="searchTrackButtonClick"][event-type="99"]',
      'button[trace-name*="申请"]',
    ].join(',');
  
    const APPLY_TEXT_PATTERN =
      /申请职位|立即申请|投递简历|立即投递|马上申请|申请|投递/u;
  
    const APPLIED_TEXT_PATTERN =
      /已申请|已投递|申请成功|投递成功/u;
  
    function isElementVisible(element) {
      if (!(element instanceof Element)) {
        return false;
      }
  
      const computedStyle =
        getComputedStyle(element);
  
      if (
        computedStyle.display === 'none' ||
        computedStyle.visibility === 'hidden' ||
        Number(computedStyle.opacity) === 0
      ) {
        return false;
      }
  
      return element.getClientRects().length > 0;
    }
  
    function getApplyButtons(card) {
      const buttons = Array.from(
        card.querySelectorAll(APPLY_BUTTON_SELECTOR),
      );

      if (
        card.matches?.(APPLY_BUTTON_SELECTOR) &&
        !buttons.includes(card)
      ) {
        buttons.unshift(card);
      }

      return buttons;
    }

    function findApplyButton(card) {
      const buttons = getApplyButtons(card);
  
      for (const button of buttons) {
        const text = normalizeVisibleText(
          button.textContent,
        );
  
        if (button.disabled) {
          continue;
        }
  
        if (APPLIED_TEXT_PATTERN.test(text)) {
          continue;
        }
  
        if (!APPLY_TEXT_PATTERN.test(text)) {
          continue;
        }
  
        return button;
      }
  
      return null;
    }
  
    function getDeliveryCards() {
      const cards = getCards();
      const knownCards = new Set(cards);

      // 51job 偶尔会调整列表容器结构。以申请按钮反向定位卡片，
      // 避免职位已经显示但通用卡片选择器尚未适配时得到 0 条。
      for (const button of document.querySelectorAll(APPLY_BUTTON_SELECTOR)) {
        const card = button.closest(
          '.joblist-item-job, [sensorsname="JobShortExposure"], li.joblist, .job-card',
        );

        if (card && !knownCards.has(card)) {
          knownCards.add(card);
          cards.push(card);
        }
      }

      return cards;
    }

    function collectDeliverableJobs() {
      if (!IS_51JOB) {
        return { jobs: [], stats: null };
      }
  
      const jobs = [];
      const identities = new Set();
      const stats = {
        cards: 0,
        buttons: 0,
        hidden: 0,
        blocked: 0,
        applied: 0,
        disabled: 0,
        unmatched: 0,
      };
  
      for (const card of getDeliveryCards()) {
        stats.cards++;

        if (
          card.classList.contains(
            'wj-job-hidden',
          ) ||
          card.dataset.wjHidden === '1'
        ) {
          stats.hidden++;
          continue;
        }
  
        // 再次检查屏蔽名单，避免页面扫描尚未完成时误投。
        if (matchCompany(card) || matchJobTitle(card)) {
          stats.blocked++;
          continue;
        }

        const cardButtons = getApplyButtons(card);
        stats.buttons += cardButtons.length;

        if (cardButtons.length === 0) {
          continue;
        }

        const button = findApplyButton(card);
  
        if (!button) {
          for (const candidate of cardButtons) {
            const text = normalizeVisibleText(candidate.textContent);

            if (APPLIED_TEXT_PATTERN.test(text)) {
              stats.applied++;
            } else if (
              candidate.disabled ||
              candidate.getAttribute('aria-disabled') === 'true'
            ) {
              stats.disabled++;
            } else {
              stats.unmatched++;
            }
          }

          continue;
        }
  
        const identity = getJobIdentity(card);
  
        if (identities.has(identity)) {
          continue;
        }
  
        identities.add(identity);
  
        jobs.push({
          identity,
          card,
          button,
          title: extractTitle(card),
          company:
            extractCompany(card) ||
            '(未知公司)',
        });
      }
  
      return { jobs, stats };
    }

    function getBossJobId(card) {
      const href = card
        .querySelector('a[href*="/job_detail/"]')
        ?.getAttribute('href');

      if (!href) {
        return '';
      }

      const match = href.match(/\/job_detail\/([^/?#]+)\.html/i);
      return match ? match[1] : '';
    }

    function collectBossCommunicationJobs() {
      if (!IS_BOSS) {
        return { jobs: [], stats: null };
      }

      const jobs = [];
      const stats = {
        cards: 0,
        hidden: 0,
        blocked: 0,
        missingId: 0,
        contacted: 0,
      };
      const queuedJobIds = new Set();

      for (const card of getCards()) {
        stats.cards++;

        if (
          card.classList.contains('wj-job-hidden') ||
          card.dataset.wjHidden === '1'
        ) {
          stats.hidden++;
          continue;
        }

        if (matchCompany(card) || matchJobTitle(card)) {
          stats.blocked++;
          continue;
        }

        const jobId = getBossJobId(card);

        if (!jobId) {
          stats.missingId++;
          continue;
        }

        if (
          bossContactedJobIds.has(jobId) ||
          queuedJobIds.has(jobId)
        ) {
          stats.contacted++;
          continue;
        }

        queuedJobIds.add(jobId);

        jobs.push({
          identity: `boss:${jobId}`,
          jobId,
          card,
          title: extractTitle(card),
          company: extractCompany(card) || '(未知公司)',
        });
      }

      return { jobs, stats };
    }

    function rememberBossContactedJob(jobId) {
      if (!jobId || bossContactedJobIds.has(jobId)) {
        return;
      }

      bossContactedJobIds.add(jobId);
      save(CONFIG.BOSS_CONTACTED_KEY, Array.from(bossContactedJobIds));
    }

    function collectCurrentSiteJobs() {
      return IS_BOSS
        ? collectBossCommunicationJobs()
        : collectDeliverableJobs();
    }
  
    function getRandomDeliveryDelay() {
      const range =
        CONFIG.DELIVERY_MAX_DELAY -
        CONFIG.DELIVERY_MIN_DELAY +
        1;
  
      return (
        CONFIG.DELIVERY_MIN_DELAY +
        Math.floor(Math.random() * range)
      );
    }
  
    function waitForDeliveryDelay(delay) {
      return new Promise((resolve) => {
        const startedAt = Date.now();
  
        function check() {
          if (deliveryState.stopRequested) {
            resolve();
            return;
          }
  
          const elapsed = Date.now() - startedAt;
  
          if (elapsed >= delay) {
            resolve();
            return;
          }
  
          setTimeout(
            check,
            Math.min(100, delay - elapsed),
          );
        }
  
        check();
      });
    }

    function renderBlockedTitles() {
      blockedTitleCount.textContent = String(
        blockedTitles.length,
      );

      if (blockedTitles.length === 0) {
        blockedTitleList.innerHTML =
          '<div class="wj-empty">暂无职位关键词；添加“测试”会隐藏所有名称含“测试”的职位。</div>';
        return;
      }

      blockedTitleList.innerHTML = blockedTitles
        .map(
          (keyword) => `
            <span class="wj-chip">
              ${escapeHtml(keyword)}

              <span
                class="wj-x"
                data-title-keyword="${escapeAttribute(keyword)}"
                role="button"
                tabindex="0"
                aria-label="删除职位关键词 ${escapeAttribute(keyword)}"
              >
                ×
              </span>
            </span>
          `,
        )
        .join('');

      blockedTitleList
        .querySelectorAll('.wj-x')
        .forEach((removeButton) => {
          function remove() {
            removeBlockedTitle(
              removeButton.getAttribute(
                'data-title-keyword',
              ),
            );
          }

          removeButton.addEventListener('click', remove);
          removeButton.addEventListener(
            'keydown',
            (event) => {
              if (
                event.key === 'Enter' ||
                event.key === ' '
              ) {
                event.preventDefault();
                remove();
              }
            },
          );
        });
    }
  
    function updateDeliveryUi() {
      if (
        (!IS_51JOB && !IS_BOSS) ||
        !deliveryStartButton ||
        !deliveryCountElement ||
        !deliveryProgressElement ||
        !deliveryProgressBar ||
        !deliveryStatusElement
      ) {
        return;
      }
  
      const progress =
        deliveryState.total > 0
          ? Math.min(
              100,
              Math.round(
                (
                  deliveryState.completed /
                  deliveryState.total
                ) * 100,
              ),
            )
          : 0;
  
      deliveryProgressBar.style.width =
        `${progress}%`;
  
      deliveryProgressElement.setAttribute(
        'aria-valuenow',
        String(progress),
      );
  
      if (deliveryState.running) {
        deliveryStartButton.textContent =
          deliveryState.stopRequested
            ? '正在停止...'
            : '停止投递';
  
        deliveryStartButton.classList.add(
          'wj-delivery-stop',
        );
  
        deliveryCountElement.textContent =
          `${deliveryState.completed}/${deliveryState.total}`;
      } else {
        deliveryStartButton.textContent =
          IS_BOSS ? '一键沟通当前页' : '一键投递当前页';
  
        deliveryStartButton.classList.remove(
          'wj-delivery-stop',
        );
  
        if (deliveryState.total > 0) {
          deliveryCountElement.textContent =
            `${deliveryState.completed}/${deliveryState.total}`;
        } else {
          const { jobs: availableJobs } =
            collectCurrentSiteJobs();
  
          deliveryCountElement.textContent =
            `可投 ${availableJobs.length} 条`;
        }
      }
  
      if (deliveryState.message) {
        deliveryStatusElement.textContent =
          deliveryState.message;
        return;
      }
  
      if (
        deliveryState.running &&
        deliveryState.currentTitle
      ) {
        deliveryStatusElement.innerHTML = [
          '正在处理：',
          `<span class="wj-delivery-current">`,
          escapeHtml(
            `${deliveryState.currentTitle} · ${deliveryState.currentCompany}`,
          ),
          '</span>',
          ` · 已触发 ${deliveryState.triggered}`,
          ` · 跳过 ${deliveryState.skipped}`,
        ].join('');
  
        return;
      }
  
      deliveryStatusElement.textContent =
        `已触发 ${deliveryState.triggered} 条 · 跳过 ${deliveryState.skipped} 条`;
    }
  
    function stopDelivery() {
      if (!deliveryState.running) {
        return;
      }
  
      deliveryState.stopRequested = true;
      deliveryState.message =
        '正在停止，请稍候……';
  
      updateDeliveryUi();
    }
  
    async function runDeliveryQueue(jobs) {
      deliveryState.running = true;
      deliveryState.stopRequested = false;
      deliveryState.total = jobs.length;
      deliveryState.completed = 0;
      deliveryState.triggered = 0;
      deliveryState.skipped = 0;
      deliveryState.currentTitle = '';
      deliveryState.currentCompany = '';
      deliveryState.message = '';
  
      updateDeliveryUi();
  
      try {
        for (
          let index = 0;
          index < jobs.length;
          index++
        ) {
          if (deliveryState.stopRequested) {
            break;
          }
  
          const job = jobs[index];
  
          deliveryState.currentTitle = job.title;
          deliveryState.currentCompany =
            job.company;
  
          deliveryState.message = '';
          updateDeliveryUi();
  
          const currentButton =
            job.button.isConnected
              ? job.button
              : job.card.isConnected
                ? findApplyButton(job.card)
                : null;
  
          const shouldSkip =
            !job.card.isConnected ||
            job.card.classList.contains(
              'wj-job-hidden',
            ) ||
            job.card.dataset.wjHidden === '1' ||
            Boolean(matchCompany(job.card)) ||
            Boolean(matchJobTitle(job.card)) ||
            !currentButton ||
            !currentButton.isConnected ||
            currentButton.disabled ||
            currentButton.getAttribute(
              'aria-disabled',
            ) === 'true';
  
          if (shouldSkip) {
            deliveryState.skipped++;
            deliveryState.completed++;
            updateDeliveryUi();
            continue;
          }
  
          const currentText =
            normalizeVisibleText(
              currentButton.textContent,
            );
  
          if (
            APPLIED_TEXT_PATTERN.test(
              currentText,
            ) ||
            !APPLY_TEXT_PATTERN.test(currentText)
          ) {
            deliveryState.skipped++;
            deliveryState.completed++;
            updateDeliveryUi();
            continue;
          }
  
          try {
            currentButton.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest',
            });
  
            currentButton.click();
            deliveryState.triggered++;
          } catch {
            deliveryState.skipped++;
          }
  
          deliveryState.completed++;
          updateDeliveryUi();
  
          if (
            index < jobs.length - 1 &&
            !deliveryState.stopRequested
          ) {
            const delay =
              getRandomDeliveryDelay();
  
            deliveryState.message =
              `已处理 ${deliveryState.completed}/${deliveryState.total}` +
              `，${(delay / 1000).toFixed(1)} 秒后继续……`;
  
            updateDeliveryUi();
  
            await waitForDeliveryDelay(delay);
          }
        }
      } finally {
        const stopped =
          deliveryState.stopRequested;
  
        deliveryState.running = false;
        deliveryState.stopRequested = false;
        deliveryState.currentTitle = '';
        deliveryState.currentCompany = '';
  
        if (stopped) {
          deliveryState.message =
            `已停止：完成 ${deliveryState.completed}/${deliveryState.total}` +
            `，已触发 ${deliveryState.triggered}` +
            `，跳过 ${deliveryState.skipped}。`;
        } else {
          deliveryState.message =
            `处理完成：已触发 ${deliveryState.triggered} 条` +
            `，跳过 ${deliveryState.skipped} 条。` +
            '请检查页面提示确认实际投递结果。';
        }
  
        updateDeliveryUi();
        scheduleScan(300);
      }
    }

    function findBossChatButton(jobId) {
      const exact = document.querySelector(
        `a.op-btn-chat[ka="cpc_job_list_chat_${CSS.escape(jobId)}"]`,
      );

      if (exact && isElementVisible(exact)) {
        return exact;
      }

      return Array.from(
        document.querySelectorAll('a.op-btn-chat, [ka^="cpc_job_list_chat_"]'),
      ).find((element) =>
        isElementVisible(element) &&
        /立即沟通/u.test(normalizeVisibleText(element.textContent)),
      ) || null;
    }

    function waitForBossChatButton(jobId, timeout = 5000) {
      return new Promise((resolve) => {
        const startedAt = Date.now();

        function check() {
          if (deliveryState.stopRequested) {
            resolve(null);
            return;
          }

          const button = findBossChatButton(jobId);

          if (button) {
            resolve(button);
            return;
          }

          if (Date.now() - startedAt >= timeout) {
            resolve(null);
            return;
          }

          setTimeout(check, 100);
        }

        check();
      });
    }

    function findBossStayOnPageAction() {
      const textElements = Array.from(
        document.querySelectorAll(
          'button, a, div, span, [role="button"], [class*="btn"], [class*="button"]',
        ),
      );

      for (const textElement of textElements) {
        if (
          root.contains(textElement) ||
          !isElementVisible(textElement) ||
          normalizeVisibleText(textElement.textContent) !== '留在此页'
        ) {
          continue;
        }

        // 只允许真实交互元素，避免误点同时包含“留在此页/继续沟通”的弹窗容器。
        const button = textElement.matches(
          'button, a, [role="button"]',
        )
          ? textElement
          : textElement.closest('button, a, [role="button"]');

        if (!button || normalizeVisibleText(button.textContent) !== '留在此页') {
          continue;
        }

        let container = button.parentElement;
        let depth = 0;

        while (container && container !== document.body && depth < 10) {
          const text = normalizeVisibleText(container.textContent);

          if (/已向\s*boss\s*发送消息/iu.test(text)) {
            return { button, container };
          }

          container = container.parentElement;
          depth++;
        }
      }

      return null;
    }

    function captureBossPopupDiagnostic(reason) {
      const phrasePattern = /已向boss发送消息|留在此页|继续沟通|进入聊天/u;
      const visibleElements = Array.from(
        document.querySelectorAll(
          'div, section, aside, dialog, button, a, [role="dialog"], [role="button"]',
        ),
      ).filter((element) => {
        if (root.contains(element) || !isElementVisible(element)) {
          return false;
        }

        return phrasePattern.test(
          normalizeVisibleText(element.textContent),
        );
      });

      const smallestContainers = visibleElements
        .filter((element) =>
          !visibleElements.some(
            (other) =>
              other !== element &&
              element.contains(other) &&
              phrasePattern.test(
                normalizeVisibleText(other.textContent),
              ),
          ),
        )
        .slice(0, 30);

      lastBossPopupDiagnostic = {
        capturedAt: new Date().toISOString(),
        reason,
        elements: smallestContainers.map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: normalizeVisibleText(element.textContent).slice(0, 500),
          className: getSafeClassName(element).slice(0, 500),
          attributes: getSafeElementAttributes(element),
          parentTag: element.parentElement?.tagName.toLowerCase() || null,
          parentClassName: getSafeClassName(element.parentElement).slice(0, 500),
          parentText: normalizeVisibleText(
            element.parentElement?.textContent,
          ).slice(0, 800),
        })),
      };
    }

    function waitForBossSentDialog(timeout = 5000) {
      return new Promise((resolve) => {
        const startedAt = Date.now();

        function check() {
          if (deliveryState.stopRequested) {
            resolve(null);
            return;
          }

          const action = findBossStayOnPageAction();

          if (action) {
            resolve(action);
            return;
          }

          if (Date.now() - startedAt >= timeout) {
            resolve(null);
            return;
          }

          setTimeout(check, 100);
        }

        check();
      });
    }

    function waitForBossSentDialogToClose(action, timeout = 4000) {
      return new Promise((resolve) => {
        const startedAt = Date.now();

        function check() {
          const dialogClosed =
            !action.container.isConnected ||
            !isElementVisible(action.container) ||
            !normalizeVisibleText(action.container.textContent)
              .includes('已向boss发送消息');

          if (dialogClosed) {
            resolve(true);
            return;
          }

          if (Date.now() - startedAt >= timeout) {
            resolve(false);
            return;
          }

          setTimeout(check, 100);
        }

        check();
      });
    }

    async function closeBossSentDialog() {
      deliveryState.message = '等待 Boss 发送结果弹窗……';
      updateDeliveryUi();

      const action = await waitForBossSentDialog();

      if (!action) {
        captureBossPopupDiagnostic('未找到“留在此页”按钮或匹配弹窗');
        return false;
      }

      deliveryState.message = '已发送消息，正在点击“留在此页”……';
      updateDeliveryUi();

      try {
        action.button.click();
      } catch {
        captureBossPopupDiagnostic('找到按钮，但调用 click() 失败');
        return false;
      }

      deliveryState.message = '正在等待弹窗关闭……';
      updateDeliveryUi();

      const closed = await waitForBossSentDialogToClose(action);

      if (!closed) {
        captureBossPopupDiagnostic('点击后未确认弹窗关闭');
      }

      return closed;
    }

    async function runBossCommunicationQueue(jobs) {
      deliveryState.running = true;
      deliveryState.stopRequested = false;
      deliveryState.total = jobs.length;
      deliveryState.completed = 0;
      deliveryState.triggered = 0;
      deliveryState.skipped = 0;
      deliveryState.currentTitle = '';
      deliveryState.currentCompany = '';
      deliveryState.message = '';
      updateDeliveryUi();

      try {
        for (let index = 0; index < jobs.length; index++) {
          if (deliveryState.stopRequested) {
            break;
          }

          const job = jobs[index];
          deliveryState.currentTitle = job.title;
          deliveryState.currentCompany = job.company;
          deliveryState.message = '正在切换右侧职位详情……';
          updateDeliveryUi();

          if (
            !job.card.isConnected ||
            job.card.classList.contains('wj-job-hidden') ||
            matchCompany(job.card) ||
            matchJobTitle(job.card)
          ) {
            deliveryState.skipped++;
            deliveryState.completed++;
            updateDeliveryUi();
            continue;
          }

          job.card.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          job.card.click();

          const chatButton = await waitForBossChatButton(job.jobId);

          if (
            !chatButton ||
            normalizeVisibleText(chatButton.textContent) !== '立即沟通'
          ) {
            deliveryState.skipped++;
          } else {
            try {
              chatButton.click();
              deliveryState.triggered++;
              // Boss 沟通后按钮仍显示“立即沟通”，必须按职位 ID 自行去重。
              rememberBossContactedJob(job.jobId);

              const dialogClosed = await closeBossSentDialog();

              if (!dialogClosed) {
                deliveryState.message =
                  '未能确认“留在此页”弹窗已关闭，已停止队列以避免误操作。';
                deliveryState.stopRequested = true;
              }
            } catch {
              deliveryState.skipped++;
            }
          }

          deliveryState.completed++;
          updateDeliveryUi();

          if (
            index < jobs.length - 1 &&
            !deliveryState.stopRequested
          ) {
            const delay = getRandomDeliveryDelay();
            deliveryState.message =
              `已处理 ${deliveryState.completed}/${deliveryState.total}` +
              `，${(delay / 1000).toFixed(1)} 秒后继续……`;
            updateDeliveryUi();
            await waitForDeliveryDelay(delay);
          }
        }
      } finally {
        const stopped = deliveryState.stopRequested;
        const stopMessage = deliveryState.message;
        deliveryState.running = false;
        deliveryState.stopRequested = false;
        deliveryState.currentTitle = '';
        deliveryState.currentCompany = '';
        deliveryState.message = stopped && stopMessage.includes('未能确认')
          ? `${stopMessage} 当前进度 ${deliveryState.completed}/${deliveryState.total}。` +
            '请手动关闭弹窗，然后点击“生成 Boss 诊断”。'
          : stopped
            ? `已停止：完成 ${deliveryState.completed}/${deliveryState.total}，` +
              `已触发 ${deliveryState.triggered}，跳过 ${deliveryState.skipped}。`
            : `处理完成：已触发沟通 ${deliveryState.triggered} 条，` +
              `跳过 ${deliveryState.skipped} 条。`;
        updateDeliveryUi();
        scheduleScan(300);
      }
    }

    async function startBossCommunication() {
      scanAll();
      const { jobs, stats } = collectBossCommunicationJobs();

      if (jobs.length === 0) {
        deliveryState.total = 0;
        deliveryState.completed = 0;
        deliveryState.triggered = 0;
        deliveryState.skipped = 0;
        deliveryState.message = stats
          ? `没有可沟通职位：检测卡片 ${stats.cards}，` +
            `已屏蔽 ${stats.blocked + stats.hidden}，` +
            `已记录沟通 ${stats.contacted}，缺少职位 ID ${stats.missingId}。`
          : '当前页面没有可沟通职位。';
        updateDeliveryUi();
        return;
      }

      const confirmed = window.confirm(
        `即将依次处理当前页面 ${jobs.length} 个 Boss 职位。\n\n` +
        '脚本会逐条选择职位，在右侧详情点击“立即沟通”。\n' +
        '已屏蔽的公司和职位关键词会跳过。\n' +
        '每次随机间隔 0.8～2.0 秒，运行中可停止。\n\n' +
        '是否开始？',
      );

      if (confirmed) {
        await runBossCommunicationQueue(jobs);
      }
    }
  
    async function startDelivery() {
      if (deliveryState.running) {
        stopDelivery();
        return;
      }

      if (IS_BOSS) {
        await startBossCommunication();
        return;
      }

      if (!IS_51JOB) {
        return;
      }
  
      // 开始前同步扫描一次，确保屏蔽名单已应用。
      scanAll();
  
      const { jobs, stats } = collectDeliverableJobs();
  
      if (jobs.length === 0) {
        deliveryState.total = 0;
        deliveryState.completed = 0;
        deliveryState.triggered = 0;
        deliveryState.skipped = 0;
  
        const details = stats
          ? `检测卡片 ${stats.cards}，申请按钮 ${stats.buttons}，` +
            `已申请 ${stats.applied}，禁用 ${stats.disabled}，` +
            `已屏蔽 ${stats.blocked + stats.hidden}，未识别 ${stats.unmatched}。`
          : '';

        deliveryState.message =
          `当前页面没有可投递职位。${details}`;
  
        updateDeliveryUi();
        return;
      }
  
      const confirmed = window.confirm(
        `即将依次触发当前页面 ${jobs.length} 个职位的申请按钮。\n\n` +
        '执行规则：\n' +
        '• 跳过屏蔽公司\n' +
        '• 跳过已申请职位\n' +
        '• 跳过不可见或按钮不可用的职位\n' +
        '• 每次随机间隔 0.8～2.0 秒\n' +
        '• 运行过程中可点击“停止投递”\n' +
        '• 登录、确认弹窗或验证码需要手动处理\n\n' +
        '“已触发”只表示脚本点击了申请按钮，不代表服务端最终投递成功。\n\n' +
        '是否开始？',
      );
  
      if (!confirmed) {
        return;
      }
  
      await runDeliveryQueue(jobs);
    }
  
    if (deliveryStartButton) {
      deliveryStartButton.addEventListener(
        'click',
        () => {
          void startDelivery();
        },
      );
    }
  
    /* =====================================================================
     * 扫描及过滤
     * ===================================================================== */
  
    function updateStats(message) {
      if (!statsElement) {
        return;
      }
  
      statsElement.textContent =
        message ||
        `本页检测到 ${statDetected} 条职位 · 当前隐藏 ${statHidden} 条`;
    }
  
    function scheduleScan(
      delay = CONFIG.SCAN_DELAY,
    ) {
      clearTimeout(scanTimer);
  
      scanTimer = setTimeout(
        scanAll,
        delay,
      );
    }
  
    function scanAll() {
      if (scanning) {
        scanQueued = true;
        return;
      }
  
      scanning = true;
      scanQueued = false;
  
      try {
        const cards = getCards();
        let logChanged = false;
  
        statDetected = cards.length;
        statHidden = 0;
  
        for (const card of cards) {
          addBlockButton(card);
  
          const matchedCompany = matchCompany(card);
          const matchedTitle = matchJobTitle(card);
          const matchedReason = matchedCompany
            ? matchedCompany
            : matchedTitle
              ? `职位关键词：${matchedTitle}`
              : null;
  
          const wasHidden =
            card.classList.contains(
              'wj-job-hidden',
            );
  
          if (matchedReason) {
            statHidden++;
  
            card.classList.add(
              'wj-job-hidden',
            );
  
            card.dataset.wjHidden = '1';
  
            if (
              !wasHidden &&
              logFiltered(
                card,
                matchedReason,
              )
            ) {
              logChanged = true;
            }
          } else {
            card.classList.remove(
              'wj-job-hidden',
            );
  
            delete card.dataset.wjHidden;
          }
        }
  
        if (logChanged) {
          renderFiltered();
        }
  
        updateStats();
  
        if (
          (IS_51JOB || IS_BOSS) &&
          !deliveryState.running
        ) {
          updateDeliveryUi();
        }
      } finally {
        scanning = false;
  
        if (scanQueued) {
          scheduleScan(50);
        }
      }
    }
  
    /* =====================================================================
     * 动态页面监听
     * ===================================================================== */
  
    function isScriptOwnedElement(node) {
      if (!(node instanceof Element)) {
        return false;
      }
  
      return (
        node === root ||
        root.contains(node) ||
        node.classList.contains(
          'wj-block-btn',
        )
      );
    }
  
    function isRelevantMutation(record) {
      if (root.contains(record.target)) {
        return false;
      }
  
      if (record.type === 'characterData') {
        return true;
      }
  
      const changedNodes = [
        ...record.addedNodes,
        ...record.removedNodes,
      ];
  
      if (changedNodes.length === 0) {
        return true;
      }
  
      return changedNodes.some((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return true;
        }
  
        return !isScriptOwnedElement(node);
      });
    }
  
    const observer = new MutationObserver(
      (records) => {
        if (records.some(isRelevantMutation)) {
          scheduleScan();
        }
      },
    );
  
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  
    /* =====================================================================
     * 初始化
     * ===================================================================== */
  
    function init() {
      renderBlocked();
      renderBlockedTitles();
      renderFiltered();
      scanAll();
  
      if (IS_51JOB || IS_BOSS) {
        updateDeliveryUi();
      }
    }
  
    init();
  
    window.addEventListener(
      'load',
      () => {
        scheduleScan(0);
      },
      { once: true },
    );
  
    window.addEventListener(
      'pageshow',
      () => {
        scheduleScan(0);
      },
    );
  
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          scheduleScan(0);
        }
      },
    );
  
    window.addEventListener(
      'resize',
      () => {
        applyPosition();
  
        if (panel.classList.contains('wj-show')) {
          positionPanel();
        }
      },
      { passive: true },
    );
  })();
