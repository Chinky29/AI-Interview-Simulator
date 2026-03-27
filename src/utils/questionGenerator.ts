import { TextGeneration, StructuredOutput } from '@runanywhere/web-llamacpp';
import type { JobRole, Difficulty, QuestionCategory, InterviewQuestion } from '../types/interview';

// JSON Schema for structured question generation
const QUESTION_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          category: { 
            type: 'string',
            enum: ['technical', 'behavioral', 'system-design', 'coding', 'situational']
          },
          expectedKeyPoints: {
            type: 'array',
            items: { type: 'string' }
          },
          followUpQuestions: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['question', 'category']
      }
    }
  },
  required: ['questions']
});

export interface QuestionGenerationOptions {
  role: JobRole;
  difficulty: Difficulty;
  count: number;
  categories?: QuestionCategory[];
}

export async function generateInterviewQuestions(
  options: QuestionGenerationOptions
): Promise<InterviewQuestion[]> {
  const { role, difficulty, count, categories } = options;

  // Build prompt for question generation
  const categoryFilter = categories && categories.length > 0 
    ? `focusing on ${categories.join(', ')} questions`
    : 'covering various categories (technical, behavioral, system-design, coding, situational)';

  const prompt = `Generate ${count} interview questions for a ${difficulty} level ${role.replace(/-/g, ' ')} position, ${categoryFilter}.

For each question, provide:
1. The interview question text
2. The category (technical, behavioral, system-design, coding, or situational)
3. 2-3 key points that should be covered in a good answer
4. 1-2 follow-up questions to probe deeper

Make questions realistic, relevant to the role, and appropriate for the ${difficulty} level.`;

  // Get system prompt with schema
  const systemPrompt = StructuredOutput.getSystemPrompt(QUESTION_SCHEMA);

  try {
    // Generate with structured output
    const result = await TextGeneration.generate(prompt, {
      systemPrompt,
      maxTokens: 2000,
      temperature: 0.8, // Higher temp for more variety
    });

    // Validate and extract JSON
    const validation = StructuredOutput.validate(result.text, {
      jsonSchema: QUESTION_SCHEMA,
    });

    if (!validation.isValid || !validation.extractedJson) {
      throw new Error(`Invalid question generation output: ${validation.errorMessage}`);
    }

    const parsed = JSON.parse(validation.extractedJson);
    
    // Map to InterviewQuestion objects
    return parsed.questions.map((q: any, index: number) => ({
      id: `${role}-${difficulty}-${Date.now()}-${index}`,
      question: q.question,
      category: q.category as QuestionCategory,
      difficulty,
      role,
      expectedKeyPoints: q.expectedKeyPoints || [],
      followUpQuestions: q.followUpQuestions || [],
    }));
  } catch (error) {
    console.error('Error generating questions:', error);
    // Return fallback questions
    return getFallbackQuestions(role, difficulty, count);
  }
}

// Fallback questions if generation fails
function getFallbackQuestions(
  role: JobRole,
  difficulty: Difficulty,
  count: number
): InterviewQuestion[] {
  const fallbackQuestions: Record<JobRole, string[]> = {
    'software-engineer': [
      'Tell me about a challenging project you worked on.',
      'How do you approach debugging complex issues?',
      'Explain the concept of time complexity in algorithms.',
      'Describe your experience with version control systems.',
      'How do you stay updated with new technologies?',
    ],
    'frontend-developer': [
      'What is your experience with modern JavaScript frameworks?',
      'How do you ensure your web applications are accessible?',
      'Explain the difference between client-side and server-side rendering.',
      'How do you optimize web application performance?',
      'Describe your approach to responsive design.',
    ],
    'backend-developer': [
      'How do you design RESTful APIs?',
      'What is your experience with database optimization?',
      'Explain how you handle authentication and authorization.',
      'Describe your approach to error handling in backend services.',
      'How do you ensure API security?',
    ],
    'fullstack-developer': [
      'How do you manage state across frontend and backend?',
      'Describe your experience building end-to-end features.',
      'How do you approach system architecture decisions?',
      'What is your deployment and CI/CD experience?',
      'How do you balance frontend and backend development?',
    ],
    'data-scientist': [
      'Explain your experience with machine learning models.',
      'How do you handle missing or dirty data?',
      'Describe a data analysis project you are proud of.',
      'What statistical methods do you commonly use?',
      'How do you communicate technical findings to non-technical stakeholders?',
    ],
    'product-manager': [
      'How do you prioritize features in a product roadmap?',
      'Describe your experience working with cross-functional teams.',
      'How do you gather and validate user requirements?',
      'What metrics do you use to measure product success?',
      'Tell me about a time you had to make a difficult product decision.',
    ],
    'ux-designer': [
      'Walk me through your design process.',
      'How do you conduct user research?',
      'Describe your experience with design systems.',
      'How do you handle feedback and iteration on designs?',
      'What tools do you use for prototyping and design?',
    ],
    'devops-engineer': [
      'Explain your experience with CI/CD pipelines.',
      'How do you approach infrastructure as code?',
      'Describe your experience with container orchestration.',
      'How do you handle monitoring and alerting?',
      'What is your approach to incident response?',
    ],
  };

  const questions = fallbackQuestions[role] || fallbackQuestions['software-engineer'];
  
  return questions.slice(0, count).map((q, index) => ({
    id: `fallback-${role}-${difficulty}-${index}`,
    question: q,
    category: 'behavioral' as QuestionCategory,
    difficulty,
    role,
    expectedKeyPoints: [],
    followUpQuestions: [],
  }));
}

// Generate a follow-up question based on the user's response
export async function generateFollowUpQuestion(
  originalQuestion: string,
  userResponse: string,
  role: JobRole
): Promise<string> {
  const prompt = `As an interviewer for a ${role.replace(/-/g, ' ')} position, generate ONE insightful follow-up question based on the candidate's response.

Original Question: ${originalQuestion}

Candidate's Response: ${userResponse}

Generate a follow-up question that:
- Probes deeper into their answer
- Tests technical understanding or experience
- Is specific and relevant to what they said

Return ONLY the follow-up question, nothing else.`;

  try {
    const result = await TextGeneration.generate(prompt, {
      maxTokens: 150,
      temperature: 0.7,
    });

    return result.text.trim();
  } catch (error) {
    console.error('Error generating follow-up:', error);
    return 'Can you elaborate more on that?';
  }
}
