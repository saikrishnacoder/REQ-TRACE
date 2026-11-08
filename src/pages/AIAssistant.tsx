import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  HelpCircle,
  FileCheck2,
  AlertTriangle,
  TestTube2,
  Code2,
  ArrowRight,
  ShieldCheck,
  Activity,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { assistantService, DiagnosticAnswer } from '../services/assistantService';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  diagnosticData?: DiagnosticAnswer;
}

export const AIAssistant: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useProject();

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'assistant',
      text: 'Hello Devon! I am your ReqTrace AI Software Quality and Traceability Architect. You can ask me diagnostic questions about requirements, contradictions, code linkages, and failed PyTests—or use voice commands.',
      timestamp: '07:35 UTC',
      diagnosticData: {
        summary: 'ReqTrace AI diagnostic intelligence engine is active for FinSecure Digital Banking Platform (Baseline v2.4).',
        supportingData: {
          requirementIds: ['REQ-012', 'REQ-019'],
          contradictionIds: ['FND-101'],
          testCaseIds: ['TC-105', 'TC-110']
        },
        recommendation: 'Ask me to inspect contradictory requirements or missing test cases to begin.',
        confidenceScore: 0.99
      }
    }
  ]);

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceHistory, setVoiceHistory] = useState<string[]>([
    'Show all contradictory requirements.',
    'Explain the latest failed test.'
  ]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const sampleQuestions = [
    'Which requirements have no test cases?',
    'Show all contradictory requirements.',
    'Why is REQ-012 marked as potentially impacted?',
    'Which code elements are linked to this requirement?',
    'Explain the latest failed test.',
    'What should be reviewed before approving this requirement?',
    'Summarise project health.'
  ];

  const handleSend = async (queryText?: string) => {
    const q = queryText || inputQuery;
    if (!q.trim()) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9),
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await assistantService.askDiagnostic(q);
      const assistantMsg: ChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        sender: 'assistant',
        text: res.data.summary,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        diagnosticData: res.data
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      addToast('Diagnostic Error', 'Failed to retrieve AI analysis.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Voice Interaction Simulation
  const handleToggleVoice = () => {
    if (isListening) {
      setIsListening(false);
    } else {
      setIsListening(true);
      setVoiceTranscript('Listening... Speak a QA diagnostic query...');

      // Simulate recognition after 2.5 seconds
      const sample = sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];
      setTimeout(() => {
        setVoiceTranscript(sample);
        setVoiceHistory((prev) => [sample, ...prev]);
        setIsListening(false);
        handleSend(sample);
      }, 2600);
    }
  };

  // Text to Speech playback
  const handlePlayTTS = (text: string) => {
    if ('speechSynthesis' in window) {
      if (isPlayingAudio) {
        window.speechSynthesis.cancel();
        setIsPlayingAudio(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsPlayingAudio(true);
      setTimeout(() => setIsPlayingAudio(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              AI Diagnostic & Voice Assistant
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise QA reasoning engine. Query requirement blind spots, semantic contradictions, and PyTest execution traces via text or voice.
          </p>
        </div>

        {/* Backend connector badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
          <span>LLM Diagnostic Reasoning: Grounded on Baseline v2.4</span>
        </div>
      </div>

      {/* Main Split Layout: Diagnostic Chat (Left) + Voice Interaction Console (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Conversational AI Diagnostic Workbench */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/90 shadow-sm flex flex-col h-[700px] overflow-hidden">
          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-teal-400 flex items-center justify-center border border-teal-500/30 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-xs space-y-2.5 ${
                    msg.sender === 'user'
                      ? 'bg-teal-600 text-white rounded-br-none'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-none shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 pb-1">
                    <span className="font-bold text-[11px] opacity-80">
                      {msg.sender === 'user' ? 'Devon Miller (QA Architect)' : 'ReqTrace QA Diagnostic'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] opacity-70 font-mono">{msg.timestamp}</span>
                      {msg.sender === 'assistant' && (
                        <button
                          onClick={() => handlePlayTTS(msg.text)}
                          className="text-slate-400 hover:text-teal-600 p-0.5"
                          title="Read out loud"
                        >
                          {isPlayingAudio ? (
                            <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="leading-relaxed text-xs">{msg.text}</p>

                  {/* Diagnostic Artifact Data Cards */}
                  {msg.diagnosticData && (
                    <div className="space-y-2 pt-2 border-t border-slate-200/80">
                      {/* Supporting IDs Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        {msg.diagnosticData.supportingData.requirementIds &&
                          msg.diagnosticData.supportingData.requirementIds.length > 0 && (
                            <div className="p-2 rounded bg-white border border-slate-200">
                              <span className="font-bold text-slate-500 uppercase text-[9px] block mb-1">
                                Referenced Requirements:
                              </span>
                              <div className="flex flex-wrap gap-1 font-mono">
                                {msg.diagnosticData.supportingData.requirementIds.map((rid) => (
                                  <button
                                    key={rid}
                                    onClick={() => navigate('/requirements/review')}
                                    className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-bold hover:bg-teal-100"
                                  >
                                    {rid}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                        {msg.diagnosticData.supportingData.codeReferences &&
                          msg.diagnosticData.supportingData.codeReferences.length > 0 && (
                            <div className="p-2 rounded bg-white border border-slate-200">
                              <span className="font-bold text-slate-500 uppercase text-[9px] block mb-1">
                                Referenced Source Code:
                              </span>
                              <div className="space-y-0.5 font-mono text-[10px] text-purple-900 truncate">
                                {msg.diagnosticData.supportingData.codeReferences.map((c, ci) => (
                                  <div key={ci} className="truncate">
                                    {c}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        {msg.diagnosticData.supportingData.testCaseIds &&
                          msg.diagnosticData.supportingData.testCaseIds.length > 0 && (
                            <div className="p-2 rounded bg-white border border-slate-200">
                              <span className="font-bold text-slate-500 uppercase text-[9px] block mb-1">
                                Impacted Tests:
                              </span>
                              <div className="flex flex-wrap gap-1 font-mono">
                                {msg.diagnosticData.supportingData.testCaseIds.map((tid) => (
                                  <button
                                    key={tid}
                                    onClick={() => navigate('/test-intelligence')}
                                    className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold hover:bg-indigo-100"
                                  >
                                    {tid}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                        {msg.diagnosticData.supportingData.contradictionIds &&
                          msg.diagnosticData.supportingData.contradictionIds.length > 0 && (
                            <div className="p-2 rounded bg-white border border-slate-200">
                              <span className="font-bold text-slate-500 uppercase text-[9px] block mb-1">
                                Contradiction Findings:
                              </span>
                              <div className="flex flex-wrap gap-1 font-mono">
                                {msg.diagnosticData.supportingData.contradictionIds.map((fid) => (
                                  <button
                                    key={fid}
                                    onClick={() => navigate('/analysis/contradictions')}
                                    className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold hover:bg-rose-100"
                                  >
                                    {fid}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>

                      {/* Actionable Recommendation */}
                      <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200 text-teal-900 text-xs flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block mb-0.5">Recommended Action:</strong>
                          {msg.diagnosticData.recommendation}
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span>Confidence: {Math.round(msg.diagnosticData.confidenceScore * 100)}%</span>
                        <span>Source: AST & Semantic Heuristics</span>
                      </div>
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    DM
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 w-fit">
                <div className="w-3 h-3 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
                <span>ReqTrace AI analyzing project graphs and AST references...</span>
              </div>
            )}
          </div>

          {/* Quick Question Clickers */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 overflow-x-auto whitespace-nowrap space-x-1.5 flex items-center">
            <span className="text-[10px] font-bold uppercase text-slate-400 px-2 shrink-0">
              Quick Queries:
            </span>
            {sampleQuestions.slice(0, 4).map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white hover:bg-teal-50 border border-slate-200 text-slate-700 font-medium shrink-0 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder="Ask QA diagnostic question (e.g. Which requirements have no test cases?)..."
              className="flex-1 text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <button
              onClick={() => handleSend()}
              disabled={!inputQuery.trim() || isLoading}
              className="px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </div>

        {/* Right Column: Voice Interaction & Telemetry Console */}
        <div className="lg:col-span-4 space-y-4">
          {/* Voice Interface Card */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 space-y-4 text-center">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-left">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Voice QA Commander</h3>
                <p className="text-[11px] text-slate-500">Hands-free engineer voice query system</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Web Speech / Whisper Ready
              </span>
            </div>

            {/* Central Animated Microphone */}
            <div className="py-4 flex flex-col items-center justify-center">
              <button
                onClick={handleToggleVoice}
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all transform hover:scale-105 ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse ring-8 ring-rose-200'
                    : 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white hover:from-teal-600 hover:to-emerald-700'
                }`}
                title={isListening ? 'Click to stop listening' : 'Click to start voice command'}
              >
                {isListening ? <Mic className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>

              <div className="mt-3">
                <span
                  className={`text-xs font-bold ${
                    isListening ? 'text-rose-600' : 'text-slate-700'
                  }`}
                >
                  {isListening ? 'Listening to speech...' : 'Click microphone to speak'}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Microphone input connects to speech-to-intent classifier
                </p>
              </div>
            </div>

            {/* Speech Transcript Display */}
            {voiceTranscript && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Detected Speech Transcript:
                </span>
                <p className="text-xs font-mono text-slate-800 font-medium">
                  "{voiceTranscript}"
                </p>
              </div>
            )}

            {/* Voice Control Buttons */}
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100">
              {isListening && (
                <button
                  onClick={() => setIsListening(false)}
                  className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1"
                >
                  <MicOff className="w-3.5 h-3.5" /> Stop Listening
                </button>
              )}
            </div>
          </div>

          {/* Sample Voice Commands Trigger List */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 space-y-3">
            <span className="font-bold text-xs text-slate-900 block">
              Sample Voice Demonstration Commands:
            </span>
            <div className="space-y-1.5">
              {[
                'Show missing test cases.',
                'Find contradictory requirements.',
                'Explain this failed test.',
                'Summarise project health.'
              ].map((cmd, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setVoiceTranscript(cmd);
                    handleSend(cmd);
                  }}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 text-xs text-slate-700 transition-colors flex items-center justify-between group"
                >
                  <span className="font-medium">"{cmd}"</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-600 transition-colors" />
                </button>
              ))}
            </div>
          </div>

          {/* Recent Voice Command History */}
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 space-y-2">
            <span className="font-bold text-xs text-slate-900 block">
              Recent Voice Command History:
            </span>
            <div className="space-y-1 font-mono text-[11px] text-slate-500">
              {voiceHistory.slice(0, 3).map((vh, vi) => (
                <div key={vi} className="flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                  <span className="truncate">{vh}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
