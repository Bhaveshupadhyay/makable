import { portfolio } from './content/portfolio.js'

// Renders the page from `content/portfolio.js`. Every element showing content
// gets `data-content="<path>"` so the builder's visual editor can find it.
// Text is set with textContent (never innerHTML), so content can't inject markup.

/** Creates an element. `attrs` with null/undefined/'' values are skipped. */
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === '') continue
    if (key === 'text') node.textContent = value
    else node.setAttribute(key, value)
  }
  node.append(...children.filter(Boolean))
  return node
}

const LINK_LABELS = { github: 'GitHub', linkedin: 'LinkedIn', x: 'X', website: 'Website' }

function sidebar({ profile, links }) {
  const contact = Object.entries(LINK_LABELS)
    .filter(([key]) => links[key])
    .map(([key, label]) => h('li', {}, h('a', { href: links[key], target: '_blank', rel: 'noreferrer', text: label })))

  return h(
    'aside',
    { class: 'sidebar' },
    profile.avatarUrl && h('img', { class: 'avatar', src: profile.avatarUrl, alt: profile.name }),
    h('h1', { 'data-content': 'profile.name', text: profile.name }),
    h('p', { class: 'headline', 'data-content': 'profile.headline', text: profile.headline }),
    profile.location && h('p', { class: 'muted', 'data-content': 'profile.location', text: profile.location }),
    links.email &&
      h('a', { class: 'email', href: `mailto:${links.email}`, 'data-content': 'links.email', text: links.email }),
    contact.length > 0 && h('ul', { class: 'links' }, ...contact),
  )
}

function section(id, title, ...children) {
  return h('section', { id }, h('h2', { text: title }), ...children)
}

function content({ profile, skills, projects }) {
  return h(
    'main',
    { class: 'content' },
    profile.bio && section('about', 'About', h('p', { class: 'bio', 'data-content': 'profile.bio', text: profile.bio })),
    skills.length > 0 &&
      section(
        'skills',
        'Skills',
        h('ul', { class: 'skills' }, ...skills.map((skill, i) => h('li', { 'data-content': `skills.${i}`, text: skill }))),
      ),
    projects.length > 0 &&
      section(
        'projects',
        'Projects',
        h(
          'ol',
          { class: 'projects' },
          ...projects.map((project, i) =>
            h(
              'li',
              {},
              h(
                'a',
                { href: project.repoUrl, target: '_blank', rel: 'noreferrer' },
                h('h3', { 'data-content': `projects.${i}.name`, text: project.name }),
              ),
              h('p', { 'data-content': `projects.${i}.description`, text: project.description }),
              h(
                'p',
                { class: 'meta' },
                project.language && h('span', { text: project.language }),
                h('span', { text: `★ ${project.stars}` }),
                project.homepageUrl &&
                  h('a', { href: project.homepageUrl, target: '_blank', rel: 'noreferrer', text: 'Live ↗' }),
              ),
            ),
          ),
        ),
      ),
  )
}

document.title = portfolio.profile.name
document.getElementById('app').replaceChildren(h('div', { class: 'page' }, sidebar(portfolio), content(portfolio)))
