import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BrainCircuit,
  MessageSquare,
  UploadCloud,
  FilePlus2,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowRight,
  Plus,
  Trash2,
  Info,
  Clock,
  HelpCircle,
  FolderUp,
  Cpu
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { requirementService, ExtractedRequirementPayload } from '../services/requirementService';
import { StatusBadge } from '../components/StatusBadge';
import { RequirementCategory, PriorityLevel } from '../types';

export const RequirementIntelligence: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'chat' | 'upload' | 'manual') || 'chat';
  const [activeTab, setActiveTab] = useState<'chat' | 'upload' | 'manual'>(initialTab);
  const { addRequirements, addToast } = useProject();

  // -------------------------------------------------------------
  // TAB A: Conversational State
  // -------------------------------------------------------------
  const [chatPrompt, setChatPrompt] = useState(
    'I want to develop an online shopping application. Users should register using email, log in securely, search for products and add products to their cart.'
  );
  const [isExtractingChat, setIsExtractingChat] = useState(false);
  const [chatExtracted, setChatExtracted] = useState<ExtractedRequirementPayload[] | null>(null);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);

  const handleExtractFromChat = async (promptToUse?: string) => {
    const text = promptToUse || chatPrompt;
    if (!text.trim()) return;

    setIsExtractingChat(true);
    setChatExtracted(null);
    setClarificationQuestion(null);

    try {
      const res = await requirementService.extractFromPrompt(text);
      setChatExtracted(res.data);
      setClarificationQuestion(
        'AI Clarification Suggestion: Should guest users be allowed to add products to cart before authenticating, and what is the timeout for reserved cart inventory?'
      );
    } catch {
      addToast('Extraction Error', 'Failed to extract requirements from input.', 'error');
    } finally {
      setIsExtractingChat(false);
    }
  };

  const handleSaveChatRequirements = () => {
    if (!chatExtracted) return;
    const reqsToAdd = chatExtracted.map((item) => ({
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      source: 'Conversational AI Extraction',
      extractionStatus: 'Draft' as const,
      approvalStatus: 'Draft' as const,
      actor: item.actor,
      preconditions: item.preconditions,
      acceptanceCriteria: item.acceptanceCriteria,
      author: 'AI Requirement Synthesizer',
      linkedCode: [],
      linkedTests: []
    }));

    addRequirements(reqsToAdd);
    navigate('/requirements/review');
  };

  // -------------------------------------------------------------
  // TAB B: Document Upload State
  // -------------------------------------------------------------
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isProcessingDoc, setIsProcessingDoc] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [docExtracted, setDocExtracted] = useState<ExtractedRequirementPayload[] | null>(null);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    setUploadFile(file);
    setUploadProgress(0);
    setIsProcessingDoc(true);
    setDocExtracted(null);

    // Simulate upload progress & NLP parsing stages
    setProcessingStage('Uploading document to secure sandbox...');
    let prog = 0;
    const interval = setInterval(() => {
      prog += 25;
      setUploadProgress(prog);
      if (prog === 50) setProcessingStage('Parsing document structure & headers (DOCX/PDF)...');
      if (prog === 75) setProcessingStage('Extracting functional specifications & NLP entities...');
      if (prog >= 100) {
        clearInterval(interval);
        setProcessingStage('Synthesizing structured acceptance criteria...');
        setTimeout(async () => {
          const res = await requirementService.extractFromDocument(file.name, file.size);
          setDocExtracted(res.data);
          setIsProcessingDoc(false);
        }, 600);
      }
    }, 300);
  };

  const handleSaveDocRequirements = () => {
    if (!docExtracted || !uploadFile) return;
    const reqsToAdd = docExtracted.map((item) => ({
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      source: `Document (${uploadFile.name})`,
      extractionStatus: 'Draft' as const,
      approvalStatus: 'Draft' as const,
      actor: item.actor,
      preconditions: item.preconditions,
      acceptanceCriteria: item.acceptanceCriteria,
      author: 'Doc Intelligence Extractor',
      linkedCode: [],
      linkedTests: []
    }));

    addRequirements(reqsToAdd);
    navigate('/requirements/review');
  };

  // -------------------------------------------------------------
  // TAB C: Manual Entry State
  // -------------------------------------------------------------
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualCategory, setManualCategory] = useState<RequirementCategory>('Functional');
  const [manualPriority, setManualPriority] = useState<PriorityLevel>('High');
  const [manualActor, setManualActor] = useState('Customer');
  const [manualPreconditions, setManualPreconditions] = useState('User is authenticated with active session.');
  const [acceptanceCriteriaList, setAcceptanceCriteriaList] = useState<string[]>([
    'System responds to valid inputs within 500ms.',
    'Invalid input triggers descriptive RFC-7807 problem details.'
  ]);
  const [newCriteriaText, setNewCriteriaText] = useState('');

  const handleAddCriteria = () => {
    if (!newCriteriaText.trim()) return;
    setAcceptanceCriteriaList([...acceptanceCriteriaList, newCriteriaText.trim()]);
    setNewCriteriaText('');
  };

  const handleRemoveCriteria = (index: number) => {
    setAcceptanceCriteriaList(acceptanceCriteriaList.filter((_, i) => i !== index));
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualDescription.trim()) {
      addToast('Validation Error', 'Title and description are required.', 'warning');
      return;
    }

    addRequirements([
      {
        title: manualTitle,
        description: manualDescription,
        category: manualCategory,
        priority: manualPriority,
        source: 'Manual Entry',
        extractionStatus: 'Validated',
        approvalStatus: 'Draft',
        actor: manualActor,
        preconditions: manualPreconditions,
        acceptanceCriteria: acceptanceCriteriaList,
        author: 'Devon Miller (QA Architect)',
        linkedCode: [],
        linkedTests: []
      }
    ]);

    navigate('/requirements/review');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-teal-600" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Requirement Intelligence</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Capture, synthesize, and structure requirements from conversational prompts, SRS documents, or engineering specifications.
          </p>
        </div>

        {/* Prototype Banner */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium">
          <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <span>Demonstration Mode: Simulated AI Extraction Engine</span>
        </div>
      </div>

      {/* 3 Tab Navigation Pills */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl max-w-lg border border-slate-200">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'chat'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
          <span>A. Conversational AI</span>
        </button>

        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'upload'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
          <span>B. Document Upload</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'manual'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FilePlus2 className="w-3.5 h-3.5 text-indigo-600" />
          <span>C. Manual Entry</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB A: Conversational Requirement Collection                  */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chat input panel */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" /> Natural Language Requirements
                </span>
                <span className="text-[11px] text-slate-400">ReqTrace NLP Parser</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Describe software features or business user stories. ReqTrace AI automatically extracts atomic requirement IDs, categories, and testable acceptance criteria.
              </p>

              {/* Sample Prompts */}
              <div className="space-y-1.5 mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Try Sample Project Prompts:
                </span>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      const p = 'I want to develop an online shopping application. Users should register using email, log in securely, search for products and add products to their cart.';
                      setChatPrompt(p);
                      handleExtractFromChat(p);
                    }}
                    className="text-left text-xs p-2 rounded-lg bg-slate-50 hover:bg-teal-50/60 border border-slate-200 hover:border-teal-200 text-slate-700 transition-colors"
                  >
                    🛒 <strong>E-Commerce Core:</strong> Register with email, log in securely, search products, and add to cart.
                  </button>
                  <button
                    onClick={() => {
                      const p = 'The banking system requires mandatory two-person dual authorization for any wire transfer exceeding $50,000, with encrypted SMS OTP validation and immutable audit ledger streaming.';
                      setChatPrompt(p);
                      handleExtractFromChat(p);
                    }}
                    className="text-left text-xs p-2 rounded-lg bg-slate-50 hover:bg-teal-50/60 border border-slate-200 hover:border-teal-200 text-slate-700 transition-colors"
                  >
                    🔒 <strong>Banking Security:</strong> Dual authorization for wire transfers &gt; $50k with SMS OTP and audit ledger.
                  </button>
                </div>
              </div>

              {/* Chat Textarea */}
              <div className="relative">
                <textarea
                  rows={5}
                  value={chatPrompt}
                  onChange={(e) => setChatPrompt(e.target.value)}
                  placeholder="e.g. Describe the feature: Users should be able to reset their password using a time-limited magic link..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-medium text-slate-800"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                {chatPrompt.length} characters • Ready to parse
              </span>
              <button
                disabled={isExtractingChat || !chatPrompt.trim()}
                onClick={() => handleExtractFromChat()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {isExtractingChat ? (
                  <>
                    <Cpu className="w-3.5 h-3.5 animate-spin" />
                    <span>Extracting Requirements...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Extract Requirements</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Extracted preview panel */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm text-slate-900">Extracted Requirements Preview</h3>
                {chatExtracted && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
                    {chatExtracted.length} Extracted
                  </span>
                )}
              </div>

              {isExtractingChat && (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-teal-600 border-t-transparent animate-spin mb-3" />
                  <div className="text-sm font-semibold text-slate-800">Synthesizing Requirements...</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Analyzing domain entities, role actors, and acceptance criteria
                  </div>
                </div>
              )}

              {!isExtractingChat && !chatExtracted && (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
                  <BrainCircuit className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <div className="text-xs font-semibold text-slate-600">No Requirements Extracted Yet</div>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-1">
                    Type or select a sample prompt on the left and click "Extract Requirements".
                  </p>
                </div>
              )}

              {!isExtractingChat && chatExtracted && (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {chatExtracted.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded">
                            REQ-00{idx + 1}
                          </span>
                          <span className="font-semibold text-xs text-slate-900">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={item.category} type="category" />
                          <StatusBadge status={item.priority} type="priority" />
                        </div>
                      </div>
                      <p className="text-xs text-slate-600">{item.description}</p>
                      
                      {/* Acceptance criteria */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Acceptance Criteria:
                        </span>
                        {item.acceptanceCriteria.map((c, ci) => (
                          <div key={ci} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* AI Clarification Questions */}
                  {clarificationQuestion && (
                    <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                      <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">AI Clarification Suggestion:</span>
                        <p className="mt-0.5 text-amber-800">{clarificationQuestion}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {chatExtracted && !isExtractingChat && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Ready to send to baseline review
                </span>
                <button
                  onClick={handleSaveChatRequirements}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save as Draft & Open Review</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB B: Document Upload                                        */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-blue-600" /> Specification Document Ingestion
                </span>
                <span className="text-[11px] text-slate-400">PDF / DOCX</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Upload your Software Requirement Specification (SRS), Product Requirements Document (PRD), or Compliance Audit document to automatically parse requirements.
              </p>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className="border-2 border-dashed border-slate-300 hover:border-teal-500 bg-slate-50/60 hover:bg-teal-50/20 rounded-2xl p-8 text-center cursor-pointer transition-colors relative"
              >
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleFileInput}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <FolderUp className="w-10 h-10 text-teal-600 mx-auto mb-2" />
                <div className="font-semibold text-xs text-slate-800">
                  Click to select or drag and drop document here
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Supported formats: PDF, DOCX, TXT (up to 25MB)
                </div>
              </div>

              {/* Sample Document Quick Picker */}
              <div className="mt-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Or Test with Sample Document:
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const mockF = new File(['SRS FinSecure'], 'SRS_FinSecure_Core_v2.4.pdf', {
                        type: 'application/pdf'
                      });
                      processSelectedFile(mockF);
                    }}
                    className="flex-1 text-left p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 text-xs text-slate-700 transition-colors"
                  >
                    📄 <strong>SRS_FinSecure_Core_v2.4.pdf</strong> (1.4 MB)
                  </button>
                  <button
                    onClick={() => {
                      const mockF = new File(['Compliance Spec'], 'Security_Compliance_2026.docx', {
                        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                      });
                      processSelectedFile(mockF);
                    }}
                    className="flex-1 text-left p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 text-xs text-slate-700 transition-colors"
                  >
                    📑 <strong>Security_Compliance_2026.docx</strong> (840 KB)
                  </button>
                </div>
              </div>

              {/* Progress and status */}
              {isProcessingDoc && (
                <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                    <span>{processingStage}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-teal-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Target File: {uploadFile?.name}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Security: Scanned in zero-trust memory buffer</span>
              <span>AES-256</span>
            </div>
          </div>

          {/* Doc Extracted Preview */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm text-slate-900">Extracted Document Specifications</h3>
                {docExtracted && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {docExtracted.length} Parsed
                  </span>
                )}
              </div>

              {!docExtracted && !isProcessingDoc && (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <div className="text-xs font-semibold text-slate-600">No Document Uploaded Yet</div>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-1">
                    Select a document on the left to extract enterprise requirements.
                  </p>
                </div>
              )}

              {docExtracted && (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {docExtracted.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded">
                            DOC-REQ-{idx + 1}
                          </span>
                          <span className="font-semibold text-xs text-slate-900">{item.title}</span>
                        </div>
                        <StatusBadge status={item.category} type="category" />
                      </div>
                      <p className="text-xs text-slate-600">{item.description}</p>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/70 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Acceptance Criteria:
                        </span>
                        {item.acceptanceCriteria.map((c, ci) => (
                          <div key={ci} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{c}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {docExtracted && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Ready to add to project review table
                </span>
                <button
                  onClick={handleSaveDocRequirements}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save as Draft & Open Review</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB C: Manual Requirement Entry                               */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'manual' && (
        <form
          onSubmit={handleManualSubmit}
          className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-sm max-w-4xl space-y-5"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Manual Requirement Authoring</h3>
              <p className="text-xs text-slate-500">Structured form input adhering to IEEE 830 standard</p>
            </div>
            <span className="text-xs font-mono text-slate-400">Author: Devon Miller</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Requirement Title *
              </label>
              <input
                type="text"
                required
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Granular API Key Rate Limiting by Tenant Tier"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value as RequirementCategory)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                >
                  <option value="Functional">Functional</option>
                  <option value="Non-Functional">Non-Functional</option>
                  <option value="Security">Security</option>
                  <option value="Performance">Performance</option>
                  <option value="Usability">Usability</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Priority</label>
                <select
                  value={manualPriority}
                  onChange={(e) => setManualPriority(e.target.value as PriorityLevel)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Detailed Description *
            </label>
            <textarea
              rows={3}
              required
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="Provide complete specification of the behavior, payload expectations, and system state transitions..."
              className="w-full text-xs p-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Primary Actor</label>
              <input
                type="text"
                value={manualActor}
                onChange={(e) => setManualActor(e.target.value)}
                placeholder="e.g. Registered Customer / Compliance Auditor"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Preconditions</label>
              <input
                type="text"
                value={manualPreconditions}
                onChange={(e) => setManualPreconditions(e.target.value)}
                placeholder="e.g. User session active, database connection verified"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200"
              />
            </div>
          </div>

          {/* Acceptance Criteria multi-list */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Acceptance Criteria ({acceptanceCriteriaList.length})
            </label>
            <div className="space-y-2 mb-2">
              {acceptanceCriteriaList.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="text-slate-800">{c}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCriteria(i)}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newCriteriaText}
                onChange={(e) => setNewCriteriaText(e.target.value)}
                placeholder="Add verifiable acceptance criteria (e.g. Returns HTTP 429 when quota exceeded)..."
                className="flex-1 text-xs p-2 rounded-lg border border-slate-200"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCriteria();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddCriteria}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Directly integrates into Baseline Review workflow
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate('/requirements/review')}
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save Requirement to Review</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
