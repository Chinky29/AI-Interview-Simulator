// Interview types and interfaces

export type JobRole = 
  | 'software-engineer'
  | 'frontend-developer'
  | 'backend-developer'
  | 'fullstack-developer'
  | 'data-scientist'
  | 'product-manager'
  | 'ux-designer'
  | 'devops-engineer';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type QuestionCategory = 
  | 'technical'
  | 'behavioral'
  | 'system-design'
  | 'coding'
  | 'situational';

export interface InterviewQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  role: JobRole;
  expectedKeyPoints?: string[];
  followUpQuestions?: string[];
}

export interface InterviewResponse {
  questionId: string;
  question: string;
  response: string;
  duration: number; // seconds
  timestamp: Date;
  score?: InterviewScore;
}

export interface InterviewScore {
  overall: number; // 0-100
  clarity: number; // 0-100
  technicalAccuracy: number; // 0-100
  completeness: number; // 0-100
  communication: number; // 0-100
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export interface InterviewSession {
  id: string;
  role: JobRole;
  difficulty: Difficulty;
  questions: InterviewQuestion[];
  responses: InterviewResponse[];
  startTime: Date;
  endTime?: Date;
  overallScore?: number;
}

export const JOB_ROLE_LABELS: Record<JobRole, string> = {
  'software-engineer': 'Software Engineer',
  'frontend-developer': 'Frontend Developer',
  'backend-developer': 'Backend Developer',
  'fullstack-developer': 'Full-Stack Developer',
  'data-scientist': 'Data Scientist',
  'product-manager': 'Product Manager',
  'ux-designer': 'UX Designer',
  'devops-engineer': 'DevOps Engineer',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Entry Level',
  medium: 'Mid Level',
  hard: 'Senior Level',
};
