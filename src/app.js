const app = document.querySelector('#app');
const APP_CONFIG = window.APP_CONFIG || {};
const SHARED_STATE_CONFIG = APP_CONFIG.sharedState || {};
const LOCAL_STORAGE_KEY = 'cloud-ai-buddy-programme-state';
const VIEWS = {
  pairings: 'pairings',
  waiting: 'waiting',
};
const LEVELS = ['Beginner', 'Intermediate', 'Expert'];
const TOPIC_CATEGORIES = ['Cloud', 'AI', 'Other'];

const DEFAULT_TOPICS = {
  Cloud: [
    'AWS',
    'Azure',
    'Cloud Migration',
    'Cloud Networking',
    'Cloud Security & DevSecOps',
    'Cloud Storage & Databases',
    'Data Engineering',
    'FinOps & Cloud Cost Management',
    'Google Cloud Platform',
    'Infrastructure as Code',
    'Kubernetes & Containers',
    'Multi-Cloud Strategy',
    'Platform Engineering',
    'Serverless Architecture',
    'Site Reliability Engineering (SRE)',
  ],
  AI: [
    'AI Agents & Automation',
    'AI Ethics & Governance',
    'AI in Cybersecurity',
    'Computer Vision',
    'Data Science & Analytics',
    'Fine-tuning & Model Adaptation',
    'Generative AI for Business',
    'Large Language Models (LLMs)',
    'Machine Learning Fundamentals',
    'MLOps & Model Deployment',
    'Natural Language Processing (NLP)',
    'Prompt Engineering',
    'Responsible AI',
    'Retrieval-Augmented Generation (RAG)',
    'UX / Front-End AI Tooling',
  ],
  Other: [],
};

const DEFAULT_TOPICS_LIST = Object.entries(DEFAULT_TOPICS).flatMap(([category, names]) =>
  names.map((name) => ({
    id: slugify(`${category}-${name}`),
    name,
    category,
    isDefault: true,
  })),
);

const state = {
  data: createDefaultData(),
  loaded: false,
  loading: true,
  view: VIEWS.pairings,
  showFilters: false,
  topicFilters: [],
  levelFilters: [],
  modal: null,
  toast: null,
  error: '',
  syncMode: 'Private to this browser',
  syncStatus: 'Loading…',
  lastUpdatedAt: '',
};

const storageService = createStorageService(SHARED_STATE_CONFIG);

function createDefaultData() {
  return {
    topics: DEFAULT_TOPICS_LIST,
    waitingEntries: [],
    groups: [
      {
        id: createId(),
        topicId: slugify('AI-UX / Front-End AI Tooling'),
        createdAt: new Date().toISOString(),
        members: [
          { id: createId(), name: 'Ed L', level: 'Intermediate' },
          { id: createId(), name: 'James R', level: 'Intermediate' },
        ],
      },
    ],
  };
}

function createStorageService(sharedConfig) {
  const localStorageService = {
    label: 'Private to this browser',
    shared: false,
    async get() {
      return readLocalEnvelope();
    },
    async set(envelope) {
      writeLocalEnvelope(envelope);
      return envelope;
    },
    startPolling() {
      return () => {};
    },
  };

  if (!isSharedStateConfigured(sharedConfig)) {
    return localStorageService;
  }

  return {
    label: 'Shared across everyone using this site',
    shared: true,
    async get() {
      try {
        const remoteEnvelope = await readSharedEnvelope(sharedConfig);
        if (remoteEnvelope) {
          writeLocalEnvelope(remoteEnvelope);
          return remoteEnvelope;
        }
      } catch (error) {
        console.error('Shared state load failed:', error);
      }

      return readLocalEnvelope();
    },
    async set(envelope) {
      writeLocalEnvelope(envelope);
      await writeSharedEnvelope(sharedConfig, envelope);
      return envelope;
    },
    startPolling(onRemoteEnvelope) {
      const pollInterval = sharedConfig.pollIntervalMs || 15000;
      const intervalId = window.setInterval(async () => {
        try {
          const remoteEnvelope = await readSharedEnvelope(sharedConfig);
          if (!remoteEnvelope) return;
          if (remoteEnvelope.updatedAt > state.lastUpdatedAt) {
            writeLocalEnvelope(remoteEnvelope);
            onRemoteEnvelope(remoteEnvelope);
          }
        } catch (error) {
          console.error('Shared state polling failed:', error);
        }
      }, pollInterval);

      return () => window.clearInterval(intervalId);
    },
  };
}

function isSharedStateConfigured(sharedConfig) {
  return Boolean(
    sharedConfig?.enabled &&
      sharedConfig?.provider === 'supabase' &&
      sharedConfig?.supabaseUrl &&
      sharedConfig?.supabaseAnonKey &&
      sharedConfig?.table &&
      sharedConfig?.rowId,
  );
}

function readLocalEnvelope() {
  const rawValue = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!rawValue) return null;

  const parsed = parseStoredValue(rawValue);
  return normaliseEnvelope(parsed);
}

function writeLocalEnvelope(envelope) {
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(envelope));
}

async function readSharedEnvelope(sharedConfig) {
  const response = await fetch(
    `${sharedConfig.supabaseUrl}/rest/v1/${sharedConfig.table}?id=eq.${encodeURIComponent(
      sharedConfig.rowId,
    )}&select=id,payload,updated_at`,
    {
      headers: createSupabaseHeaders(sharedConfig),
    },
  );

  if (!response.ok) {
    throw new Error(`Shared load failed with status ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return normaliseEnvelope({
    updatedAt: rows[0].updated_at,
    data: rows[0].payload,
  });
}

async function writeSharedEnvelope(sharedConfig, envelope) {
  const response = await fetch(
    `${sharedConfig.supabaseUrl}/rest/v1/${sharedConfig.table}?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        ...createSupabaseHeaders(sharedConfig),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([
        {
          id: sharedConfig.rowId,
          payload: envelope.data,
          updated_at: envelope.updatedAt,
        },
      ]),
    },
  );

  if (!response.ok) {
    throw new Error(`Shared save failed with status ${response.status}`);
  }
}

function createSupabaseHeaders(sharedConfig) {
  return {
    apikey: sharedConfig.supabaseAnonKey,
    Authorization: `Bearer ${sharedConfig.supabaseAnonKey}`,
    Accept: 'application/json',
  };
}

function normaliseEnvelope(candidate) {
  if (!candidate) return null;
  if (candidate.data && candidate.updatedAt) {
    return {
      updatedAt: candidate.updatedAt,
      data: sanitiseState(candidate.data),
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    data: sanitiseState(candidate),
  };
}

function parseStoredValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2, 11)}`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sanitiseState(input) {
  const topics = sanitiseTopics(input?.topics);
  const waitingEntries = Array.isArray(input?.waitingEntries)
    ? input.waitingEntries.map((entry) => sanitiseEntry(entry, topics)).filter(Boolean)
    : [];
  const groups = Array.isArray(input?.groups)
    ? input.groups.map((group) => sanitiseGroup(group, topics)).filter(Boolean)
    : createDefaultData().groups;

  return { topics, waitingEntries, groups };
}

function sanitiseTopics(inputTopics) {
  const merged = [...DEFAULT_TOPICS_LIST];
  if (!Array.isArray(inputTopics)) return merged.sort(byTopicName);

  inputTopics.forEach((topic) => {
    const name = String(topic?.name || '').trim();
    const category = TOPIC_CATEGORIES.includes(topic?.category) ? topic.category : 'Other';
    if (!name) return;
    if (merged.some((item) => item.name.toLowerCase() === name.toLowerCase())) return;

    merged.push({
      id: topic?.id || createId(),
      name,
      category,
      isDefault: Boolean(topic?.isDefault),
    });
  });

  return merged.sort(byTopicName);
}

function sanitiseEntry(entry, topics) {
  const name = String(entry?.name || '').trim();
  const level = LEVELS.includes(entry?.level) ? entry.level : null;
  if (!name || !level || !topics.some((topic) => topic.id === entry?.topicId)) return null;

  return {
    id: entry?.id || createId(),
    name,
    level,
    topicId: entry.topicId,
    createdAt: entry?.createdAt || new Date().toISOString(),
  };
}

function sanitiseGroup(group, topics) {
  if (!topics.some((topic) => topic.id === group?.topicId)) return null;

  const members = Array.isArray(group?.members)
    ? group.members
        .map((member) => {
          const name = String(member?.name || '').trim();
          const level = LEVELS.includes(member?.level) ? member.level : null;
          if (!name || !level) return null;
          return { id: member?.id || createId(), name, level };
        })
        .filter(Boolean)
    : [];

  if (members.length < 2) return null;

  return {
    id: group?.id || createId(),
    topicId: group.topicId,
    createdAt: group?.createdAt || new Date().toISOString(),
    members,
  };
}

function byTopicName(left, right) {
  return left.name.localeCompare(right.name);
}

function getTopicById(topicId) {
  return state.data.topics.find((topic) => topic.id === topicId);
}

function getGroupType(members) {
  return new Set(members.map((member) => member.level)).size === 1 ? 'Peer' : 'Mentor / Mentee';
}

function getPairingDescription(existingLevel, joiningLevel) {
  if (existingLevel === joiningLevel) return 'Peer to peer';
  if (LEVELS.indexOf(joiningLevel) > LEVELS.indexOf(existingLevel)) return 'Mentor to mentee';
  return 'Mentee to mentor';
}

function groupedWaiting() {
  return state.data.waitingEntries.reduce((accumulator, entry) => {
    if (!matchesWaitingFilters(entry)) return accumulator;
    (accumulator[entry.topicId] ||= []).push(entry);
    return accumulator;
  }, {});
}

function groupedGroups() {
  return state.data.groups.reduce((accumulator, group) => {
    if (!matchesGroupFilters(group)) return accumulator;
    (accumulator[group.topicId] ||= []).push(group);
    return accumulator;
  }, {});
}

function matchesWaitingFilters(entry) {
  const topicMatch = state.topicFilters.length === 0 || state.topicFilters.includes(entry.topicId);
  const levelMatch = state.levelFilters.length === 0 || state.levelFilters.includes(entry.level);
  return topicMatch && levelMatch;
}

function matchesGroupFilters(group) {
  const topicMatch = state.topicFilters.length === 0 || state.topicFilters.includes(group.topicId);
  const levelMatch =
    state.levelFilters.length === 0 || group.members.some((member) => state.levelFilters.includes(member.level));
  return topicMatch && levelMatch;
}

function topicActivity(topicId) {
  return {
    waiting: state.data.waitingEntries.filter((entry) => entry.topicId === topicId).length,
    groups: state.data.groups.filter((group) => group.topicId === topicId).length,
  };
}

function getAllNames() {
  const waiting = state.data.waitingEntries.map((entry) => entry.name.toLowerCase());
  const grouped = state.data.groups.flatMap((group) => group.members.map((member) => member.name.toLowerCase()));
  return new Set([...waiting, ...grouped]);
}

async function persistState(message) {
  const envelope = {
    updatedAt: new Date().toISOString(),
    data: state.data,
  };

  state.syncStatus = storageService.shared ? 'Syncing changes…' : 'Saved in this browser';
  render();

  try {
    const storedEnvelope = await storageService.set(envelope);
    state.lastUpdatedAt = storedEnvelope.updatedAt;
    state.syncStatus = storageService.shared ? `Live for everyone · ${formatDateTime(storedEnvelope.updatedAt)}` : 'Saved in this browser';
    if (message) showToast(message);
  } catch (error) {
    console.error('Persist failed:', error);
    state.error = 'We could not save your changes. Please try again.';
    state.syncStatus = storageService.shared ? 'Shared sync failed' : 'Save failed';
  }

  render();
}

function showToast(message) {
  state.toast = message;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2600);
}

async function addWaitingEntry(payload) {
  const name = payload.name.trim();
  if (!name || !payload.topicId || !payload.level) {
    state.error = 'Please complete every field.';
    render();
    return;
  }

  if (getAllNames().has(name.toLowerCase())) {
    state.error = 'That name already exists in the programme.';
    render();
    return;
  }

  state.data.waitingEntries.push({
    id: createId(),
    name,
    topicId: payload.topicId,
    level: payload.level,
    createdAt: new Date().toISOString(),
  });
  state.modal = null;
  state.error = '';
  await persistState(`${name} added to the waiting list.`);
}

async function addTopic(payload) {
  const name = payload.name.trim();
  if (!name) {
    state.error = 'Topic names cannot be blank.';
    render();
    return;
  }

  if (state.data.topics.some((topic) => topic.name.toLowerCase() === name.toLowerCase())) {
    state.error = 'That topic already exists.';
    render();
    return;
  }

  state.data.topics.push({
    id: createId(),
    name,
    category: payload.category,
    isDefault: false,
  });
  state.data.topics.sort(byTopicName);
  state.error = '';
  await persistState(`${name} added to ${payload.category}.`);
}

async function joinGroup(payload) {
  const name = payload.name.trim();
  if (!name) {
    state.error = 'Please add a name before joining.';
    render();
    return;
  }

  if (getAllNames().has(name.toLowerCase())) {
    state.error = 'That name already exists in the programme.';
    render();
    return;
  }

  const group = state.data.groups.find((item) => item.id === payload.groupId);
  if (!group) return;

  group.members.push({ id: createId(), name, level: payload.level });
  state.modal = null;
  state.error = '';
  await persistState(`${name} joined the group.`);
}

async function createPair(payload) {
  const partnerName = payload.partnerName.trim();
  if (!partnerName) {
    state.error = 'Please add your name before creating a pairing.';
    render();
    return;
  }

  if (getAllNames().has(partnerName.toLowerCase())) {
    state.error = 'That name already exists in the programme.';
    render();
    return;
  }

  const entryIndex = state.data.waitingEntries.findIndex((entry) => entry.id === payload.entryId);
  if (entryIndex === -1) return;

  const entry = state.data.waitingEntries[entryIndex];
  state.data.waitingEntries.splice(entryIndex, 1);
  state.data.groups.push({
    id: createId(),
    topicId: entry.topicId,
    createdAt: new Date().toISOString(),
    members: [
      { id: createId(), name: entry.name, level: entry.level },
      { id: createId(), name: partnerName, level: payload.partnerLevel },
    ],
  });
  state.modal = null;
  state.error = '';
  await persistState(`Created a new pairing for ${entry.name}.`);
}

async function removeMember(groupId, memberId) {
  const groupIndex = state.data.groups.findIndex((group) => group.id === groupId);
  if (groupIndex === -1) return;

  const group = state.data.groups[groupIndex];
  const remainingMembers = group.members.filter((member) => member.id !== memberId);

  if (remainingMembers.length >= 2) {
    group.members = remainingMembers;
  } else {
    state.data.groups.splice(groupIndex, 1);
    if (remainingMembers.length === 1) {
      state.data.waitingEntries.push({
        id: createId(),
        name: remainingMembers[0].name,
        level: remainingMembers[0].level,
        topicId: group.topicId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  state.error = '';
  await persistState('Member removed and the group was tidied up.');
}

async function resetProgramme() {
  state.data = sanitiseState(createDefaultData());
  state.topicFilters = [];
  state.levelFilters = [];
  state.modal = null;
  state.error = '';
  await persistState('Programme reset to default state.');
}

function render() {
  const topicCounts = TOPIC_CATEGORIES.reduce((counts, category) => {
    counts[category] = state.data.topics.filter((topic) => topic.category === category).length;
    return counts;
  }, {});
  const waitingByTopic = groupedWaiting();
  const groupsByTopic = groupedGroups();
  const filteredWaitingCount = Object.values(waitingByTopic).reduce((sum, entries) => sum + entries.length, 0);
  const filteredGroupCount = Object.values(groupsByTopic).reduce((sum, groups) => sum + groups.length, 0);
  const activeUsersCount = state.data.groups.reduce((sum, group) => sum + group.members.length, 0);
  const resultCount = state.view === VIEWS.waiting ? filteredWaitingCount : filteredGroupCount;

  app.innerHTML = `
    <div class="app-shell">
      ${state.toast ? `<div class="toast-stack" aria-live="polite"><div class="toast">${escapeHtml(state.toast)}</div></div>` : ''}
      <header class="top-shell">
        <div class="brand-block">
          <p class="eyebrow">Cloud & AI community programme</p>
          <div class="brand-row">
            <div>
              <h1>Cloud &amp; AI Buddy Programme</h1>
              <p class="hero-copy">Compact matching for buddying, mentoring, and peer learning across Cloud and AI topics.</p>
            </div>
            <div class="header-actions">
              <button class="primary-button" data-action="open-add">Add Myself</button>
              <button class="ghost-button" data-action="reset">Reset</button>
            </div>
          </div>
        </div>
        <div class="sync-strip ${storageService.shared ? 'shared' : ''}">
          <div>
            <span class="sync-label">State</span>
            <strong>${escapeHtml(state.syncMode)}</strong>
          </div>
          <span class="sync-status">${escapeHtml(state.syncStatus)}</span>
        </div>
        <div class="metrics-row">
          <article class="metric-card accent">
            <span>Waiting</span>
            <strong>${state.data.waitingEntries.length}</strong>
          </article>
          <article class="metric-card">
            <span>Active people</span>
            <strong>${activeUsersCount}</strong>
          </article>
          ${TOPIC_CATEGORIES.filter((category) => topicCounts[category] > 0)
            .map(
              (category) => `
                <button class="metric-card metric-button" data-action="open-topic-panel" data-category="${category}">
                  <span>${category}</span>
                  <strong>${topicCounts[category]}</strong>
                </button>`,
            )
            .join('')}
        </div>
      </header>

      <section class="toolbar-card">
        <div class="toolbar-row compact-tabs" role="tablist" aria-label="Views">
          <button class="tab ${state.view === VIEWS.pairings ? 'active' : ''}" data-action="switch-view" data-view="pairings">Active Pairings</button>
          <button class="tab ${state.view === VIEWS.waiting ? 'active' : ''}" data-action="switch-view" data-view="waiting">Looking for a Buddy</button>
        </div>
        <div class="toolbar-row filters-summary">
          <button class="filter-toggle" data-action="toggle-filters">${state.showFilters ? 'Hide filters' : 'Show filters'}</button>
          <span>${state.topicFilters.length + state.levelFilters.length} selected</span>
          <span>${resultCount} result(s)</span>
          <button class="ghost-button small" ${state.topicFilters.length + state.levelFilters.length === 0 ? 'disabled' : ''} data-action="clear-filters">Clear all</button>
        </div>
      </section>

      ${state.showFilters ? renderFilters() : ''}
      ${state.error ? `<div class="inline-alert">${escapeHtml(state.error)}</div>` : ''}
      ${state.loading ? '<section class="empty-state"><h2>Loading programme data…</h2></section>' : ''}
      <main class="content-grid ${state.loading ? 'hidden' : ''}">
        ${state.view === VIEWS.waiting ? renderWaiting(waitingByTopic) : renderGroups(groupsByTopic)}
      </main>
      ${renderModal()}
    </div>
  `;

  bindEvents();
}

function renderFilters() {
  return `
    <section class="filters-panel compact-panel">
      <div>
        <p class="section-label">Topics</p>
        <div class="chip-wrap">
          ${state.data.topics
            .map(
              (topic) => `
                <button class="chip ${state.topicFilters.includes(topic.id) ? 'active' : ''}" data-action="toggle-topic-filter" data-topic-id="${topic.id}">
                  ${escapeHtml(topic.name)}
                </button>`,
            )
            .join('')}
        </div>
      </div>
      <div>
        <p class="section-label">Experience levels</p>
        <div class="chip-wrap">
          ${LEVELS.map(
            (level) => `
              <button class="chip ${state.levelFilters.includes(level) ? 'active' : ''}" data-action="toggle-level-filter" data-level="${level}">
                ${level}
              </button>`,
          ).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderWaiting(waitingByTopic) {
  const sections = Object.entries(waitingByTopic)
    .map(([topicId, entries]) => {
      const topic = getTopicById(topicId);
      return `
        <section class="topic-card compact-card">
          <div class="topic-card-header">
            <div>
              <h2>${escapeHtml(topic.name)}</h2>
              <div class="meta-row">
                <span class="category-badge">${topic.category}</span>
                <span class="count-pill">${entries.length} waiting</span>
              </div>
            </div>
          </div>
          <div class="stack-list">
            ${entries
              .map(
                (entry) => `
                  <article class="row-card compact-row">
                    <div class="person-block">
                      <strong>${escapeHtml(entry.name)}</strong>
                      <span class="level-badge ${entry.level.toLowerCase()}">${entry.level}</span>
                    </div>
                    <button class="secondary-button small" data-action="open-pair" data-entry-id="${entry.id}">Pair</button>
                  </article>`,
              )
              .join('')}
          </div>
        </section>`;
    })
    .join('');

  return sections || `<section class="empty-state"><h2>No waiting users</h2><p>Add the first person to start the programme.</p></section>`;
}

function renderGroups(groupsByTopic) {
  const sections = Object.entries(groupsByTopic)
    .map(([topicId, groups]) => {
      const topic = getTopicById(topicId);
      return `
        <section class="topic-card compact-card">
          <div class="topic-card-header">
            <div>
              <h2>${escapeHtml(topic.name)}</h2>
              <div class="meta-row">
                <span class="category-badge">${topic.category}</span>
                <span class="count-pill">${groups.length} active</span>
              </div>
            </div>
          </div>
          <div class="stack-list">
            ${groups
              .map(
                (group) => `
                  <article class="group-card compact-group">
                    <div class="group-card-header">
                      <span class="group-type">${getGroupType(group.members)}</span>
                      <button class="secondary-button small" data-action="open-join" data-group-id="${group.id}">Join group</button>
                    </div>
                    <div class="member-grid compact-member-grid">
                      ${group.members
                        .map(
                          (member) => `
                            <div class="member-card compact-member-card">
                              <div class="person-block">
                                <strong>${escapeHtml(member.name)}</strong>
                                <span class="level-badge ${member.level.toLowerCase()}">${member.level}</span>
                              </div>
                              <button class="ghost-button small danger" data-action="remove-member" data-group-id="${group.id}" data-member-id="${member.id}">Remove</button>
                            </div>`,
                        )
                        .join('')}
                    </div>
                  </article>`,
              )
              .join('')}
          </div>
        </section>`;
    })
    .join('');

  return sections || `<section class="empty-state"><h2>No active groups</h2><p>Pairings will appear here once people start connecting.</p></section>`;
}

function renderModal() {
  if (!state.modal) return '';

  if (state.modal.type === 'add-self') {
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">Add yourself</h2>
            <button class="ghost-button small" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <form class="modal-form" data-form="add-self">
            <label>Name<input name="name" placeholder="Your name" required /></label>
            <label>Topic<select name="topicId">${renderTopicOptions()}</select></label>
            <label>Experience level<select name="level">${LEVELS.map((level) => `<option value="${level}">${level}</option>`).join('')}</select></label>
            <button class="primary-button" type="submit">Add to waiting list</button>
          </form>
        </div>
      </div>`;
  }

  if (state.modal.type === 'join-group') {
    const group = state.data.groups.find((item) => item.id === state.modal.groupId);
    const topic = group ? getTopicById(group.topicId) : null;
    if (!group || !topic) return '';

    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">Join group</h2>
            <button class="ghost-button small" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <p class="modal-copy">Join <strong>${escapeHtml(topic.name)}</strong> with ${group.members.length} existing member(s).</p>
          <form class="modal-form" data-form="join-group" data-group-id="${group.id}">
            <label>Name<input name="name" placeholder="Your name" required /></label>
            <label>Experience level<select name="level">${LEVELS.map((level) => `<option value="${level}">${level}</option>`).join('')}</select></label>
            <button class="primary-button" type="submit">Join group</button>
          </form>
        </div>
      </div>`;
  }

  if (state.modal.type === 'pair') {
    const entry = state.data.waitingEntries.find((item) => item.id === state.modal.entryId);
    const topic = entry ? getTopicById(entry.topicId) : null;
    if (!entry || !topic) return '';
    const description = getPairingDescription(entry.level, state.modal.partnerLevel || LEVELS[0]);

    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">Create pairing</h2>
            <button class="ghost-button small" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <p class="modal-copy">${escapeHtml(entry.name)} is waiting in <strong>${escapeHtml(topic.name)}</strong>.</p>
          <form class="modal-form" data-form="pair" data-entry-id="${entry.id}">
            <label>Your name<input name="partnerName" placeholder="Your name" required /></label>
            <label>Your experience level<select name="partnerLevel">${LEVELS.map((level) => `<option value="${level}" ${level === (state.modal.partnerLevel || LEVELS[0]) ? 'selected' : ''}>${level}</option>`).join('')}</select></label>
            <p class="pairing-note">Match type: ${description}</p>
            <button class="primary-button" type="submit">Create pairing</button>
          </form>
        </div>
      </div>`;
  }

  if (state.modal.type === 'topic-panel') {
    const topics = state.data.topics.filter((topic) => topic.category === state.modal.category);
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">${state.modal.category} topics</h2>
            <button class="ghost-button small" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <div class="topic-panel-list compact-topic-list">
            ${topics
              .map((topic) => {
                const activity = topicActivity(topic.id);
                const active = activity.waiting > 0 || activity.groups > 0;
                return `
                  <div class="topic-panel-row compact-topic-row">
                    <div>
                      <strong>${escapeHtml(topic.name)}</strong>
                      <p>${activity.waiting} waiting · ${activity.groups} groups</p>
                    </div>
                    <span class="status-pill ${active ? 'active' : ''}">${active ? 'Active' : 'Idle'}</span>
                  </div>`;
              })
              .join('')}
          </div>
          <form class="inline-form" data-form="add-topic" data-category="${state.modal.category}">
            <input name="name" placeholder="Add a new topic" />
            <button class="primary-button" type="submit">Add topic</button>
          </form>
        </div>
      </div>`;
  }

  return '';
}

function renderTopicOptions() {
  return state.data.topics
    .map((topic) => `<option value="${topic.id}">${escapeHtml(topic.name)} (${topic.category})</option>`)
    .join('');
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', handleActionClick);
  });

  document.querySelectorAll('[data-form]').forEach((form) => {
    form.addEventListener('submit', handleFormSubmit);
  });

  const pairSelect = document.querySelector('[data-form="pair"] select[name="partnerLevel"]');
  if (pairSelect) {
    pairSelect.addEventListener('change', (event) => {
      state.modal.partnerLevel = event.target.value;
      render();
    });
  }
}

function handleActionClick(event) {
  const action = event.currentTarget.dataset.action;

  if (action === 'open-add') {
    state.modal = { type: 'add-self' };
    state.error = '';
    render();
    return;
  }

  if (action === 'reset') {
    resetProgramme();
    return;
  }

  if (action === 'open-topic-panel') {
    state.modal = { type: 'topic-panel', category: event.currentTarget.dataset.category };
    state.error = '';
    render();
    return;
  }

  if (action === 'switch-view') {
    state.view = event.currentTarget.dataset.view;
    render();
    return;
  }

  if (action === 'toggle-filters') {
    state.showFilters = !state.showFilters;
    render();
    return;
  }

  if (action === 'clear-filters') {
    state.topicFilters = [];
    state.levelFilters = [];
    render();
    return;
  }

  if (action === 'toggle-topic-filter') {
    state.topicFilters = toggleFilter(state.topicFilters, event.currentTarget.dataset.topicId);
    render();
    return;
  }

  if (action === 'toggle-level-filter') {
    state.levelFilters = toggleFilter(state.levelFilters, event.currentTarget.dataset.level);
    render();
    return;
  }

  if (action === 'open-pair') {
    state.modal = { type: 'pair', entryId: event.currentTarget.dataset.entryId, partnerLevel: LEVELS[0] };
    state.error = '';
    render();
    return;
  }

  if (action === 'open-join') {
    state.modal = { type: 'join-group', groupId: event.currentTarget.dataset.groupId };
    state.error = '';
    render();
    return;
  }

  if (action === 'remove-member') {
    removeMember(event.currentTarget.dataset.groupId, event.currentTarget.dataset.memberId);
    return;
  }

  if (action === 'close-modal' && event.target === event.currentTarget) {
    state.modal = null;
    state.error = '';
    render();
    return;
  }

  if (action === 'close-modal') {
    state.modal = null;
    state.error = '';
    render();
  }
}

function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const formName = form.dataset.form;

  if (formName === 'add-self') {
    addWaitingEntry({
      name: String(formData.get('name') || ''),
      topicId: String(formData.get('topicId') || ''),
      level: String(formData.get('level') || ''),
    });
    return;
  }

  if (formName === 'join-group') {
    joinGroup({
      groupId: form.dataset.groupId,
      name: String(formData.get('name') || ''),
      level: String(formData.get('level') || ''),
    });
    return;
  }

  if (formName === 'pair') {
    createPair({
      entryId: form.dataset.entryId,
      partnerName: String(formData.get('partnerName') || ''),
      partnerLevel: String(formData.get('partnerLevel') || ''),
    });
    return;
  }

  if (formName === 'add-topic') {
    addTopic({
      category: form.dataset.category,
      name: String(formData.get('name') || ''),
    });
  }
}

function toggleFilter(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function formatDateTime(value) {
  if (!value) return 'Not yet saved';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modal) {
    state.modal = null;
    state.error = '';
    render();
  }
});

window.addEventListener('focus', async () => {
  if (!storageService.shared) return;
  try {
    const remoteEnvelope = await storageService.get();
    if (remoteEnvelope && remoteEnvelope.updatedAt > state.lastUpdatedAt) {
      state.data = remoteEnvelope.data;
      state.lastUpdatedAt = remoteEnvelope.updatedAt;
      state.syncStatus = `Live for everyone · ${formatDateTime(remoteEnvelope.updatedAt)}`;
      render();
    }
  } catch (error) {
    console.error('Focus refresh failed:', error);
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function initialise() {
  render();
  state.syncMode = storageService.label;
  state.syncStatus = storageService.shared ? 'Connecting shared state…' : 'Private to this browser';
  render();

  try {
    const envelope = (await storageService.get()) || {
      updatedAt: new Date().toISOString(),
      data: createDefaultData(),
    };

    state.data = sanitiseState(envelope.data);
    state.lastUpdatedAt = envelope.updatedAt;
    state.loaded = true;
    state.loading = false;
    state.syncStatus = storageService.shared
      ? `Live for everyone · ${formatDateTime(envelope.updatedAt)}`
      : 'Private to this browser';
    render();

    if (storageService.shared) {
      storageService.startPolling((remoteEnvelope) => {
        state.data = remoteEnvelope.data;
        state.lastUpdatedAt = remoteEnvelope.updatedAt;
        state.syncStatus = `Live for everyone · ${formatDateTime(remoteEnvelope.updatedAt)}`;
        showToast('Shared programme updated.');
        render();
      });
    }
  } catch (error) {
    console.error('Initial load failed:', error);
    state.loading = false;
    state.syncStatus = 'Could not load saved data';
    state.error = 'We could not load saved data. Showing the default programme instead.';
    render();
  }
}

initialise();
