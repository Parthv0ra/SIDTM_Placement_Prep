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

    const isGuesstimate = q?.category === "guesstimate";
    const isBehavioral = q?.category === "behavioral";

    let promptSystem = "";
    let promptUser = "";

    if (isGuesstimate) {
      promptSystem = "You are an expert consultant and interviewer scoring a Guesstimate / Case response on multiple dimensions (0-100 integers). Evaluate how logically they structured their formula, how explicit their driver assumptions are, and if they performed a sanity check on the final number. Return JSON only.";
      promptUser = `Guesstimate Case: ${q?.question_text}\nStudent Scratchpad Solution:\n"""${transcript}"""\n\nReturn JSON with integer 0-100 scores: driver_breakdown, assumptions, sanity_check, overall_logic, structure, technical_accuracy, feedback (2-3 sentences of actionable feedback analyzing their driver tree, assumptions, and final sanity check).`;
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
      summary = await chatJSON<{ strengths: string[]; recommendations: string[]; guesstimate_ideal_approach: string; guesstimate_expected_value: string }>({
        system: "You are a senior placement coach and management consultant summarizing a Guesstimate case practice. Return JSON only.",
        messages: [{
          role: "user",
          content: `Target: ${session.role}\nQuestion: ${(responses ?? [])[0]?.questions?.question_text}\nStudent Response:\n${(responses ?? [])[0]?.transcript ?? ""}\nStudent Scores: ${JSON.stringify(category_scores)}\n\nReturn JSON: {
            strengths: string[2-3],
            recommendations: string[2-3],
            guesstimate_ideal_approach: string (detailed step-by-step driver formula, key assumptions to use, and logical calculation tree recommended to solve this case),
            guesstimate_expected_value: string (the expected numerical range or scale of the final answer, explaining why that scale is a reasonable sanity check)
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