import { useState, useCallback, useEffect } from 'react';
import { SessionManager } from '../utils/sessionManager';
import type { InterviewSession } from '../types/interview';
import { JOB_ROLE_LABELS, DIFFICULTY_LABELS } from '../types/interview';

type ViewMode = 'overview' | 'detail';

export function HistoryTab() {
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [filterRole, setFilterRole] = useState<string>('all');

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = useCallback(() => {
    const allSessions = SessionManager.getAllSessions();
    setSessions(allSessions);
  }, []);

  const viewSession = useCallback((session: InterviewSession) => {
    setSelectedSession(session);
    setViewMode('detail');
  }, []);

  const backToOverview = useCallback(() => {
    setSelectedSession(null);
    setViewMode('overview');
  }, []);

  const deleteSession = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this session?')) {
      SessionManager.deleteSession(id);
      loadSessions();
    }
  }, [loadSessions]);

  const clearAll = useCallback(() => {
    if (confirm('Are you sure you want to delete ALL interview history? This cannot be undone.')) {
      SessionManager.clearAllSessions();
      loadSessions();
    }
  }, [loadSessions]);

  const exportData = useCallback(() => {
    const data = SessionManager.exportSessions();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importData = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const success = SessionManager.importSessions(content);
      if (success) {
        loadSessions();
        alert('Sessions imported successfully!');
      } else {
        alert('Failed to import sessions. Please check the file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  }, [loadSessions]);

  // Filter sessions by role
  const filteredSessions = filterRole === 'all' 
    ? sessions 
    : sessions.filter(s => s.role === filterRole);

  // Get stats
  const stats = SessionManager.getStats();

  // Overview mode
  if (viewMode === 'overview') {
    return (
      <div className="tab-panel history-panel">
        <div className="history-header">
          <h2>Interview History</h2>
          <div className="history-actions">
            <button className="btn btn-sm" onClick={exportData}>
              📥 Export
            </button>
            <label className="btn btn-sm">
              📤 Import
              <input 
                type="file" 
                accept=".json" 
                onChange={importData} 
                style={{ display: 'none' }}
              />
            </label>
            {sessions.length > 0 && (
              <button className="btn btn-sm" onClick={clearAll} style={{ color: 'var(--red)' }}>
                🗑️ Clear All
              </button>
            )}
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="empty-state">
            <h3>No Interview History</h3>
            <p>Complete an interview to see your history and progress here</p>
          </div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.totalSessions}</div>
                <div className="stat-label">Total Interviews</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.averageScore.toFixed(0)}</div>
                <div className="stat-label">Avg Score</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{stats.totalQuestions}</div>
                <div className="stat-label">Questions Answered</div>
              </div>
            </div>

            {Object.keys(stats.byRole).length > 0 && (
              <div className="role-stats">
                <h3>Performance by Role</h3>
                <div className="role-stats-grid">
                  {Object.entries(stats.byRole).map(([role, data]) => (
                    <div key={role} className="role-stat-item">
                      <div className="role-stat-name">{JOB_ROLE_LABELS[role as keyof typeof JOB_ROLE_LABELS]}</div>
                      <div className="role-stat-data">
                        <span>{data.count} interview{data.count !== 1 ? 's' : ''}</span>
                        <span className="role-stat-score">{data.avgScore.toFixed(0)}/100</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="history-filter">
              <label>Filter by Role:</label>
              <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="filter-select">
                <option value="all">All Roles</option>
                {Object.entries(JOB_ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="history-list">
              {filteredSessions.map((session) => (
                <div 
                  key={session.id} 
                  className="history-item"
                  onClick={() => viewSession(session)}
                >
                  <div className="history-item-header">
                    <div className="history-item-title">
                      <strong>{JOB_ROLE_LABELS[session.role]}</strong>
                      <span className="badge">{DIFFICULTY_LABELS[session.difficulty]}</span>
                    </div>
                    <button 
                      className="btn-icon-delete"
                      onClick={(e) => deleteSession(session.id, e)}
                      title="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="history-item-meta">
                    <span>{new Date(session.startTime).toLocaleDateString()}</span>
                    <span>{session.questions.length} questions</span>
                    {session.overallScore !== undefined && (
                      <span className="history-item-score">{session.overallScore.toFixed(0)}/100</span>
                    )}
                  </div>
                  <div className="history-item-progress">
                    <div 
                      className="history-item-progress-bar" 
                      style={{ width: `${session.overallScore || 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Detail mode
  if (viewMode === 'detail' && selectedSession) {
    return (
      <div className="tab-panel history-panel">
        <div className="history-detail-header">
          <button className="btn" onClick={backToOverview}>
            ← Back to History
          </button>
        </div>

        <div className="interview-complete">
          <h2>Interview Session Details</h2>
          
          <div className="session-info">
            <div><strong>Role:</strong> {JOB_ROLE_LABELS[selectedSession.role]}</div>
            <div><strong>Difficulty:</strong> {DIFFICULTY_LABELS[selectedSession.difficulty]}</div>
            <div><strong>Date:</strong> {new Date(selectedSession.startTime).toLocaleString()}</div>
            {selectedSession.endTime && (
              <div><strong>Duration:</strong> {Math.round((new Date(selectedSession.endTime).getTime() - new Date(selectedSession.startTime).getTime()) / 1000 / 60)} minutes</div>
            )}
          </div>

          <div className="overall-score">
            <div className="score-circle">
              <span className="score-value">{selectedSession.overallScore?.toFixed(0) || 'N/A'}</span>
              <span className="score-label">/100</span>
            </div>
            <p>Overall Score</p>
          </div>

          <div className="results-summary">
            <h3>Questions & Responses</h3>
            {selectedSession.responses.map((response, index) => (
              <div key={index} className="result-item">
                <div className="result-header">
                  <strong>Q{index + 1}:</strong> {response.question}
                </div>
                <p className="score-feedback"><strong>Your Answer:</strong> {response.response}</p>
                <div className="response-meta">
                  <span>⏱️ {response.duration}s</span>
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
        </div>
      </div>
    );
  }

  return null;
}
