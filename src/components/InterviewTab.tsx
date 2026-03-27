import { useState, useCallback, useEffect, useRef } from 'react';
import { ModelCategory } from '@runanywhere/web';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';
import { generateInterviewQuestions, generateFollowUpQuestion } from '../utils/questionGenerator';
import { scoreInterviewResponse } from '../utils/interviewScoring';
import { SessionManager } from '../utils/sessionManager';
import type { 
  JobRole, 
  Difficulty, 
  InterviewQuestion, 
  InterviewResponse, 
  InterviewSession,
  QuestionCategory 
} from '../types/interview';
import { JOB_ROLE_LABELS, DIFFICULTY_LABELS } from '../types/interview';

type InterviewMode = 'setup' | 'generating' | 'practicing' | 'complete';

export function InterviewTab() {
  const loader = useModelLoader(ModelCategory.Language);
  
  // Setup state
  const [mode, setMode] = useState<InterviewMode>('setup');
  const [selectedRole, setSelectedRole] = useState<JobRole>('software-engineer');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [questionCount, setQuestionCount] = useState(3);
  const [selectedCategories, setSelectedCategories] = useState<QuestionCategory[]>([]);
  
  // Interview session state
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentResponse, setCurrentResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showTimer, setShowTimer] = useState(true);
  
  const timerRef = useRef<number | null>(null);
  const responseStartTime = useRef<Date | null>(null);

  // Timer effect
  useEffect(() => {
    if (mode === 'practicing' && responseStartTime.current && showTimer) {
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - responseStartTime.current!.getTime()) / 1000);
        setTimerSeconds(elapsed);
      }, 1000);
      
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [mode, showTimer]);

  // Start interview
  const startInterview = useCallback(async () => {
    if (loader.state !== 'ready') {
      const ok = await loader.ensure();
      if (!ok) return;
    }

    setMode('generating');

    try {
      const questions = await generateInterviewQuestions({
        role: selectedRole,
        difficulty: selectedDifficulty,
        count: questionCount,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      });

      const newSession: InterviewSession = {
        id: `session-${Date.now()}`,
        role: selectedRole,
        difficulty: selectedDifficulty,
        questions,
        responses: [],
        startTime: new Date(),
      };

      setSession(newSession);
      setCurrentQuestionIndex(0);
      setCurrentResponse('');
      responseStartTime.current = new Date();
      setTimerSeconds(0);
      setMode('practicing');
    } catch (error) {
      console.error('Error starting interview:', error);
      setMode('setup');
    }
  }, [loader, selectedRole, selectedDifficulty, questionCount, selectedCategories]);

  // Submit current response
  const submitResponse = useCallback(async () => {
    if (!session || !currentResponse.trim() || isProcessing) return;

    setIsProcessing(true);
    
    const question = session.questions[currentQuestionIndex];
    const duration = Math.floor((Date.now() - responseStartTime.current!.getTime()) / 1000);

    try {
      // Score the response
      const score = await scoreInterviewResponse({
        question,
        response: currentResponse,
        duration,
      });

      const newResponse: InterviewResponse = {
        questionId: question.id,
        question: question.question,
        response: currentResponse,
        duration,
        timestamp: new Date(),
        score,
      };

      // Update session
      const updatedSession = {
        ...session,
        responses: [...session.responses, newResponse],
      };
      setSession(updatedSession);

      // Move to next question or complete
      if (currentQuestionIndex < session.questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setCurrentResponse('');
        responseStartTime.current = new Date();
        setTimerSeconds(0);
      } else {
        // Interview complete
        const avgScore = updatedSession.responses.reduce((sum, r) => sum + (r.score?.overall || 0), 0) / updatedSession.responses.length;
        updatedSession.endTime = new Date();
        updatedSession.overallScore = avgScore;
        setSession(updatedSession);
        
        // Save session to history
        SessionManager.saveSession(updatedSession);
        
        setMode('complete');
      }
    } catch (error) {
      console.error('Error scoring response:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [session, currentQuestionIndex, currentResponse, isProcessing]);

  // Skip question
  const skipQuestion = useCallback(() => {
    if (!session) return;

    if (currentQuestionIndex < session.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setCurrentResponse('');
      responseStartTime.current = new Date();
      setTimerSeconds(0);
    } else {
      setMode('complete');
      const updatedSession = { ...session, endTime: new Date() };
      const avgScore = updatedSession.responses.reduce((sum, r) => sum + (r.score?.overall || 0), 0) / Math.max(1, updatedSession.responses.length);
      updatedSession.overallScore = avgScore;
      setSession(updatedSession);
    }
  }, [session, currentQuestionIndex]);

  // Restart interview
  const restartInterview = useCallback(() => {
    setMode('setup');
    setSession(null);
    setCurrentQuestionIndex(0);
    setCurrentResponse('');
    setTimerSeconds(0);
    responseStartTime.current = null;
  }, []);

  const currentQuestion = session?.questions[currentQuestionIndex];

  // Setup view
  if (mode === 'setup') {
    return (
      <div className="tab-panel interview-panel">
        <ModelBanner
          state={loader.state}
          progress={loader.progress}
          error={loader.error}
          onLoad={loader.ensure}
          label="LLM"
        />

        <div className="interview-setup">
          <h2>AI Interview Practice</h2>
          <p>Practice technical interviews with AI-generated questions and real-time feedback</p>

          <div className="setup-section">
            <label>Job Role</label>
            <select 
              value={selectedRole} 
              onChange={(e) => setSelectedRole(e.target.value as JobRole)}
              className="setup-select"
            >
              {Object.entries(JOB_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="setup-section">
            <label>Difficulty Level</label>
            <div className="difficulty-buttons">
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  className={`btn ${selectedDifficulty === value ? 'btn-primary' : ''}`}
                  onClick={() => setSelectedDifficulty(value as Difficulty)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="setup-section">
            <label>Number of Questions: {questionCount}</label>
            <input
              type="range"
              min="1"
              max="10"
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
              className="setup-range"
            />
          </div>

          <div className="setup-section">
            <label>
              <input
                type="checkbox"
                checked={showTimer}
                onChange={(e) => setShowTimer(e.target.checked)}
              />
              {' '}Show Timer
            </label>
          </div>

          <button 
            className="btn btn-primary btn-lg"
            onClick={startInterview}
            disabled={loader.state === 'downloading' || loader.state === 'loading'}
          >
            Start Interview
          </button>
        </div>
      </div>
    );
  }

  // Generating questions
  if (mode === 'generating') {
    return (
      <div className="tab-panel interview-panel">
        <div className="interview-center">
          <div className="spinner" />
          <h3>Generating Interview Questions...</h3>
          <p>Creating {questionCount} questions for {JOB_ROLE_LABELS[selectedRole]} ({DIFFICULTY_LABELS[selectedDifficulty]})</p>
        </div>
      </div>
    );
  }

  // Practicing
  if (mode === 'practicing' && currentQuestion) {
    return (
      <div className="tab-panel interview-panel">
        <div className="interview-header">
          <div className="interview-progress">
            Question {currentQuestionIndex + 1} of {session!.questions.length}
            {showTimer && <span className="interview-timer">{Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}</span>}
          </div>
          <div className="interview-meta">
            <span className="badge">{currentQuestion.category}</span>
            <span className="badge">{currentQuestion.difficulty}</span>
          </div>
        </div>

        <div className="interview-question">
          <h3>{currentQuestion.question}</h3>
        </div>

        <div className="interview-answer">
          <textarea
            value={currentResponse}
            onChange={(e) => setCurrentResponse(e.target.value)}
            placeholder="Type your answer here..."
            disabled={isProcessing}
            rows={8}
            className="interview-textarea"
          />
        </div>

        <div className="interview-actions">
          <button 
            className="btn"
            onClick={skipQuestion}
            disabled={isProcessing}
          >
            Skip
          </button>
          <button 
            className="btn btn-primary"
            onClick={submitResponse}
            disabled={!currentResponse.trim() || isProcessing}
          >
            {isProcessing ? 'Scoring...' : 'Submit Answer'}
          </button>
        </div>

        {session!.responses.length > 0 && (
          <div className="interview-previous">
            <h4>Previous Question Score</h4>
            <div className="score-card">
              <div className="score-main">{session!.responses[session!.responses.length - 1].score?.overall || 0}/100</div>
              <p>{session!.responses[session!.responses.length - 1].score?.feedback}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Complete
  if (mode === 'complete' && session) {
    return (
      <div className="tab-panel interview-panel">
        <div className="interview-complete">
          <h2>Interview Complete!</h2>
          
          <div className="overall-score">
            <div className="score-circle">
              <span className="score-value">{session.overallScore?.toFixed(0) || 0}</span>
              <span className="score-label">/100</span>
            </div>
            <p>Overall Performance</p>
          </div>

          <div className="results-summary">
            <h3>Question Summary</h3>
            {session.responses.map((response, index) => (
              <div key={index} className="result-item">
                <div className="result-header">
                  <strong>Q{index + 1}:</strong> {response.question}
                </div>
                {response.score && (
                  <div className="result-scores">
                    <div className="score-bar">
                      <span>Overall: {response.score.overall}/100</span>
                      <div className="bar">
                        <div className="bar-fill" style={{ width: `${response.score.overall}%` }} />
                      </div>
                    </div>
                    <div className="score-breakdown">
                      <span>Clarity: {response.score.clarity}</span>
                      <span>Technical: {response.score.technicalAccuracy}</span>
                      <span>Complete: {response.score.completeness}</span>
                    </div>
                    <p className="score-feedback">{response.score.feedback}</p>
                    {response.score.strengths.length > 0 && (
                      <div className="strengths">
                        <strong>Strengths:</strong>
                        <ul>
                          {response.score.strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {response.score.improvements.length > 0 && (
                      <div className="improvements">
                        <strong>Areas to Improve:</strong>
                        <ul>
                          {response.score.improvements.map((imp, i) => <li key={i}>{imp}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="interview-actions">
            <button className="btn btn-primary btn-lg" onClick={restartInterview}>
              Start New Interview
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
