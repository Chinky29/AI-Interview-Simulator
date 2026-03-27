import { useState, useEffect } from 'react';
import { initSDK, getAccelerationMode } from './runanywhere';
import { ChatTab } from './components/ChatTab';
import { VisionTab } from './components/VisionTab';
import { VoiceTab } from './components/VoiceTab';
import { ToolsTab } from './components/ToolsTab';
import { InterviewTab } from './components/InterviewTab';
import { VideoInterviewTab } from './components/VideoInterviewTab';
import { HistoryTab } from './components/HistoryTab';

type Tab = 'interview' | 'video-interview' | 'history' | 'chat' | 'vision' | 'voice' | 'tools';

export function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('interview');

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => setSdkError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (sdkError) {
    return (
      <div className="app-loading">
        <h2>SDK Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <h2>Loading RunAnywhere SDK...</h2>
        <p>Initializing on-device AI engine</p>
      </div>
    );
  }

  const accel = getAccelerationMode();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-brand">
          <div className="app-logo">🎯</div>
          <h1>AI Interview Simulator</h1>
        </div>
        <div className="app-header-info">
          {accel && (
            <span className={`badge ${accel === 'webgpu' ? 'badge-success' : ''}`}>
              {accel === 'webgpu' ? '⚡ WebGPU' : '🔧 CPU'}
            </span>
          )}
        </div>
      </header>

      <nav className="tab-bar">
        <button className={activeTab === 'interview' ? 'active' : ''} onClick={() => setActiveTab('interview')}>
          <span className="tab-icon">📝</span>
          <span>Text Interview</span>
        </button>
        <button className={activeTab === 'video-interview' ? 'active' : ''} onClick={() => setActiveTab('video-interview')}>
          <span className="tab-icon">📹</span>
          <span>Video Interview</span>
        </button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
          <span className="tab-icon">📊</span>
          <span>History</span>
        </button>
        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
          <span className="tab-icon">💬</span>
          <span>Chat</span>
        </button>
        <button className={activeTab === 'vision' ? 'active' : ''} onClick={() => setActiveTab('vision')}>
          <span className="tab-icon">👁️</span>
          <span>Vision</span>
        </button>
        <button className={activeTab === 'voice' ? 'active' : ''} onClick={() => setActiveTab('voice')}>
          <span className="tab-icon">🎙️</span>
          <span>Voice</span>
        </button>
        <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>
          <span className="tab-icon">🔧</span>
          <span>Tools</span>
        </button>
      </nav>

      <main className="tab-content">
        {activeTab === 'interview' && <InterviewTab />}
        {activeTab === 'video-interview' && <VideoInterviewTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'chat' && <ChatTab />}
        {activeTab === 'vision' && <VisionTab />}
        {activeTab === 'voice' && <VoiceTab />}
        {activeTab === 'tools' && <ToolsTab />}
      </main>
    </div>
  );
}
