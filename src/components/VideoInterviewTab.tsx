import { useState, useRef, useCallback, useEffect } from 'react';
import { ModelCategory, VideoCapture } from '@runanywhere/web';
import { VLMWorkerBridge } from '@runanywhere/web-llamacpp';
import { useModelLoader } from '../hooks/useModelLoader';
import { ModelBanner } from './ModelBanner';
import { generateInterviewQuestions } from '../utils/questionGenerator';
import type { JobRole, Difficulty, InterviewQuestion } from '../types/interview';
import { JOB_ROLE_LABELS, DIFFICULTY_LABELS } from '../types/interview';

type VideoInterviewState = 'setup' | 'loading' | 'generating-questions' | 'ready' | 'interviewing' | 'analyzing' | 'complete';

interface VideoAnalysis {
  timestamp: Date;
  bodyLanguage: string;
  presentation: string;
  suggestions: string;
}

interface VideoInterviewTurn {
  question: string;
  textResponse: string;
  analyses: VideoAnalysis[];
  overallPresentationScore: number;
}

const ANALYSIS_INTERVAL_MS = 4000; // Analyze every 4 seconds
const CAPTURE_DIM = 256;

export function VideoInterviewTab() {
  const llmLoader = useModelLoader(ModelCategory.Language);
  const vlmLoader = useModelLoader(ModelCategory.Multimodal);

  // Setup
  const [state, setState] = useState<VideoInterviewState>('setup');
  const [selectedRole, setSelectedRole] = useState<JobRole>('software-engineer');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('medium');
  const [questionCount, setQuestionCount] = useState(3);

  // Interview state
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentResponse, setCurrentResponse] = useState('');
  const [conversationHistory, setConversationHistory] = useState<VideoInterviewTurn[]>([]);
  const [currentAnalyses, setCurrentAnalyses] = useState<VideoAnalysis[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoMountRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<VideoCapture | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);
  const isAnalyzingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
      const cam = captureRef.current;
      if (cam) {
        cam.stop();
        cam.videoElement.parentNode?.removeChild(cam.videoElement);
        captureRef.current = null;
      }
    };
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    if (captureRef.current?.isCapturing) return;

    setError(null);

    try {
      const cam = new VideoCapture({ facingMode: 'user' }); // Selfie camera for interviews
      await cam.start();
      captureRef.current = cam;

      // Wait for camera to be ready
      await new Promise<void>((resolve) => {
        const video = cam.videoElement;
        if (video.videoWidth > 0) {
          resolve();
        } else {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        }
      });

      const mount = videoMountRef.current;
      if (mount) {
        const el = cam.videoElement;
        el.style.width = '100%';
        el.style.borderRadius = '12px';
        el.style.transform = 'scaleX(-1)'; // Mirror for selfie
        mount.appendChild(el);
      }

      setCameraActive(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('Camera permission denied. Please allow camera access for video interviews.');
      } else if (msg.includes('NotFound')) {
        setError('No camera found on this device.');
      } else {
        setError(`Camera error: ${msg}`);
      }
    }
  }, []);

  // Start interview
  const startInterview = useCallback(async () => {
    // Ensure LLM is loaded
    if (llmLoader.state !== 'ready') {
      const ok = await llmLoader.ensure();
      if (!ok) return;
    }

    // Ensure VLM is loaded
    if (vlmLoader.state !== 'ready') {
      const ok = await vlmLoader.ensure();
      if (!ok) return;
    }

    setState('generating-questions');

    try {
      const generatedQuestions = await generateInterviewQuestions({
        role: selectedRole,
        difficulty: selectedDifficulty,
        count: questionCount,
      });

      setQuestions(generatedQuestions);
      setCurrentQuestionIndex(0);
      setConversationHistory([]);
      setCurrentAnalyses([]);
      setCurrentResponse('');

      // Start camera if not already active
      if (!cameraActive) {
        await startCamera();
      }

      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('setup');
    }
  }, [llmLoader, vlmLoader, selectedRole, selectedDifficulty, questionCount, cameraActive, startCamera]);

  // Start answering current question
  const startAnswering = useCallback(() => {
    setState('interviewing');
    setCurrentAnalyses([]);
    setLatestAnalysis('Starting video analysis...');

    // Start periodic video analysis
    const analyzeFrame = async () => {
      if (isAnalyzingRef.current) return;
      
      const cam = captureRef.current;
      if (!cam?.isCapturing || !VLMWorkerBridge.shared.isModelLoaded) return;

      const frame = cam.captureFrame(CAPTURE_DIM);
      if (!frame) return;

      isAnalyzingRef.current = true;

      try {
        const prompt = `Analyze this person's presentation during a video interview. Focus on:
1. Body language (posture, eye contact, gestures)
2. Facial expressions and engagement
3. Professional appearance
4. Overall confidence level

Provide brief, constructive feedback in 2-3 sentences.`;

        const result = await VLMWorkerBridge.shared.process(
          frame.rgbPixels,
          frame.width,
          frame.height,
          prompt,
          { maxTokens: 80, temperature: 0.7 }
        );

        const analysis: VideoAnalysis = {
          timestamp: new Date(),
          bodyLanguage: result.text,
          presentation: result.text,
          suggestions: result.text,
        };

        setCurrentAnalyses(prev => [...prev, analysis]);
        setLatestAnalysis(result.text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('memory access out of bounds')) {
          console.warn('VLM memory error, retrying next frame');
        } else {
          console.error('Analysis error:', err);
        }
      } finally {
        isAnalyzingRef.current = false;
      }
    };

    // Analyze immediately, then every ANALYSIS_INTERVAL_MS
    analyzeFrame();
    analysisIntervalRef.current = window.setInterval(analyzeFrame, ANALYSIS_INTERVAL_MS);
  }, []);

  // Submit answer
  const submitAnswer = useCallback(() => {
    if (!currentResponse.trim()) return;

    // Stop analysis
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }

    setState('analyzing');

    // Calculate presentation score based on analyses
    const presentationScore = Math.min(100, 60 + (currentAnalyses.length * 5)); // More analyses = more engaged

    const turn: VideoInterviewTurn = {
      question: questions[currentQuestionIndex].question,
      textResponse: currentResponse,
      analyses: currentAnalyses,
      overallPresentationScore: presentationScore,
    };

    setConversationHistory(prev => [...prev, turn]);

    // Move to next question or complete
    if (currentQuestionIndex < questions.length - 1) {
      setTimeout(() => {
        setCurrentQuestionIndex(prev => prev + 1);
        setCurrentResponse('');
        setCurrentAnalyses([]);
        setState('ready');
      }, 2000);
    } else {
      setState('complete');
    }
  }, [currentResponse, currentAnalyses, questions, currentQuestionIndex]);

  // Restart
  const restartInterview = useCallback(() => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }
    setState('setup');
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setCurrentResponse('');
    setConversationHistory([]);
    setCurrentAnalyses([]);
    setLatestAnalysis('');
    setError(null);
  }, []);

  // Setup view
  if (state === 'setup' || state === 'loading') {
    return (
      <div className="tab-panel interview-panel">
        <ModelBanner
          state={llmLoader.state !== 'ready' ? llmLoader.state : vlmLoader.state}
          progress={llmLoader.state !== 'ready' ? llmLoader.progress : vlmLoader.progress}
          error={llmLoader.error || vlmLoader.error}
          onLoad={async () => {
            await llmLoader.ensure();
            await vlmLoader.ensure();
          }}
          label={llmLoader.state !== 'ready' ? 'LLM' : 'VLM'}
        />

        {error && <div className="model-banner"><span className="error-text">{error}</span></div>}

        <div className="interview-setup">
          <h2>Video Interview Practice</h2>
          <p>Practice interviews on camera with real-time body language and presentation analysis</p>

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
              max="5"
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
              className="setup-range"
            />
          </div>

          <button 
            className="btn btn-primary btn-lg"
            onClick={startInterview}
            disabled={llmLoader.state !== 'ready' || vlmLoader.state !== 'ready'}
          >
            Start Video Interview
          </button>
        </div>
      </div>
    );
  }

  // Generating questions
  if (state === 'generating-questions') {
    return (
      <div className="tab-panel interview-panel">
        <div className="interview-center">
          <div className="spinner" />
          <h3>Preparing Video Interview...</h3>
          <p>Generating questions and starting camera</p>
        </div>
      </div>
    );
  }

  // Ready to answer
  if (state === 'ready') {
    return (
      <div className="tab-panel interview-panel">
        <div className="interview-header">
          <div className="interview-progress">
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
        </div>

        <div className="video-interview-container">
          <div className="video-preview">
            <div ref={videoMountRef}>
              {!cameraActive && (
                <div className="empty-state">
                  <h3>Camera Preview</h3>
                  <p>Starting camera...</p>
                </div>
              )}
            </div>
          </div>

          <div className="interview-content">
            <div className="interview-question">
              <h3>{questions[currentQuestionIndex].question}</h3>
            </div>

            <button 
              className="btn btn-primary btn-lg"
              onClick={startAnswering}
            >
              Start Answering (Begin Recording)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Interviewing (answering)
  if (state === 'interviewing') {
    return (
      <div className="tab-panel interview-panel">
        <div className="interview-header">
          <div className="interview-progress">
            Question {currentQuestionIndex + 1} of {questions.length}
            <span className="recording-badge">🔴 Recording</span>
          </div>
        </div>

        <div className="video-interview-container">
          <div className="video-preview">
            <div ref={videoMountRef} />
            {latestAnalysis && (
              <div className="video-analysis-overlay">
                <span className="analysis-badge">AI Analysis</span>
                <p>{latestAnalysis}</p>
              </div>
            )}
          </div>

          <div className="interview-content">
            <div className="interview-question">
              <h3>{questions[currentQuestionIndex].question}</h3>
            </div>

            <div className="interview-answer">
              <label>Type your answer as you speak (optional):</label>
              <textarea
                value={currentResponse}
                onChange={(e) => setCurrentResponse(e.target.value)}
                placeholder="Your answer..."
                rows={6}
                className="interview-textarea"
              />
            </div>

            <div className="analysis-counter">
              <span>📊 {currentAnalyses.length} video analyses completed</span>
            </div>

            <button 
              className="btn btn-primary btn-lg"
              onClick={submitAnswer}
            >
              Submit Answer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Analyzing
  if (state === 'analyzing') {
    return (
      <div className="tab-panel interview-panel">
        <div className="interview-center">
          <div className="spinner" />
          <h3>Analyzing Your Response...</h3>
          <p>Processing video and text analysis</p>
        </div>
      </div>
    );
  }

  // Complete
  if (state === 'complete') {
    const avgPresentationScore = conversationHistory.reduce((sum, turn) => sum + turn.overallPresentationScore, 0) / conversationHistory.length;

    return (
      <div className="tab-panel interview-panel">
        <div className="interview-complete">
          <h2>Video Interview Complete!</h2>
          
          <div className="overall-score">
            <div className="score-circle">
              <span className="score-value">{avgPresentationScore.toFixed(0)}</span>
              <span className="score-label">/100</span>
            </div>
            <p>Average Presentation Score</p>
          </div>

          <div className="results-summary">
            <h3>Interview Analysis</h3>
            {conversationHistory.map((turn, index) => (
              <div key={index} className="result-item">
                <div className="result-header">
                  <strong>Q{index + 1}:</strong> {turn.question}
                </div>
                
                {turn.textResponse && (
                  <p className="score-feedback"><strong>Your Answer:</strong> {turn.textResponse}</p>
                )}

                <div className="score-bar">
                  <span>Presentation Score: {turn.overallPresentationScore}/100</span>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${turn.overallPresentationScore}%` }} />
                  </div>
                </div>

                <div className="video-analyses">
                  <strong>Video Analysis ({turn.analyses.length} snapshots):</strong>
                  <ul>
                    {turn.analyses.slice(-3).map((analysis, i) => (
                      <li key={i}>{analysis.bodyLanguage}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <div className="interview-actions">
            <button className="btn btn-primary btn-lg" onClick={restartInterview}>
              Start New Video Interview
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
