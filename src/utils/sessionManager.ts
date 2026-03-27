import type { InterviewSession } from '../types/interview';

const STORAGE_KEY = 'ai_interview_sessions';
const MAX_SESSIONS = 50; // Keep last 50 sessions

export class SessionManager {
  // Save a completed session
  static saveSession(session: InterviewSession): void {
    try {
      const sessions = this.getAllSessions();
      sessions.unshift(session); // Add to beginning
      
      // Keep only MAX_SESSIONS most recent
      if (sessions.length > MAX_SESSIONS) {
        sessions.splice(MAX_SESSIONS);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  // Get all saved sessions
  static getAllSessions(): InterviewSession[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const sessions = JSON.parse(stored);
      
      // Convert date strings back to Date objects
      return sessions.map((s: any) => ({
        ...s,
        startTime: new Date(s.startTime),
        endTime: s.endTime ? new Date(s.endTime) : undefined,
        responses: s.responses.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp),
        })),
      }));
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    }
  }

  // Get sessions filtered by role
  static getSessionsByRole(role: string): InterviewSession[] {
    return this.getAllSessions().filter(s => s.role === role);
  }

  // Get recent sessions (last N)
  static getRecentSessions(count: number = 10): InterviewSession[] {
    return this.getAllSessions().slice(0, count);
  }

  // Get session statistics
  static getStats(): {
    totalSessions: number;
    averageScore: number;
    totalQuestions: number;
    byRole: Record<string, { count: number; avgScore: number }>;
  } {
    const sessions = this.getAllSessions().filter(s => s.overallScore !== undefined);
    
    const byRole: Record<string, { count: number; avgScore: number; totalScore: number }> = {};
    
    let totalScore = 0;
    let totalQuestions = 0;
    
    sessions.forEach(session => {
      if (session.overallScore !== undefined) {
        totalScore += session.overallScore;
        totalQuestions += session.responses.length;
        
        if (!byRole[session.role]) {
          byRole[session.role] = { count: 0, avgScore: 0, totalScore: 0 };
        }
        
        byRole[session.role].count++;
        byRole[session.role].totalScore += session.overallScore;
      }
    });
    
    // Calculate averages
    const byRoleFinal: Record<string, { count: number; avgScore: number }> = {};
    Object.entries(byRole).forEach(([role, data]) => {
      byRoleFinal[role] = {
        count: data.count,
        avgScore: data.totalScore / data.count,
      };
    });

    return {
      totalSessions: sessions.length,
      averageScore: sessions.length > 0 ? totalScore / sessions.length : 0,
      totalQuestions,
      byRole: byRoleFinal,
    };
  }

  // Delete a session by ID
  static deleteSession(id: string): void {
    try {
      const sessions = this.getAllSessions().filter(s => s.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }

  // Clear all sessions
  static clearAllSessions(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing sessions:', error);
    }
  }

  // Export sessions as JSON
  static exportSessions(): string {
    const sessions = this.getAllSessions();
    return JSON.stringify(sessions, null, 2);
  }

  // Import sessions from JSON
  static importSessions(jsonData: string): boolean {
    try {
      const imported = JSON.parse(jsonData);
      if (!Array.isArray(imported)) {
        throw new Error('Invalid format: expected array');
      }

      const existingSessions = this.getAllSessions();
      const combined = [...imported, ...existingSessions];
      
      // Remove duplicates by ID
      const unique = combined.filter((session, index, arr) => 
        arr.findIndex(s => s.id === session.id) === index
      );

      // Keep only MAX_SESSIONS
      const limited = unique.slice(0, MAX_SESSIONS);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
      return true;
    } catch (error) {
      console.error('Error importing sessions:', error);
      return false;
    }
  }

  // Get practice progress (sessions over time)
  static getPracticeProgress(): Array<{ date: string; score: number; role: string }> {
    return this.getAllSessions()
      .filter(s => s.overallScore !== undefined)
      .map(s => ({
        date: s.startTime.toISOString().split('T')[0],
        score: s.overallScore!,
        role: s.role,
      }))
      .reverse(); // Oldest first
  }
}
