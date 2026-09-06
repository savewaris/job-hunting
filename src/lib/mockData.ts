import { JobApplication, MasterProfile, Interview, JobOffer, ColdEmail } from '@/types';

export const INITIAL_APPLICATIONS: JobApplication[] = [
  {
    id: 'app-1',
    companyName: 'Stripe',
    jobTitle: 'Senior Full Stack Engineer',
    jobUrl: 'https://stripe.com/jobs/senior-fullstack',
    location: 'Remote (US/Canada)',
    jobType: 'Remote',
    salaryRange: '$180,000 - $220,000',
    status: 'interviewing',
    matchScore: 92,
    jobDescription: 'Build next-gen payment infrastructure with React, Next.js, and Node.js. High impact engineering team focused on scale and reliability.',
    requirements: ['React / Next.js', 'TypeScript', 'Node.js', 'PostgreSQL', 'System Architecture'],
    appliedDate: '2026-07-15',
    deadlineDate: '2026-08-15',
    notes: 'Recruiter screen went great. Tech screen scheduled for next Tuesday.',
    createdAt: '2026-07-15T10:00:00Z',
  },
  {
    id: 'app-2',
    companyName: 'Vercel',
    jobTitle: 'Frontend Platform Engineer',
    jobUrl: 'https://vercel.com/careers/frontend-platform',
    location: 'San Francisco, CA (Hybrid)',
    jobType: 'Hybrid',
    salaryRange: '$190,000 - $230,000',
    status: 'applied',
    matchScore: 88,
    jobDescription: 'Improve developer experience and core Next.js compiler performance. Deep expertise in React internals, Turbopack, and TypeScript.',
    requirements: ['Next.js', 'React Internals', 'Rust / SWC', 'Performance Optimization'],
    appliedDate: '2026-07-28',
    notes: 'Submitted tailored resume highlighting open-source Next.js contributions.',
    createdAt: '2026-07-28T14:30:00Z',
  },
  {
    id: 'app-3',
    companyName: 'OpenAI',
    jobTitle: 'AI Solutions Engineer',
    jobUrl: 'https://openai.com/careers/solutions-engineer',
    location: 'San Francisco, CA',
    jobType: 'Full-time',
    salaryRange: '$210,000 - $260,000',
    status: 'offer',
    matchScore: 95,
    jobDescription: 'Design AI agent workflows and help enterprise customers deploy cutting-edge frontier models.',
    requirements: ['Python / TypeScript', 'LLM APIs', 'Agent Frameworks', 'System Architecture'],
    appliedDate: '2026-07-02',
    notes: 'Received official offer letter! Negotiating base equity component.',
    createdAt: '2026-07-02T09:00:00Z',
  },
  {
    id: 'app-4',
    companyName: 'Airbnb',
    jobTitle: 'Staff Software Engineer - UI Systems',
    jobUrl: 'https://careers.airbnb.com/positions/staff-ui',
    location: 'Remote',
    jobType: 'Remote',
    salaryRange: '$220,000 - $270,000',
    status: 'wishlist',
    matchScore: 85,
    jobDescription: 'Lead architecture of design system components across web and mobile platforms.',
    requirements: ['Design Systems', 'React', 'CSS Architecture', 'Accessibility'],
    createdAt: '2026-08-01T16:00:00Z',
  },
  {
    id: 'app-5',
    companyName: 'Figma',
    jobTitle: 'Full Stack Engineer - Canvas Engine',
    jobUrl: 'https://figma.com/careers/canvas-engineer',
    location: 'San Francisco, CA',
    jobType: 'Full-time',
    salaryRange: '$185,000 - $225,000',
    status: 'rejected',
    matchScore: 78,
    jobDescription: 'Optimize real-time multiplayer rendering engine with WebAssembly and WebGL.',
    requirements: ['C++ / Rust', 'WebGL', 'Real-time Systems', 'TypeScript'],
    appliedDate: '2026-06-20',
    notes: 'Moved forward with candidate with heavier WebGL background.',
    createdAt: '2026-06-20T11:00:00Z',
  }
];

export const MOCK_MASTER_PROFILE: MasterProfile = {
  fullName: 'Alex Waris',
  email: 'alex.waris@example.com',
  targetTitle: 'Senior Full Stack & AI Engineer',
  summary: 'Experienced Full Stack Engineer with 6+ years building high-throughput web applications, AI agent systems, and cloud infrastructure using Next.js, React, TypeScript, and Python.',
  skills: [
    'React', 'Next.js', 'TypeScript', 'Node.js', 'Python', 'Tailwind CSS',
    'PostgreSQL', 'Supabase', 'Gemini AI API', 'System Architecture', 'REST & GraphQL APIs', 'Docker', 'Git'
  ],
  experiences: [
    {
      id: 'exp-1',
      company: 'TechCorp Solutions',
      role: 'Senior Frontend Engineer',
      dates: '2023 - Present',
      achievements: [
        'Architected Next.js enterprise portal handling 500k monthly active users with 99.9% uptime.',
        'Reduced core web vitals LCP by 42% through aggressive bundle optimization and SSR streaming.',
        'Mentored 5 junior developers and established automated CI/CD code quality pipelines.'
      ]
    },
    {
      id: 'exp-2',
      company: 'Innovate Labs',
      role: 'Full Stack Developer',
      dates: '2020 - 2023',
      achievements: [
        'Built real-time collaboration dashboard using Node.js, WebSockets, and PostgreSQL.',
        'Integrated OpenAI & Gemini APIs to automate report summarization, saving operations 15 hrs/week.'
      ]
    }
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'University of Computer Science',
      degree: 'B.S. in Computer Science',
      year: '2020'
    }
  ],
  projects: [
    {
      id: 'proj-1',
      name: 'AI Automation Agent Suite',
      description: 'Open-source web application for multi-agent social automation and analytics.',
      techStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'Supabase'],
      link: 'https://github.com/savewaris'
    }
  ]
};

export const MOCK_INTERVIEWS: Interview[] = [
  {
    id: 'int-1',
    jobApplicationId: 'app-1',
    companyName: 'Stripe',
    jobTitle: 'Senior Full Stack Engineer',
    roundName: 'Technical System Design',
    scheduledAt: '2026-08-08T15:00:00Z',
    interviewerNames: 'Sarah Jenkins (Engineering Manager)',
    prepNotes: 'Review payment idempotent API designs, rate limiting, and database indexing strategies.',
    status: 'scheduled'
  },
  {
    id: 'int-2',
    jobApplicationId: 'app-1',
    companyName: 'Stripe',
    jobTitle: 'Senior Full Stack Engineer',
    roundName: 'Recruiter Screen',
    scheduledAt: '2026-07-22T14:00:00Z',
    interviewerNames: 'David Miller',
    feedback: 'Very positive feedback! Passed to technical round.',
    status: 'completed'
  }
];

export const MOCK_OFFERS: JobOffer[] = [
  {
    id: 'off-1',
    jobApplicationId: 'app-3',
    companyName: 'OpenAI',
    jobTitle: 'AI Solutions Engineer',
    baseSalary: 225000,
    signingBonus: 25000,
    annualBonusPercent: 15,
    equityValue: 80000,
    benefitsScore: 9,
    remoteFlexibility: 'Hybrid (2 days remote)',
    deadline: '2026-08-18',
    status: 'negotiating'
  }
];

export const INITIAL_COLD_EMAILS: ColdEmail[] = [
  {
    id: 'email-1',
    jobApplicationId: 'app-1',
    companyName: 'Stripe',
    jobTitle: 'Senior Full Stack Engineer',
    recipientName: 'Sarah Jenkins',
    recipientRole: 'Engineering Director, Payments Core',
    recipientEmail: 'sjenkins@stripe.com',
    subject: 'Senior Full Stack Engineer (Remote) — Alex Waris',
    body: `Hi Sarah,

I've been following Stripe's developer platform advancements and was excited to see the opening for Senior Full Stack Engineer.

With 6+ years specializing in Next.js, high-throughput TypeScript backend systems, and fault-tolerant architecture, I recently architected a financial tracking platform serving 500k MAU with 99.9% uptime. Given Stripe's commitment to reliability and low-latency systems, I'd love to share how my experience directly aligns with your team's current milestones.

I've attached my tailored resume for your review. Would you be open to a brief 10-minute conversation this Thursday or Friday?

Best regards,
Alex Waris
alex.waris@example.com`,
    status: 'draft',
    createdAt: '2026-08-02T10:00:00Z',
    tailoredHighlights: ['High-throughput TypeScript', 'Next.js 99.9% uptime', 'Payment architecture overlap']
  },
  {
    id: 'email-2',
    jobApplicationId: 'app-2',
    companyName: 'Vercel',
    jobTitle: 'Frontend Platform Engineer',
    recipientName: 'Guillermo Rauch',
    recipientRole: 'CEO & Founder',
    recipientEmail: 'rauchg@vercel.com',
    subject: 'Next.js Turbopack compiler contribution & Frontend Platform inquiry',
    body: `Hi Guillermo,

Huge fan of the Next.js 15 innovations and Turbopack compiler leaps. I saw the opening on the Frontend Platform team.

Over the past four years, I've contributed to the React/Next ecosystem, reducing LCP by 42% on high-traffic production portals via streaming SSR and asset optimization. I'd love to bring this focus on developer experience and frontend performance to Vercel's core tooling.

Would love to connect with the platform team whenever convenient.

Warm regards,
Alex Waris`,
    status: 'reviewed',
    createdAt: '2026-08-03T11:30:00Z',
    tailoredHighlights: ['Turbopack & SSR streaming', '42% LCP optimization', 'Open-source contributions']
  }
];

