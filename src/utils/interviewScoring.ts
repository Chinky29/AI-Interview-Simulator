import { TextGeneration, StructuredOutput } from '@runanywhere/web-llamacpp';
import type { InterviewScore, InterviewQuestion } from '../types/interview';

// JSON Schema for interview scoring
const SCORING_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    overall: { type: 'number', minimum: 0, maximum: 100 },
    clarity: { type: 'number', minimum: 0, maximum: 100 },
    technicalAccuracy: { type: 'number', minimum: 0, maximum: 100 },
    completeness: { type: 'number', minimum: 0, maximum: 100 },
    communication: { type: 'number', minimum: 0, maximum: 100 },
    feedback: { type: 'string' },
    strengths: {
      type: 'array',
      items: { type: 'string' }
    },
    improvements: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['overall', 'clarity', 'technicalAccuracy', 'completeness', 'communication', 'feedback', 'strengths', 'improvements']
});

export interface ScoringOptions {
  question: InterviewQuestion;
  response: string;
  duration: number; // seconds
}

export async function scoreInterviewResponse(
  options: ScoringOptions
): Promise<InterviewScore> {
  const { question, response, duration } = options;

  const prompt = `You are an expert technical interviewer. Evaluate the following interview response:

**Question:** ${question.question}
**Category:** ${question.category}
**Difficulty:** ${question.difficulty}
**Role:** ${question.role.replace(/-/g, ' ')}
**Response Time:** ${duration} seconds

**Candidate's Response:**
${response}

${question.expectedKeyPoints && question.expectedKeyPoints.length > 0 ? `**Expected Key Points:**
${question.expectedKeyPoints.map(p => `- ${p}`).join('\n')}` : ''}

Provide a comprehensive evaluation with:
1. **overall** (0-100): Overall score
2. **clarity** (0-100): How clear and well-structured the response is
3. **technicalAccuracy** (0-100): Correctness and depth of technical knowledge
4. **completeness** (0-100): How thoroughly they answered the question
5. **communication** (0-100): Communication effectiveness
6. **feedback** (string): 2-3 sentence summary of the response
7. **strengths** (array): 2-3 specific strengths in their answer
8. **improvements** (array): 2-3 specific areas for improvement

Be constructive, specific, and fair in your assessment.`;

  const systemPrompt = StructuredOutput.getSystemPrompt(SCORING_SCHEMA);

  try {
    const result = await TextGeneration.generate(prompt, {
      systemPrompt,
      maxTokens: 800,
      temperature: 0.3, // Lower temp for consistent scoring
    });

    const validation = StructuredOutput.validate(result.text, {
      jsonSchema: SCORING_SCHEMA,
    });

    if (!validation.isValid || !validation.extractedJson) {
      throw new Error(`Invalid scoring output: ${validation.errorMessage}`);
    }

    const score = JSON.parse(validation.extractedJson);
    
    // Ensure scores are within bounds
    return {
      overall: Math.max(0, Math.min(100, score.overall)),
      clarity: Math.max(0, Math.min(100, score.clarity)),
      technicalAccuracy: Math.max(0, Math.min(100, score.technicalAccuracy)),
      completeness: Math.max(0, Math.min(100, score.completeness)),
      communication: Math.max(0, Math.min(100, score.communication)),
      feedback: score.feedback,
      strengths: score.strengths || [],
      improvements: score.improvements || [],
    };
  } catch (error) {
    console.error('Error scoring response:', error);
    // Return a neutral fallback score
    return {
      overall: 50,
      clarity: 50,
      technicalAccuracy: 50,
      completeness: 50,
      communication: 50,
      feedback: 'Unable to automatically score this response. Please review manually.',
      strengths: ['Response provided'],
      improvements: ['Unable to analyze automatically'],
    };
  }
}

// Quick score without detailed analysis (faster)
export async function quickScoreResponse(
  question: string,
  response: string
): Promise<number> {
  const prompt = `Rate this interview response on a scale of 0-100. Return ONLY the numeric score.

Question: ${question}
Response: ${response}

Score (0-100):`;

  try {
    const result = await TextGeneration.generate(prompt, {
      maxTokens: 10,
      temperature: 0.2,
    });

    const score = parseInt(result.text.trim().replace(/[^0-9]/g, ''));
    return isNaN(score) ? 50 : Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error('Error in quick scoring:', error);
    return 50;
  }
}

// Generate interview summary for a session
export async function generateSessionSummary(
  responses: Array<{ question: string; response: string; score?: InterviewScore }>
): Promise<string> {
  const avgScore = responses.reduce((sum, r) => sum + (r.score?.overall || 0), 0) / responses.length;
  
  const prompt = `Generate a brief interview session summary (2-3 sentences) based on:

**Overall Score:** ${avgScore.toFixed(1)}/100
**Questions Answered:** ${responses.length}

**Performance Highlights:**
${responses.map((r, i) => `Q${i + 1}: ${r.score?.overall || 'N/A'}/100 - ${r.question.substring(0, 60)}...`).join('\n')}

Provide encouraging, constructive feedback highlighting the candidate's overall performance.`;

  try {
    const result = await TextGeneration.generate(prompt, {
      maxTokens: 200,
      temperature: 0.7,
    });

    return result.text.trim();
  } catch (error) {
    console.error('Error generating summary:', error);
    return `Interview completed with an average score of ${avgScore.toFixed(1)}/100. Keep practicing to improve your interview skills!`;
  }
}
