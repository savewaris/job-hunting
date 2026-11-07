import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCandidateContact, getMasterProfile } from '@/domain/profile';
import type { MasterProfile, Project } from '@/types/profile';

export interface CoverLetterContext {
  companyName: string;
  jobTitle: string;
  jobDescription?: string | null;
  requirements?: string[] | null;
  location?: string | null;
  currentDraft?: string | null;
  refineInstruction?: string | null;
}

export interface CoverLetterResult {
  letter: string;
  usedAi: boolean;
  embeddedLinks: {
    website: string;
    github: string;
    linkedin: string;
  };
}

function cleanBullet(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^[-*•]\s*/gm, '')
    .split('\n')[0]
    .trim();
}

function selectRelevantProjects(
  profile: MasterProfile,
  jobTitle: string,
  jobDescription?: string | null,
  requirements?: string[] | null,
): Project[] {
  const haystack = `${jobTitle} ${jobDescription ?? ''} ${(requirements ?? []).join(' ')}`.toLowerCase();
  const scored = profile.projects.map((p, idx) => {
    const tokens = `${p.title} ${p.tags ?? ''} ${p.description}`
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length >= 3);
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 1;
    }
    return { project: p, score, idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.slice(0, 2).map((s) => s.project);
}

/**
 * Deterministic, truth-checked cover letter builder grounded strictly in
 * `src/domain/profile/master-profile.json` with embedded Personal Website and
 * GitHub links. Used both as the initial template and as a fallback if no AI
 * key is configured.
 */
export function buildMasterProfileCoverLetter(ctx: CoverLetterContext): string {
  const profile = getMasterProfile();
  const contact = getCandidateContact();
  const edu = profile.education[0];
  const exp = profile.experiences[0];
  const topProjects = selectRelevantProjects(
    profile,
    ctx.jobTitle,
    ctx.jobDescription,
    ctx.requirements,
  );

  const prioritySkills = [
    'TypeScript',
    'Next.js',
    'React',
    'Node.js',
    'Python',
    'PostgreSQL',
    'Prisma ORM',
    'Tailwind CSS',
  ].filter((s) => profile.skills.includes(s));
  const coreSkills = (prioritySkills.length >= 4 ? prioritySkills : profile.skills.slice(0, 8)).join(', ');
  const eduClause = edu
    ? `a ${edu.degree} in ${edu.fieldOfStudy} from ${edu.institution} (${edu.startDate}–${edu.endDate || 'Present'})`
    : 'a strong foundation in software and database engineering';

  const expClause = exp
    ? `During my ${exp.role} at ${exp.company} (${exp.location || 'Bangkok'}), I analyzed large-scale datasets using SQL and Python and delivered actionable insights for strategic decision-making.`
    : '';

  const projectLines = topProjects
    .map((p) => {
      const summary = cleanBullet(p.description);
      const links = [
        p.demoUrl ? `Live Demo: ${p.demoUrl}` : null,
        p.repoUrl ? `GitHub: ${p.repoUrl}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      return `• ${p.title}: ${summary}${links ? ` (${links})` : ''}`;
    })
    .join('\n');

  const instructionNote = ctx.refineInstruction?.trim()
    ? `\n${ctx.refineInstruction.trim()}\n`
    : '';

  return [
    `Dear Hiring Team at ${ctx.companyName},`,
    '',
    `I am writing to apply for the ${ctx.jobTitle} role at ${ctx.companyName}. As a ${profile.headline} based in ${contact.location} with ${eduClause}, I build production full-stack web platforms, autonomous AI agent workflows, and data pipelines using ${coreSkills}.`,
    '',
    expClause ? `${expClause} Some of my recent engineering projects include:` : 'Some of my recent engineering projects include:',
    projectLines,
    instructionNote ? instructionNote.trim() : null,
    `You can explore my full portfolio, live interactive demos, and source code on my Personal Website (${contact.website}) and GitHub (${contact.github}).`,
    '',
    `Thank you for your time and consideration. I would welcome the opportunity to discuss how my background fits the ${ctx.jobTitle} role at ${ctx.companyName}.`,
    '',
    'Kind regards,',
    `${contact.fullName} (${contact.preferredName})`,
    `Email: ${contact.email} | Phone: ${contact.phone}`,
    `Portfolio: ${contact.website}`,
    `GitHub: ${contact.github}`,
    contact.linkedin ? `LinkedIn: ${contact.linkedin}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/**
 * Ensures the cover letter always embeds the candidate's Personal Website and
 * GitHub URLs from the Master Profile, appending a signature block if the AI
 * omitted either URL.
 */
export function ensureMasterProfileLinks(text: string): string {
  const contact = getCandidateContact();
  let result = text.trim();
  const missingWebsite = contact.website && !result.includes(contact.website);
  const missingGithub = contact.github && !result.includes(contact.github);

  if (missingWebsite || missingGithub) {
    const appendix = [
      '',
      missingWebsite ? `Portfolio: ${contact.website}` : null,
      missingGithub ? `GitHub: ${contact.github}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
    result = `${result}\n${appendix}`;
  }
  return result;
}

export async function generateMasterProfileCoverLetter(
  ctx: CoverLetterContext,
): Promise<CoverLetterResult> {
  const profile = getMasterProfile();
  const contact = getCandidateContact();
  const embeddedLinks = {
    website: contact.website,
    github: contact.github,
    linkedin: contact.linkedin,
  };

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) {
    return {
      letter: buildMasterProfileCoverLetter(ctx),
      usedAi: false,
      embeddedLinks,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const projectsPrompt = profile.projects
      .map(
        (p) =>
          `- ${p.title} (${p.tags ?? ''}): ${cleanBullet(p.description)} | Demo: ${p.demoUrl ?? 'N/A'} | Repo: ${p.repoUrl ?? 'N/A'}`,
      )
      .join('\n');

    const experiencesPrompt = profile.experiences
      .map(
        (e) =>
          `- ${e.role} at ${e.company} (${e.startDate} to ${e.endDate ?? 'Present'}, ${e.location ?? ''}): ${e.description}`,
      )
      .join('\n');

    const educationPrompt = profile.education
      .map((ed) => `- ${ed.degree} in ${ed.fieldOfStudy}, ${ed.institution} (${ed.startDate}–${ed.endDate})`)
      .join('\n');

    const prompt = `You are drafting or refining a truthful, grounded cover letter for a candidate using ONLY the Master Profile facts below.

MASTER PROFILE (SINGLE SOURCE OF TRUTH — DO NOT INVENT ANY EMPLOYER, DEGREE, SKILL, METRIC OR DATE):
- Full Name: ${contact.fullName} (${contact.preferredName})
- Headline: ${profile.headline}
- Location: ${contact.location}
- Email: ${contact.email}
- Phone: ${contact.phone}
- Personal Website / Portfolio URL: ${contact.website}
- GitHub URL: ${contact.github}
- LinkedIn URL: ${contact.linkedin}
- Summary: ${profile.summary}
- Technical Skills: ${profile.skills.join(', ')}
- Education:
${educationPrompt}
- Work Experience:
${experiencesPrompt}
- Verified Portfolio Projects:
${projectsPrompt}

TARGET JOB:
- Company: ${ctx.companyName}
- Role: ${ctx.jobTitle}
- Location: ${ctx.location ?? 'Not specified'}
- Job Description: ${ctx.jobDescription ?? 'Not specified'}
- Requirements: ${(ctx.requirements ?? []).join(', ') || 'Not specified'}

${ctx.currentDraft ? `CURRENT DRAFT TO REFINE:\n${ctx.currentDraft}\n` : ''}
${ctx.refineInstruction ? `USER REFINEMENT INSTRUCTION:\n${ctx.refineInstruction}\n` : ''}

STRICT REQUIREMENTS:
1. Reference concrete facts from the Master Profile: Mahidol University B.Sc. in Database & Intelligence Systems, GISTDA Data Analyst Internship, relevant portfolio projects (such as Personal Planner, Agent Second Brain, or Hexagonal Architecture), and real technical skills.
2. Explicitly embed the full Personal Website link (${contact.website}) and GitHub link (${contact.github}) inside the letter and/or sign-off so the employer can click them directly.
3. Keep the tone natural, confident, and concise (around 160–220 words unless the user instruction asks otherwise).
4. Output ONLY the cover letter text (no markdown code fences or commentary).`;

    const response = await model.generateContent(prompt);
    const text = response.response.text().trim();
    if (!text) {
      return {
        letter: buildMasterProfileCoverLetter(ctx),
        usedAi: false,
        embeddedLinks,
      };
    }
    return {
      letter: ensureMasterProfileLinks(text),
      usedAi: true,
      embeddedLinks,
    };
  } catch {
    return {
      letter: buildMasterProfileCoverLetter(ctx),
      usedAi: false,
      embeddedLinks,
    };
  }
}
