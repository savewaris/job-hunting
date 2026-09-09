import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { masterProfile, jobDescription, jobTitle, companyName, requirements } = await req.json();

    const prompt = `You are a world-class career strategist and technical recruiter.
Analyze the candidate's master profile against the target job posting and generate tailored application materials.

Target Role: ${jobTitle} at ${companyName}
Target Job Requirements: ${(requirements || []).join(', ')}
Target Job Description: ${jobDescription || 'Standard engineering responsibilities'}

Candidate Profile:
- Full Name: ${masterProfile?.fullName || 'Alex Waris'}
- Skills: ${(masterProfile?.skills || []).join(', ')}
- Summary: ${masterProfile?.summary || ''}
- Experience: ${JSON.stringify(masterProfile?.experiences || [])}

Return ONLY raw JSON (no markdown fences, no extra commentary) matching this exact schema:
{
  "matchScore": 88,
  "missingSkills": ["Skill A", "Skill B"],
  "matchReasons": ["Strong match on React & Next.js", "Relevant Senior experience"],
  "tailoredSummary": "A concise 3-sentence executive summary customized for ${jobTitle} at ${companyName}",
  "coverLetter": "Dear Hiring Team at ${companyName}...",
  "suggestedBullets": [
    "Architected high-scale web platforms aligned with ${companyName}'s technological requirements",
    "Optimized API performance and state management using modern TypeScript"
  ],
  "coldEmail": {
    "subject": "Senior Full Stack Engineer (Remote) — ${masterProfile?.fullName || 'Alex Waris'}",
    "recipientRole": "Hiring Team / Engineering Manager",
    "body": "Hi there,\\n\\nI've been following ${companyName}..."
  }
}`;

    let rawAiResponse: string | null = null;
    let engineUsed = 'heuristics';

    // Step 1: Attempt to use shared AI battery package if published
    for (const pkg of ['@savewaris/ai-battery', 'ai-battery']) {
      try {
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const sharedBattery = await dynamicImport(pkg);
        if (sharedBattery && typeof sharedBattery.queryAiWithFallback === 'function') {
          rawAiResponse = await sharedBattery.queryAiWithFallback(prompt);
          engineUsed = 'shared-battery-package';
          break;
        }
      } catch {
        // Shared package not yet published - graceful fallback
      }
    }

    // Step 2: Fallback to local resilient battery if shared package is not published
    if (!rawAiResponse) {
      try {
        const { queryAiWithFallback } = await import('@/lib/ai-battery');
        rawAiResponse = await queryAiWithFallback(prompt);
        engineUsed = 'local-resilient-battery';
      } catch (batteryErr: any) {
        console.warn('AI battery fallback encountered an error, activating smart heuristics:', batteryErr?.message);
      }
    }

    // Step 3: Parse AI response if available
    if (rawAiResponse) {
      try {
        const jsonMatch = rawAiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            success: true,
            engine: engineUsed,
            data: {
              matchScore: Math.min(100, Math.max(40, Number(parsed.matchScore) || 85)),
              missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : ['GraphQL', 'Kubernetes'],
              matchReasons: Array.isArray(parsed.matchReasons) ? parsed.matchReasons : [`Strong overlap in core technologies`],
              tailoredSummary: parsed.tailoredSummary || `Experienced engineer ready to contribute to ${companyName}.`,
              coverLetter: parsed.coverLetter || '',
              suggestedBullets: Array.isArray(parsed.suggestedBullets) ? parsed.suggestedBullets : [],
              coldEmail: parsed.coldEmail || null,
            },
          });
        }
      } catch (parseErr) {
        console.warn('Failed to parse AI JSON response, falling back to heuristics:', parseErr);
      }
    }

    // Step 4: Intelligent Rule-based Heuristic Fallback
    const candidateSkills = new Set((masterProfile?.skills || []).map((s: string) => s.toLowerCase()));
    const jobReqs = (requirements && requirements.length > 0)
      ? requirements
      : ['TypeScript', 'React', 'Node.js', 'System Architecture'];

    const matched = jobReqs.filter((req: string) => candidateSkills.has(req.toLowerCase()));
    const missing = jobReqs.filter((req: string) => !candidateSkills.has(req.toLowerCase()));

    const matchScore = Math.min(95, Math.max(65, Math.round((matched.length / Math.max(1, jobReqs.length)) * 100)));

    const candidateName = masterProfile?.fullName || 'Alex Waris';

    const coverLetter = `Dear Hiring Team at ${companyName},

I am writing to express my enthusiastic interest in the ${jobTitle} position. With my extensive background building scalable web applications using ${matched.slice(0, 3).join(', ') || 'modern full-stack tools'}, I am confident in my ability to make an immediate impact on your engineering organization.

Throughout my career, I have prioritized clean architecture, performance optimization, and seamless developer workflows. The opportunity at ${companyName} aligns perfectly with my passion for ${jobDescription ? jobDescription.slice(0, 120) + '...' : 'building high-quality products that scale.'}

I would welcome the opportunity to discuss how my technical expertise can accelerate ${companyName}'s roadmap.

Best regards,
${candidateName}`;

    const coldEmailBody = `Hi there,

I noticed ${companyName}'s opening for ${jobTitle} and wanted to reach out directly.

With a strong foundation in ${matched.slice(0, 3).join(', ') || 'TypeScript, Next.js, and distributed systems'}, I recently helped scale high-traffic platforms while maintaining rigorous uptime and fast Core Web Vitals. Given ${companyName}'s technical ambitions, I believe my background could add quick value to your engineering team.

Would you be open to a quick 10-minute introductory conversation this week?

Best regards,
${candidateName}
${masterProfile?.email || 'alex.waris@example.com'}`;

    return NextResponse.json({
      success: true,
      engine: 'rule-based-heuristics-fallback',
      data: {
        matchScore,
        missingSkills: missing.length > 0 ? missing : ['GraphQL', 'Kubernetes'],
        matchReasons: [
          `Strong overlap in core skills: ${matched.join(', ') || 'Modern Full-Stack Engineering'}`,
          `Demonstrated senior system architecture and engineering leadership experience`,
        ],
        tailoredSummary: `Results-driven Software Engineer with proven expertise in ${matched.slice(0, 2).join(' and ') || 'full-stack engineering'}, passionate about scaling systems at ${companyName}.`,
        coverLetter,
        suggestedBullets: [
          `Engineered high-throughput solutions using ${matched[0] || 'TypeScript'} and modern web frameworks.`,
          `Collaborated with cross-functional product teams to deliver feature releases ahead of schedule.`,
        ],
        coldEmail: {
          subject: `${jobTitle} (Remote) — ${candidateName}`,
          recipientRole: 'Engineering Manager / Recruiter',
          body: coldEmailBody,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
