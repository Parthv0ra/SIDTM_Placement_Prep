import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Parse resume from storage ----------
export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resumeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: resume, error } = await supabase
      .from("resumes").select("*").eq("id", data.resumeId).single();
    if (error || !resume) throw new Error("Resume not found");
    if (resume.user_id !== userId) throw new Error("Forbidden");

    const { data: file, error: dl } = await supabase.storage
      .from("resumes").download(resume.file_path);
    if (dl || !file) throw new Error(`Download failed: ${dl?.message}`);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const base64 = btoa(bin);

    const { chatWithFile } = await import("./ai-gateway.server");
    const parsed = await chatWithFile<{
      full_name?: string; email?: string; phone?: string;
      skills: string[]; projects: Array<{ name: string; description: string }>;
      education: Array<{ degree: string; institution: string; year?: string }>;
      experience: Array<{ title: string; company: string; duration?: string; description?: string }>;
      certifications?: string[];
      quality_score: number;
      suggestions: string[];
      summary: string;
    }>({
      system:
        "You are an expert resume reviewer. Extract structured info from the attached resume and evaluate quality on a 0-100 scale based on clarity, quantified achievements (especially checking if accomplishments are quantified with metrics/numbers), relevance, and completeness. Dock the quality score significantly (e.g., -5 points per unquantified item) for achievements lacking numbers/percentages. Respond ONLY with JSON matching the schema.",
      prompt:
        `Extract fields as JSON with keys: full_name, email, phone, skills (string[]), projects [{name,description}], education [{degree,institution,year}], experience [{title,company,duration,description}], certifications (string[] of professional certs like AWS, ITIL, etc. if any), quality_score (0-100 int), suggestions (string[] containing 4-6 highly specific, actionable recommendations on how to improve this resume's details, layout, or content to increase the quality/ATS score to at least 90/100; explicitly list unquantified points), summary (2-3 sentences).`,
      filename: resume.file_name,
      mime: resume.file_name.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64,
    });

    await supabase.from("resumes").update({
      parsed,
      raw_text: parsed.summary,
      quality_score: parsed.quality_score,
      suggestions: parsed.suggestions,
    }).eq("id", resume.id);

    return parsed;
  });

// ---------- Parse pasted resume text ----------
export const parsePastedResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      resumeId: z.string().uuid(),
      rawText: z.string().min(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: resume, error } = await supabase
      .from("resumes").select("*").eq("id", data.resumeId).single();
    if (error || !resume) throw new Error("Resume not found");
    if (resume.user_id !== userId) throw new Error("Forbidden");

    const { chatJSON } = await import("./ai-gateway.server");
    const parsed = await chatJSON<{
      full_name?: string; email?: string; phone?: string;
      skills: string[]; projects: Array<{ name: string; description: string }>;
      education: Array<{ degree: string; institution: string; year?: string }>;
      experience: Array<{ title: string; company: string; duration?: string; description?: string }>;
      certifications?: string[];
      quality_score: number;
      suggestions: string[];
      summary: string;
    }>({
      system:
        "You are an expert resume reviewer. Extract structured info from the provided resume text and evaluate quality on a 0-100 scale based on clarity, quantified achievements (especially checking if accomplishments are quantified with metrics/numbers), relevance, and completeness. Dock the quality score significantly (e.g., -5 points per unquantified item) for achievements lacking numbers/percentages. Respond ONLY with JSON matching the schema.",
      messages: [{
        role: "user",
        content: `Resume text:\n"""\n${data.rawText}\n"""\n\nExtract fields as JSON with keys: full_name, email, phone, skills (string[]), projects [{name,description}], education [{degree,institution,year}], experience [{title,company,duration,description}], certifications (string[] of professional certs like AWS, ITIL, etc. if any), quality_score (0-100 int), suggestions (string[] containing 4-6 highly specific, actionable recommendations on how to improve this resume's details, layout, or content to increase the quality/ATS score to at least 90/100; explicitly list unquantified points), summary (2-3 sentences).`
      }],
    });

    await supabase.from("resumes").update({
      parsed,
      raw_text: data.rawText,
      quality_score: parsed.quality_score,
      suggestions: parsed.suggestions,
    }).eq("id", resume.id);

    return parsed;
  });

// ---------- Parse job description file ----------
export const parseJdFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      base64: z.string(),
      mime: z.string(),
      filename: z.string(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { chatWithFile } = await import("./ai-gateway.server");
    const parsed = await chatWithFile<{ text: string }>({
      system:
        "You are an expert recruiter. Extract the full plain text of the job description from the attached file. Return JSON matching the schema.",
      prompt:
        "Extract the job description text and return it as JSON with the key 'text'. Keep formatting clean and readable.",
      filename: data.filename,
      mime: data.mime,
      base64: data.base64,
    });
    return parsed;
  });

// ---------- Analyze JD vs resume + generate questions ----------
export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      resumeId: z.string().uuid(),
      jdText: z.string().min(30),
      company: z.string().min(1),
      role: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: resume } = await supabase
      .from("resumes").select("*").eq("id", data.resumeId).single();
    if (!resume) throw new Error("Resume missing");

    // Create JD
    const { data: jd, error: jdErr } = await supabase
      .from("job_descriptions")
      .insert({ user_id: userId, company: data.company, role: data.role, raw_text: data.jdText })
      .select().single();
    if (jdErr || !jd) throw new Error(jdErr?.message ?? "JD insert failed");

    const { chatJSON } = await import("./ai-gateway.server");

    const resumeParsed = (resume.parsed as any) || {};
    const certs = resumeParsed.certifications || [];
    let certPrompt = "";
    if (certs.length > 0) {
      certPrompt = `\n\nActive certification list: ${JSON.stringify(certs)}. Since the candidate lists professional certifications, you MUST run a Certification Viva Mode for the 2 resume-specific questions. Make these 2 questions deeply test claimed certification concepts to check their actual knowledge depth.`;
    }

    // Seed with real past questions
    let seedPrompt = "";
    try {
      const qBank = await import("./question-bank.json");
      const getRandomElement = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
      const seedHr = qBank.hr && qBank.hr.length > 0 ? getRandomElement(qBank.hr) : "";
      const seedTech = qBank.technical && qBank.technical.length > 0 ? getRandomElement(qBank.technical) : "";
      const seedTelecom = qBank.telecom && qBank.telecom.length > 0 ? getRandomElement(qBank.telecom) : "";

      if (seedHr || seedTech || seedTelecom) {
        seedPrompt = `\n\nYou MUST seed the interview by incorporating the following real past questions (adjusting details to match context if needed, but retaining their core concepts):
${seedTech ? `- Technical question: "${seedTech}"\n` : ""}${seedHr ? `- Behavioral question: "${seedHr}"\n` : ""}${seedTelecom ? `- Role-specific / Telecom question: "${seedTelecom}"\n` : ""}`;
      }
    } catch (e) {
      console.warn("Failed to load question bank for seeding:", e);
    }

    const analysis = await chatJSON<{
      match_score: number;
      matched_skills: string[];
      missing_skills: string[];
      keywords: string[];
      gap_analysis: string;
      questions: Array<{ text: string; category: "technical" | "behavioral" | "role-specific" | "resume-specific"; time_limit_sec: number }>;
    }>({
      system:
        "You are a senior placement coach. Given a resume and target job description (JD) within a specific Domain, produce a match analysis and a personalized set of 6 interview questions (mix of technical, behavioral (STAR), role-specific, and resume-specific). Return JSON only.",
      messages: [{
        role: "user",
        content: `Target Domain: ${data.company}\nRole: ${data.role}\n\nResume (parsed JSON):\n${JSON.stringify(resume.parsed ?? {}, null, 2)}\n\nJob Description:\n${data.jdText}\n\nReturn JSON: { match_score:0-100 int, matched_skills:string[], missing_skills:string[], keywords:string[], gap_analysis: string (2-3 sentences), questions:[6 items with keys text, category (one of technical|behavioral|role-specific|resume-specific), time_limit_sec (60-180)] }. Note: The questions array MUST have a total of 6 questions: 2 technical, 1 behavioral, 1 role-specific, and 2 resume-specific questions that ask directly about details in their projects, experience, or achievements listed in their resume parsed JSON.${certPrompt}${seedPrompt}`,
      }],
    });

    await supabase.from("job_descriptions")
      .update({ keywords: analysis.keywords }).eq("id", jd.id);

    const { data: session, error: sErr } = await supabase.from("interview_sessions").insert({
      user_id: userId,
      resume_id: resume.id,
      jd_id: jd.id,
      company: data.company,
      role: data.role,
      status: "ready",
      match_score: analysis.match_score,
      gap_analysis: {
        matched_skills: analysis.matched_skills,
        missing_skills: analysis.missing_skills,
        summary: analysis.gap_analysis,
      },
    }).select().single();
    if (sErr || !session) throw new Error(sErr?.message ?? "Session insert failed");

    const qRows = analysis.questions.slice(0, 8).map((q, i) => ({
      session_id: session.id,
      question_text: q.text,
      category: q.category,
      order_index: i,
      time_limit_sec: Math.min(180, Math.max(45, q.time_limit_sec || 120)),
    }));
    const { error: qErr } = await supabase.from("questions").insert(qRows);
    if (qErr) throw new Error(qErr.message);

    return { sessionId: session.id };
  });

// ---------- Score a single response (transcribe + score) ----------
export const scoreResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      responseId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: resp } = await supabase.from("responses").select("*").eq("id", data.responseId).single();
    if (!resp || resp.user_id !== userId) throw new Error("Response not found");

    let transcript = resp.transcript || "";

    if (resp.recording_path && !transcript) {
      const { data: file } = await supabase.storage.from("recordings").download(resp.recording_path);
      if (!file) throw new Error("Recording download failed");
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const base64 = btoa(bin);
      const mime = file.type || "audio/webm";

      const { transcribeAudio } = await import("./ai-gateway.server");
      transcript = await transcribeAudio(base64, mime);
    }

    const { chatJSON } = await import("./ai-gateway.server");

    const { data: q } = await supabase.from("questions").select("*").eq("id", resp.question_id).single();
    const { data: session } = await supabase.from("interview_sessions").select("*, resumes(parsed), job_descriptions(raw_text)").eq("id", resp.session_id).single();

    const { default: casebooks } = await import("./casebook.json");
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const casebookItem = session?.role ? casebooks.find((c: any) => normalize(c.title) === normalize(session.role)) : null;

    const isGuesstimate = q?.category === "guesstimate";
    const isBehavioral = q?.category === "behavioral";

    let promptSystem = "";
    let promptUser = "";

    if (isGuesstimate) {
      const casebookHelp = casebookItem ? `\n\nOfficial Casebook Reference Solution:\n"""${casebookItem.solution_approach}"""` : "";
      promptSystem = "You are an expert consultant and interviewer scoring a Guesstimate / Case response on multiple dimensions (0-100 integers). Evaluate how logically they structured their formula, how explicit their driver assumptions are, and if they performed a sanity check on the final number. Return JSON only.";
      promptUser = `Guesstimate Case: ${q?.question_text}${casebookHelp}\n\nStudent Scratchpad Solution:\n"""${transcript}"""\n\nReturn JSON with integer 0-100 scores: driver_breakdown, assumptions, sanity_check, overall_logic, structure, technical_accuracy, feedback (2-3 sentences of actionable feedback comparing their drivers, assumptions, and math directly to the official casebook solution).`;
    } else if (isBehavioral) {
      promptSystem = "You are an expert interviewer scoring a behavioral interview response. Specifically analyze the candidate's transcript for the STAR framework structure signature (Situation, Task, Action, Result) and professional vocabulary. Return JSON only.";
      promptUser = `Target Domain: ${session?.company} — Role: ${session?.role}\nQuestion: ${q?.question_text}\nDuration: ${resp.duration_sec ?? "?"}s\n\nCandidate transcript:\n"""${transcript}"""\n\nReturn JSON: {
        relevance: 0-100,
        domain_framework_knowledge: 0-100,
        general_technical_accuracy: 0-100,
        communication: 0-100,
        fluency: 0-100,
        confidence: 0-100,
        structure: 0-100,
        star_structure: { situation: boolean, task: boolean, action: boolean, result: boolean },
        star_feedback: string,
        vocab_nudges: [ { generic: string, professional: string, explanation: string } ],
        feedback: string
      }`;
    } else {
      promptSystem = "You are an expert interviewer scoring a technical or role-specific interview response. Specifically evaluate domain framework depth (eTOM, ITIL, BSS/OSS, Cloud, etc. where applicable) and general technical correctness. Return JSON only.";
      promptUser = `Target Domain: ${session?.company} — Role: ${session?.role}\nCategory: ${q?.category}\nQuestion: ${q?.question_text}\nDuration: ${resp.duration_sec ?? "?"}s\n\nCandidate transcript:\n"""${transcript}"""\n\nReturn JSON: {
        relevance: 0-100,
        domain_framework_knowledge: 0-100 (rate specifically on awareness of eTOM, ITIL, SD-WAN, BSS/OSS, etc. relevant to target domain),
        general_technical_accuracy: 0-100,
        communication: 0-100,
        fluency: 0-100,
        confidence: 0-100,
        structure: 0-100,
        vocab_nudges: [ { generic: string, professional: string, explanation: string } ],
        feedback: string
      }`;
    }

    const scores = await chatJSON<any>({
      system: promptSystem,
      messages: [{ role: "user", content: promptUser }],
    });

    await supabase.from("responses").update({ transcript, scores }).eq("id", resp.id);
    return { transcript, scores };
  });

// ---------- Build final scorecard for a session ----------
export const finalizeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session } = await supabase.from("interview_sessions").select("*").eq("id", data.sessionId).single();
    if (!session || session.user_id !== userId) throw new Error("Session not found");

    const { data: responses } = await supabase.from("responses")
      .select("*, questions(question_text,category)")
      .eq("session_id", data.sessionId);

    const count = responses?.length || 1;
    const { chatJSON } = await import("./ai-gateway.server");
    const isGuesstimate = session.company === "Guesstimate";

    let overall = 0;
    let category_scores: any = {};

    if (isGuesstimate) {
      const driver = responses!.reduce((acc, r) => acc + ((r.scores as any)?.driver_breakdown ?? 0), 0) / count;
      const assumptions = responses!.reduce((acc, r) => acc + ((r.scores as any)?.assumptions ?? 0), 0) / count;
      const sanity = responses!.reduce((acc, r) => acc + ((r.scores as any)?.sanity_check ?? 0), 0) / count;
      const overall_logic = responses!.reduce((acc, r) => acc + ((r.scores as any)?.overall_logic ?? 0), 0) / count;
      const struct = responses!.reduce((acc, r) => acc + ((r.scores as any)?.structure ?? 0), 0) / count;
      const tech = responses!.reduce((acc, r) => acc + ((r.scores as any)?.technical_accuracy ?? 0), 0) / count;

      overall = Math.round((driver + assumptions + sanity + overall_logic + struct + tech) / 6);
      category_scores = { driver_breakdown: driver, assumptions, sanity_check: sanity, overall_logic, structure: struct, technical_accuracy: tech };
    } else {
      const cats = ["relevance", "domain_framework_knowledge", "general_technical_accuracy", "communication", "fluency", "confidence", "structure"] as const;
      const scores: Record<string, number> = {};
      for (const c of cats) {
        const vals = (responses ?? []).map((r) => {
          if (c === "domain_framework_knowledge" || c === "general_technical_accuracy") {
            return (r.scores as any)?.[c] ?? (r.scores as any)?.technical_accuracy ?? 0;
          }
          return (r.scores as Record<string, number> | null)?.[c];
        }).filter((v): v is number => typeof v === "number");
        scores[c] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
      }
      category_scores = scores;
      overall = Math.round(Object.values(category_scores).reduce((a, b) => a + b, 0) / cats.length);
    }

    let summary: any = {};
    if (isGuesstimate) {
      const { default: casebooks } = await import("./casebook.json");
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const casebookItem = session.role ? casebooks.find((c: any) => normalize(c.title) === normalize(session.role)) : null;
      const solutionKeyText = casebookItem ? `\n\nOfficial Casebook Reference Solution:\n"""${casebookItem.solution_approach}"""` : "";

      summary = await chatJSON<{ strengths: string[]; recommendations: string[]; guesstimate_ideal_approach: string; guesstimate_expected_value: string }>({
        system: "You are a senior placement coach and management consultant summarizing a Guesstimate case practice. Return JSON only.",
        messages: [{
          role: "user",
          content: `Target: ${session.role}\nQuestion: ${(responses ?? [])[0]?.questions?.question_text}\nStudent Response:\n${(responses ?? [])[0]?.transcript ?? ""}\nStudent Scores: ${JSON.stringify(category_scores)}${solutionKeyText}\n\nReturn JSON: {
            strengths: string[2-3],
            recommendations: string[2-3],
            guesstimate_ideal_approach: string (summarize the official casebook's recommended formula, drivers, and calculations for this case),
            guesstimate_expected_value: string (the actual final numerical value or range as documented in the casebook solution)
          }`
        }]
      });
    } else {
      summary = await chatJSON<{ strengths: string[]; improvements: string[]; recommendations: string[] }>({
        system: "You are a placement coach summarizing an interview session. Return JSON only.",
        messages: [{
          role: "user",
          content: `Target Domain: ${session.company} — Role: ${session.role}\nCategory scores: ${JSON.stringify(category_scores)}\n\nResponses:\n${(responses ?? []).map((r) => `Q(${(r as any).questions?.category}): ${(r as any).questions?.question_text}\nA: ${r.transcript ?? ""}\nScores: ${JSON.stringify(r.scores)}`).join("\n\n")}\n\nReturn JSON: { strengths: string[3-5], improvements: string[3-5], recommendations: string[3-5] }`,
        }],
      });
    }

    const { data: card, error } = await supabase.from("scorecards").upsert({
      session_id: session.id,
      user_id: userId,
      overall_score: overall,
      category_scores,
      strengths: summary.strengths,
      improvements: isGuesstimate ? {
        guesstimate_ideal_approach: summary.guesstimate_ideal_approach,
        guesstimate_expected_value: summary.guesstimate_expected_value
      } as any : summary.improvements,
      recommendations: summary.recommendations,
    }, { onConflict: "session_id" }).select().single();
    if (error) throw new Error(error.message);

    await supabase.from("interview_sessions").update({
      status: "completed", completed_at: new Date().toISOString(),
    }).eq("id", session.id);

    return card;
  });

export const startGuesstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      questionText: z.string().min(10),
      title: z.string().min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Create a placeholder JD
    const { data: jd, error: jdErr } = await supabase
      .from("job_descriptions")
      .insert({
        user_id: userId,
        company: "Guesstimate",
        role: data.title,
        raw_text: data.questionText
      })
      .select().single();

    if (jdErr || !jd) throw new Error(jdErr?.message ?? "JD insert failed");

    // 2. Create interview session
    const { data: session, error: sErr } = await supabase.from("interview_sessions").insert({
      user_id: userId,
      company: "Guesstimate",
      role: data.title,
      jd_id: jd.id,
      status: "pending",
    }).select().single();

    if (sErr || !session) throw new Error(sErr?.message ?? "Session insert failed");

    // 3. Create the single question
    const { error: qErr } = await supabase.from("questions").insert({
      session_id: session.id,
      question_text: data.questionText,
      category: "guesstimate",
      order_index: 0,
      time_limit_sec: 600, // 10 minutes limit
    });

    if (qErr) throw new Error(qErr.message);

    return { sessionId: session.id };
  });

export const getScorecardData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Fetch user roles using user's client
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isStaff = roles?.some((r) => r.role === "admin" || r.role === "faculty") ?? false;

    // 2. Fetch the session (using supabaseAdmin to bypass RLS)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin.from("interview_sessions").select("*").eq("id", data.sessionId).single();

    if (!session) throw new Error("Session not found");

    // 3. Security check: User must own the session or be an admin/faculty staff member!
    if (session.user_id !== userId && !isStaff) {
      throw new Error("Unauthorized access to this report");
    }

    // 4. Query all scorecard data as admin (to bypass any local RLS issues for the staff member)
    const [{ data: card }, { data: responses }, { data: questions }] = await Promise.all([
      supabaseAdmin.from("scorecards").select("*").eq("session_id", data.sessionId).maybeSingle(),
      supabaseAdmin.from("responses").select("*").eq("session_id", data.sessionId),
      supabaseAdmin.from("questions").select("*").eq("session_id", data.sessionId).order("order_index"),
    ]);

    // Look up matching casebook item for the reference solution
    const { default: casebooks } = await import("./casebook.json");
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const casebookItem = session.role ? casebooks.find((c: any) => normalize(c.title) === normalize(session.role)) : null;

    return {
      session,
      card: card || null,
      responses: responses ?? [],
      questions: questions ?? [],
      referenceSolution: casebookItem ? {
        title: casebookItem.title,
        category: casebookItem.category,
        domain: casebookItem.domain,
        solution_approach: casebookItem.solution_approach,
        full_text: casebookItem.full_text
      } : null
    };
  });

export const getAdminDashboardData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // 1. Fetch user roles using user's client
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isStaff = roles?.some((r) => r.role === "admin" || r.role === "faculty") ?? false;

    if (!isStaff) {
      return { isStaff: false, sessions: [], scorecards: [] };
    }

    // 2. Fetch all sessions, profiles, and scorecards as admin (bypassing RLS)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: sessions }, { data: profiles }, { data: scorecards }] = await Promise.all([
      supabaseAdmin.from("interview_sessions").select("*").order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
      supabaseAdmin.from("scorecards").select("*"),
    ]);

    const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    const enrichedSessions = sessions?.map((s) => ({
      ...s,
      profiles: profileMap.get(s.user_id) || null
    })) ?? [];

    return {
      isStaff: true,
      sessions: enrichedSessions,
      scorecards: scorecards ?? []
    };
  });

export const evaluateShortlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      resumeId: z.string().uuid(),
      domain: z.string(),
      role: z.string(),
      jdText: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Fetch the resume
    const { data: resume, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("id", data.resumeId)
      .single();

    if (error || !resume) throw new Error("Resume not found");
    if (resume.user_id !== userId) throw new Error("Forbidden");

    // 2. Call Groq via chatJSON
    const { chatJSON } = await import("./ai-gateway.server");

    const resumeParsed = (resume.parsed as any) || {};

    const systemPrompt = `You are a senior placement coordinator and ATS specialist. Your task is to evaluate a candidate's resume for a target Domain and Role against a specific Job Description (JD).
You must return a JSON object with:
1. shortlist_score (0-100 integer representing candidate's overall readiness/probability of getting shortlisted for this job description).
2. status (string: 'shortlisted' if score >= 80, 'borderline' if 60-79, 'not_shortlisted' if < 60).
3. evaluation_verdict (string, 3-4 sentences of detailed evaluation reasoning on how well their experience, credentials, and skills match this specific job description, and if they are a strong fit).
4. matched_skills (array of strings representing skills present in the resume that align well with target role and JD).
5. missing_skills (array of strings representing critical keywords or skills from the JD that are missing or weak in the resume).
6. suggested_certifications (array of strings, 3-4 professional certs like AWS, CFA, PMP, ITIL, CSM, etc. that would boost shortlising for this specific role).
7. suggested_courses (array of strings, 3-4 college curriculum or online courses to bridge gaps).
8. action_plan (array of strings, 3-5 specific, highly actionable ways they should modify their resume, e.g. "Add a certification section", "Rewrite Project X to include metrics", etc.).

Be realistic and rigorous in your assessment.
Return ONLY valid JSON matching this schema, with no additional text or formatting.`;

    const userContent = `Target Domain: ${data.domain}
Target Role: ${data.role}
Job Description:
${data.jdText}

Resume parsed data:
${JSON.stringify(resumeParsed, null, 2)}

Resume raw text:
${resume.raw_text || ""}

Please perform the evaluation and return the JSON.`;

    const result = await chatJSON<{
      shortlist_score: number;
      status: string;
      evaluation_verdict: string;
      matched_skills: string[];
      missing_skills: string[];
      suggested_certifications: string[];
      suggested_courses: string[];
      action_plan: string[];
    }>({
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.2,
    });

    // 3. Save to database
    const { data: row, error: insertError } = await supabase
      .from("shortlist_evaluations")
      .insert({
        user_id: userId,
        domain: data.domain,
        role: data.role,
        jd_text: data.jdText,
        resume_id: data.resumeId,
        shortlist_score: result.shortlist_score,
        status: result.status,
        evaluation_verdict: result.evaluation_verdict,
        missing_skills: result.missing_skills,
        matched_skills: result.matched_skills,
        suggested_certifications: result.suggested_certifications,
        suggested_courses: result.suggested_courses,
        action_plan: result.action_plan,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert shortlist evaluation:", insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    return row;
  });

export const askCaseAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      question: z.string().min(1),
      contextCaseText: z.string().optional()
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { chatText } = await import("./ai-gateway.server");

    let systemPrompt = `You are an expert McKinsey/BCG Consulting Case Coach and Guesstimate Mentor. 
Your goal is to help the candidate learn how to tackle guesstimates, structure case study problems, define formula math, and build segmentations.
Provide highly structured, professional, and insightful advice. Use bullet points and clear headings. Keep answers relatively concise and highly actionable. Return raw markdown text.`;

    let userPrompt = `I am practicing guesstimates and case studies. Here is my question:
"${data.question}"`;

    if (data.contextCaseText) {
      userPrompt += `\n\nI am currently looking at this specific case study problem:
"${data.contextCaseText}"`;
    }

    const response = await chatText({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.7,
    });

    return { answer: response };
  });