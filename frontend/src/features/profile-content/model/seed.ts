import type { ProfileDraft, ProfileExperience } from './profile';

/** Figma review content is an explicit local example, never an authenticated owner's API record. */
export function createProfileExample(): ProfileDraft {
  const intro = {
    firstName: 'Zheng',
    familyName: 'Lee',
    nickName: 'Wilson',
    intro: 'SOFTWARE · PLATFORMS · APPLIED AI',
    content:
      'Senior software engineer with over five years of experience designing and building Python backends and manufacturing data platforms at Delta Electronics and Foxconn. Worked on systems used in daily production across 48+ plants and 100+ production lines, including analytics supporting Apple product manufacturing.',
    eduCode: 'UCL',
    program: 'MSc Software Systems Engineering',
    footer: 'Changing the world through code, making everyday life better and easier.',
    chatTitle: 'Open to opportunities',
    chatSubtitle: 'Software · Platforms · Applied AI',
    chatContent:
      'I build backend platforms and applied AI systems. Let’s talk about software, systems and what comes next.',
    chatIcon: 'chat' as const,
  };
  const skills = [
    'Python',
    'FastAPI',
    'Django',
    'Django REST Framework',
    'gRPC',
    'MCP',
    'Celery',
    'REST APIs',
    'PostgreSQL',
    'Redis',
    'SQL',
    'Oracle',
    'MongoDB',
    'MySQL',
    'RAG',
    'Ollama',
    'XGBoost',
    'Machine learning',
    'Distributed systems',
    'Software architecture',
    'Requirements engineering',
    'Docker',
    'Linux',
    'Git',
    'CI/CD',
  ];
  const skillId = (label: string) => `skill-${skills.indexOf(label) + 1}`;
  const career = (
    key: string,
    type: 'work' | 'education',
    organization: string,
    title: string,
    city: string,
    country: string,
    startMonth: string,
    endMonth: string,
    content: string,
    labels: string[],
    latitude: string,
    longitude: string,
  ): ProfileExperience => {
    const copy = { organization, title, city, country, content, detail: '' };
    return {
      id: key,
      type,
      visible: true,
      startMonth,
      endMonth,
      endDay: '',
      expected: false,
      countryCode: country === 'China' ? 'CHN' : country === 'Taiwan' ? 'TWN' : 'GBR',
      latitude,
      longitude,
      detail: null,
      skillIds: labels.map(skillId),
      translations: { en: { ...copy }, 'zh-Hant': { ...copy }, 'zh-Hans': { ...copy } },
    };
  };
  const entries = [
    career(
      'ucl',
      'education',
      'University College London',
      'MSc Software Systems Engineering',
      'London',
      'United Kingdom',
      '2026-09',
      '2027-08',
      'A new chapter focused on software systems engineering, distributed systems and architecture. Bringing production engineering experience into advanced study at UCL.',
      ['Software architecture', 'Distributed systems', 'Requirements engineering'],
      '51.5246',
      '-0.1340',
    ),
    career(
      'publishing',
      'work',
      'The Gospel as Revealed to Me',
      'Senior Agent Platform Engineer',
      'Taoyuan',
      'Taiwan',
      '2026-04',
      '2026-09',
      'Designed an AI-assisted Bible translation and publishing workflow, combining domain-specific prompts, reviewer-approved translations and human review.',
      ['Python', 'RAG', 'FastAPI', 'Celery', 'Redis', 'Ollama'],
      '24.9937',
      '121.3010',
    ),
    career(
      'delta',
      'work',
      'Delta Electronics',
      'Senior Software Design Engineer',
      'Suzhou · Wujiang',
      'China',
      '2023-08',
      '2026-03',
      'Designed and developed manufacturing platform services, asynchronous workflows and model-training infrastructure. Connected manufacturing APIs to AI agents through MCP.',
      ['Python', 'FastAPI', 'MCP', 'gRPC', 'PostgreSQL', 'Redis', 'Celery'],
      '31.1433',
      '120.6458',
    ),
    career(
      'foxconn-chengdu',
      'work',
      'Foxconn Technology Group',
      'System Design & Data Analysis Engineer',
      'Chengdu',
      'China',
      '2021-08',
      '2023-08',
      'Worked on shared analytics platforms, data pipelines and equipment monitoring. Designed backend services and helped teams turn production data into operational insight.',
      ['Python', 'Django REST Framework', 'PostgreSQL', 'Redis', 'SQL', 'Docker', 'Linux'],
      '30.5728',
      '104.0668',
    ),
    career(
      'foxconn-shenzhen',
      'work',
      'Foxconn Technology Group',
      'Data Analysis Engineer',
      'Shenzhen',
      'China',
      '2020-08',
      '2021-07',
      'Developed manufacturing data services, reporting integrations and access controls. Built the foundations for shared analytics across factory teams.',
      ['Python', 'Django', 'SQL', 'Oracle'],
      '22.5431',
      '114.0579',
    ),
    career(
      'fju',
      'education',
      'Fu Jen Catholic University',
      'MS Information Management',
      'New Taipei',
      'Taiwan',
      '2017-09',
      '2019-07',
      'Studied machine learning and information management, with a dissertation on multiclass classification. Supported Python teaching and hands-on programming exercises.',
      ['Python', 'XGBoost', 'Machine learning'],
      '25.0338',
      '121.4322',
    ),
  ];
  entries[0]!.expected = true;
  entries[2]!.endDay = '14';
  entries[5]!.detail = { startMonth: '2017-09', endMonth: '2019-06' };
  for (const copy of Object.values(entries[5]!.translations))
    copy.detail = 'Python Instructor / Teaching Assistant';
  const names = { en: 'Backend & APIs', 'zh-Hant': 'Backend & APIs', 'zh-Hans': 'Backend & APIs' };
  const project = {
    name: 'Manufacturing Data Platform',
    title: 'PLATFORM ENGINEERING',
    intro: 'Shared manufacturing services connecting production data, analytics and applied AI.',
    workflow:
      'Collect production data, process it asynchronously and deliver reliable analytics to factory teams.',
    flow: ['Data ingestion', 'Async processing', 'APIs & analytics'],
    technical: 'Python services with FastAPI, PostgreSQL, Redis and Celery.',
    contribution:
      'Designed backend services and asynchronous workflows, improving database performance and platform reliability.',
    outcome:
      'Enabled teams to use shared production data and analytics in daily manufacturing operations.',
  };
  return {
    version: 1,
    profiles: { en: { ...intro }, 'zh-Hant': { ...intro }, 'zh-Hans': { ...intro } },
    social: {
      linkedin: 'https://linkedin.com/in/zhenglee315',
      github: 'https://github.com/zhenglee315',
      medium: 'https://medium.com/@WilsonLeee',
      email: 'zhenglee315@gmail.com',
    },
    experienceOrder: entries.map((entry) => entry.id),
    experiences: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
    projectOrder: ['manufacturing'],
    projects: {
      manufacturing: {
        id: 'manufacturing',
        experienceId: 'delta',
        visible: true,
        startMonth: '2023-08',
        endMonth: '2026-03',
        endDay: '',
        expected: false,
        skillIds: ['Python', 'FastAPI', 'PostgreSQL', 'Redis', 'Celery'].map(skillId),
        translations: {
          en: { ...project, flow: [...project.flow] },
          'zh-Hant': { ...project, flow: [...project.flow] },
          'zh-Hans': { ...project, flow: [...project.flow] },
        },
      },
    },
    categoryOrder: ['backend', 'databases', 'data-ai', 'devops'],
    categories: {
      backend: { id: 'backend', names, visible: true, skillIds: skills.slice(0, 8).map(skillId) },
      databases: {
        id: 'databases',
        names: { en: 'Databases', 'zh-Hant': 'Databases', 'zh-Hans': 'Databases' },
        visible: true,
        skillIds: skills.slice(8, 14).map(skillId),
      },
      'data-ai': {
        id: 'data-ai',
        names: { en: 'Data & AI', 'zh-Hant': 'Data & AI', 'zh-Hans': 'Data & AI' },
        visible: true,
        skillIds: skills.slice(14, 21).map(skillId),
      },
      devops: {
        id: 'devops',
        names: { en: 'DevOps & Tools', 'zh-Hant': 'DevOps & Tools', 'zh-Hans': 'DevOps & Tools' },
        visible: true,
        skillIds: skills.slice(21).map(skillId),
      },
    },
    skills: Object.fromEntries(
      skills.map((label) => [skillId(label), { id: skillId(label), label }]),
    ),
  };
}
