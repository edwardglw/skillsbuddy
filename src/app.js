const app = document.querySelector('#app');
const STORAGE_KEY = 'cloud-ai-buddy-programme-state';
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

function createDefaultState() {
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

const storage = {
  get() {
    if (window.storage?.get) {
      return parseStoredValue(window.storage.get(STORAGE_KEY));
    }
    return parseStoredValue(window.localStorage.getItem(STORAGE_KEY));
  },
  set(value) {
    const serialised = JSON.stringify(value);
    if (window.storage?.set) {
      window.storage.set(STORAGE_KEY, serialised);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, serialised);
  },
};

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

function getTopicById(topicId) {
  return state.data.topics.find((topic) => topic.id === topicId);
}

function getGroupType(members) {
  return new Set(members.map((member) => member.level)).size === 1 ? 'Peer' : 'Mentor / Mentee';
}

function getPairingDescription(existingLevel, joiningLevel) {
  if (existingLevel === joiningLevel) return 'Peer-to-peer';
  if (LEVELS.indexOf(joiningLevel) > LEVELS.indexOf(existingLevel)) return 'Mentor-to-mentee';
  return 'Mentee-to-mentor';
}

function sanitiseState(input) {
  const topics = sanitiseTopics(input?.topics);
  const waitingEntries = Array.isArray(input?.waitingEntries)
    ? input.waitingEntries.map((entry) => sanitiseEntry(entry, topics)).filter(Boolean)
    : [];
  const groups = Array.isArray(input?.groups)
    ? input.groups.map((group) => sanitiseGroup(group, topics)).filter(Boolean)
    : createDefaultState().groups;

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

const state = {
  data: sanitiseState(storage.get() || createDefaultState()),
  view: VIEWS.pairings,
  showFilters: false,
  topicFilters: [],
  levelFilters: [],
  modal: null,
  toast: null,
  error: '',
};

function persistAndRender(message) {
  storage.set(state.data);
  if (message) showToast(message);
  render();
}

function showToast(message) {
  state.toast = message;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2500);
}

function getAllNames() {
  const waiting = state.data.waitingEntries.map((entry) => entry.name.toLowerCase());
  const grouped = state.data.groups.flatMap((group) => group.members.map((member) => member.name.toLowerCase()));
  return new Set([...waiting, ...grouped]);
}

function addWaitingEntry(payload) {
  const name = payload.name.trim();
  if (!name || !payload.topicId || !payload.level) {
    state.error = 'Please complete every field before submitting.';
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
  persistAndRender(`${name} added to the waiting list.`);
}

function addTopic(payload) {
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
  persistAndRender(`${name} added to ${payload.category} topics.`);
}

function joinGroup(payload) {
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
  persistAndRender(`${name} joined the group.`);
}

function createPair(payload) {
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
  persistAndRender(`New pairing created for ${entry.name}.`);
}

function removeMember(groupId, memberId) {
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
  persistAndRender('Member removed and group cleanup completed.');
}

function resetProgramme() {
  state.data = sanitiseState(createDefaultState());
  state.topicFilters = [];
  state.levelFilters = [];
  state.modal = null;
  state.error = '';
  persistAndRender('Programme reset to default state.');
}

function toggleFilter(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
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

function render() {
  const topicCounts = TOPIC_CATEGORIES.reduce((counts, category) => {
    counts[category] = state.data.topics.filter((topic) => topic.category === category).length;
    return counts;
  }, {});
  const waitingByTopic = groupedWaiting();
  const groupsByTopic = groupedGroups();
  const waitingCount = Object.values(waitingByTopic).reduce((sum, entries) => sum + entries.length, 0);
  const groupCount = Object.values(groupsByTopic).reduce((sum, groups) => sum + groups.length, 0);
  const resultCount = state.view === VIEWS.waiting ? waitingCount : groupCount;

  app.innerHTML = `
    <div class="app-shell">
      ${state.toast ? `<div class="toast-stack" aria-live="polite"><div class="toast">${escapeHtml(state.toast)}</div></div>` : ''}
      <header class="hero-card">
        <div>
          <p class="eyebrow">Internal community tool</p>
          <h1>Cloud &amp; AI Buddy Programme</h1>
          <p class="hero-copy">Help colleagues discover, form, and manage buddy, peer-learning, mentor, and mentee connections around Cloud and AI topics.</p>
          <div class="hero-actions">
            <button class="primary-button" data-action="open-add">Add Myself</button>
            <button class="secondary-button" data-action="reset">Reset to default</button>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-card emphasis">
            <span class="stat-label">People waiting</span>
            <strong>${state.data.waitingEntries.length}</strong>
          </div>
          ${TOPIC_CATEGORIES.filter((category) => topicCounts[category] > 0)
            .map(
              (category) => `
                <button class="stat-card stat-button" data-action="open-topic-panel" data-category="${category}">
                  <span class="stat-label">${category} topics</span>
                  <strong>${topicCounts[category]}</strong>
                </button>`,
            )
            .join('')}
        </div>
      </header>

      <nav class="tabs" aria-label="Primary views">
        <button class="tab ${state.view === VIEWS.pairings ? 'active' : ''}" data-action="switch-view" data-view="pairings">Active Pairings</button>
        <button class="tab ${state.view === VIEWS.waiting ? 'active' : ''}" data-action="switch-view" data-view="waiting">Looking for a Buddy</button>
      </nav>

      <section class="filter-bar">
        <div class="filter-summary">
          <button class="secondary-button" data-action="toggle-filters">${state.showFilters ? 'Hide filters' : 'Show filters'}</button>
          <span>${state.topicFilters.length + state.levelFilters.length} selected</span>
          <button class="ghost-button" ${state.topicFilters.length + state.levelFilters.length === 0 ? 'disabled' : ''} data-action="clear-filters">Clear all</button>
        </div>
        <p class="filter-results">Showing ${resultCount} result(s).</p>
      </section>

      ${state.showFilters ? renderFilters() : ''}
      ${state.error ? `<div class="inline-alert">${escapeHtml(state.error)}</div>` : ''}
      <main class="content-grid">${state.view === VIEWS.waiting ? renderWaiting(waitingByTopic) : renderGroups(groupsByTopic)}</main>
      ${renderModal(waitingByTopic, groupsByTopic)}
    </div>
  `;

  bindEvents();
}

function renderFilters() {
  return `
    <section class="filters-panel">
      <div>
        <h2>Topics</h2>
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
        <h2>Experience levels</h2>
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
        <section class="topic-card">
          <div class="topic-card-header">
            <div>
              <h2>${escapeHtml(topic.name)}</h2>
              <span class="category-badge">${topic.category}</span>
            </div>
            <span class="count-pill">${entries.length} waiting</span>
          </div>
          <div class="stack-list">
            ${entries
              .map(
                (entry) => `
                  <article class="row-card">
                    <div>
                      <h3>${escapeHtml(entry.name)}</h3>
                      <span class="level-badge ${entry.level.toLowerCase()}">${entry.level}</span>
                    </div>
                    <button class="primary-button" data-action="open-pair" data-entry-id="${entry.id}">Pair directly</button>
                  </article>`,
              )
              .join('')}
          </div>
        </section>`;
    })
    .join('');

  return sections || `<section class="empty-state"><h2>No waiting users</h2><p>Add the first person to the waiting list to get the programme moving.</p></section>`;
}

function renderGroups(groupsByTopic) {
  const sections = Object.entries(groupsByTopic)
    .map(([topicId, groups]) => {
      const topic = getTopicById(topicId);
      return `
        <section class="topic-card">
          <div class="topic-card-header">
            <div>
              <h2>${escapeHtml(topic.name)}</h2>
              <span class="category-badge">${topic.category}</span>
            </div>
            <span class="count-pill">${groups.length} active group(s)</span>
          </div>
          <div class="stack-list">
            ${groups
              .map(
                (group) => `
                  <article class="group-card">
                    <div class="group-card-header">
                      <span class="group-type">${getGroupType(group.members)}</span>
                      <button class="secondary-button" data-action="open-join" data-group-id="${group.id}">Join group</button>
                    </div>
                    <div class="member-grid">
                      ${group.members
                        .map(
                          (member) => `
                            <div class="member-card">
                              <div>
                                <h3>${escapeHtml(member.name)}</h3>
                                <span class="level-badge ${member.level.toLowerCase()}">${member.level}</span>
                              </div>
                              <button class="ghost-button danger" data-action="remove-member" data-group-id="${group.id}" data-member-id="${member.id}">Remove</button>
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

  return sections || `<section class="empty-state"><h2>No active groups</h2><p>Active pairings will appear here once people start connecting.</p></section>`;
}

function renderModal(waitingByTopic, groupsByTopic) {
  if (!state.modal) return '';

  if (state.modal.type === 'add-self') {
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">Add yourself</h2>
            <button class="ghost-button" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <form class="modal-form" data-form="add-self">
            <label>Name<input name="name" placeholder="Your name" required /></label>
            <label>Topic
              <select name="topicId">${renderTopicOptions()}</select>
            </label>
            <label>Experience level
              <select name="level">${LEVELS.map((level) => `<option value="${level}">${level}</option>`).join('')}</select>
            </label>
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
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">Join an existing group</h2>
            <button class="ghost-button" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <p class="modal-copy">Join <strong>${escapeHtml(topic.name)}</strong> with ${group.members.length} existing member(s).</p>
          <form class="modal-form" data-form="join-group" data-group-id="${group.id}">
            <label>Name<input name="name" placeholder="Your name" required /></label>
            <label>Experience level
              <select name="level">${LEVELS.map((level) => `<option value="${level}">${level}</option>`).join('')}</select>
            </label>
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
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">Pair with someone waiting</h2>
            <button class="ghost-button" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <p class="modal-copy">Create a <strong>${description.toLowerCase()}</strong> connection in <strong>${escapeHtml(topic.name)}</strong> with <strong>${escapeHtml(entry.name)}</strong>.</p>
          <form class="modal-form" data-form="pair" data-entry-id="${entry.id}">
            <label>Your name<input name="partnerName" placeholder="Your name" required /></label>
            <label>Your experience level
              <select name="partnerLevel">${LEVELS.map((level) => `<option value="${level}" ${level === (state.modal.partnerLevel || LEVELS[0]) ? 'selected' : ''}>${level}</option>`).join('')}</select>
            </label>
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
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-header">
            <h2 id="modal-title">${state.modal.category} topic catalogue</h2>
            <button class="ghost-button" data-action="close-modal" aria-label="Close modal">✕</button>
          </div>
          <div class="topic-panel-list">
            ${topics
              .map((topic) => {
                const activity = topicActivity(topic.id);
                const active = activity.waiting > 0 || activity.groups > 0;
                return `
                  <div class="topic-panel-row">
                    <div>
                      <strong>${escapeHtml(topic.name)}</strong>
                      <p>${activity.waiting} waiting · ${activity.groups} group(s)</p>
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

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.modal) {
    state.modal = null;
    state.error = '';
    render();
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

render();
