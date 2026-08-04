import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { masterProfile, jobDescription, jobTitle, companyName, requirements } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `You are a world-class career strategist and technical recruiter.
Analyze the candidate's master profile against the target job posting and generate tailored application materials.

Target Role: ${jobTitle} at ${companyName}
Target Job Requirements: ${(requirements || []).join(', ')}
Target Job Description: ${jobDescription}

Candidate Profile:
- Skills: ${(masterProfile?.skills || []).join(', ')}
- Summary: ${masterProfile?.summary || ''}
- Experience: ${JSON.stringify(masterProfile?.experiences || [])}

Return raw JSON matching this structure:
{
  "matchScore": 88, // integer 0-100
  "missingSkills": ["Skill A", "Skill B"], // array of key skills in job missing from candidate
  "matchReasons": ["Strong match on React & Next.js", "Relevant Senior experience"],
  "tailoredSummary": "A concise 3-sentence executive summary customized for ${jobTitle} at ${companyName}",
  "coverLetter": "Dear Hiring Manager at ${companyName}...\n\n...",
  "suggestedBullets": [
    "Architected high-scale web platforms aligned with ${companyName}'s technological requirements",
    "Optimized API performance and state management using modern TypeScript"
  ]
}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ success: true, data: parsed });
        }
      } catch (aiErr) {
        console.error('Gemini API tailoring failed, using rule-based generator', aiErr);
      }
    }

    // Heuristic Fallback Analysis & Cover Letter Generator
    const candidateSkills = new Set((masterProfile?.skills || []).map((s: string) => s.toLowerCase()));
    const jobReqs = requirements || ['TypeScript', 'React', 'Node.js', 'System Architecture'];
    
    const matched = jobReqs.filter((req: string) => candidateSkills.has(req.toLowerCase()));
    const missing = jobReqs.filter((req: string) => !candidateSkills.has(req.toLowerCase()));
    
    const matchScore = Math.min(95, Math.max(65, Math.round((matched.length / Math.max(1, jobReqs.length)) * 100)));

    const coverLetter = `Dear Hiring Team at ${companyName},

I am writing to express my enthusiastic interest in the ${jobTitle} position. With my background building scalable web applications using ${matched.slice(0, 3).join(', ')}, I am confident in my ability to make an immediate impact on your engineering organization.

Throughout my career, I have prioritized clean architecture, performance optimization, and seamless user experiences. The opportunity at ${companyName} aligns perfectly with my technical passion for ${jobDescription ? jobDescription.slice(0, 100) + '...' : 'building high-quality products.'}

I look forward to discussing how my experience and skills will contribute to ${companyName}'s continued growth.

Best regards,
${masterProfile?.fullName || 'Alex Waris'}`;

    return NextResponse.json({
      success: true,
      data: {
        matchScore,
        missingSkills: missing.length > 0 ? missing : ['GraphQL', 'Kubernetes'],
        matchReasons: [
          `Strong overlap in core skills: ${matched.join(', ') || 'Modern Full-Stack Stack'}`,
          `Demonstrated senior leadership and system design experience`,
        ],
        tailoredSummary: `Results-driven Software Engineer with proven expertise in ${matched.slice(0, 2).join(' and ') || 'full-stack engineering'}, passionate about scaling systems at ${companyName}.`,
        coverLetter,
        suggestedBullets: [
          `Engineered high-throughput solutions using ${matched[0] || 'TypeScript'} and modern web frameworks.`,
          `Collaborated with cross-functional product teams to deliver feature releases ahead of schedule.`
        ]
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
