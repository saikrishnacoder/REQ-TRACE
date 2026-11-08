import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  FilePlus2,
  UploadCloud,
  SearchCode,
  TestTube2,
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickActionModal: React.FC<QuickActionModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { addToast } = useProject();

  if (!isOpen) return null;

  const actions = [
    {
      title: 'Conversational Requirement Extraction',
      description: 'Describe functional capabilities in natural language and let AI extract structured requirements with acceptance criteria.',
      icon: Sparkles,
      color: 'teal',
      onClick: () => {
        navigate('/requirements/intelligence?tab=chat');
        onClose();
      }
    },
    {
      title: 'Upload Specification Document (PDF / DOCX)',
      description: 'Drop in Software Requirements Specifications (SRS), PRD, or architecture documents to parse compliance requirements.',
      icon: UploadCloud,
      color: 'blue',
      onClick: () => {
        navigate('/requirements/intelligence?tab=upload');
        onClose();
      }
    },
    {
      title: 'Execute Contradiction & Drift Scan',
      description: 'Run deep semantic analysis across all active requirements to catch conflicting policies and test drift.',
      icon: ShieldAlert,
      color: 'amber',
      onClick: () => {
        addToast('Analysis Initiated', 'Running deep semantic contradiction scan across all baseline requirements...', 'info');
        navigate('/analysis/contradictions');
        onClose();
      }
    },
    {
      title: 'Auto-Generate PyTest Scenarios',
      description: 'Generate positive, negative, boundary, and permission test scenarios for approved requirements.',
      icon: TestTube2,
      color: 'indigo',
      onClick: () => {
        navigate('/test-intelligence');
        onClose();
      }
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900">Quick Actions</h3>
            <p className="text-xs text-slate-500">Initiate core ReqTrace AI workflows in one click</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          {actions.map((act, i) => (
            <div
              key={i}
              onClick={act.onClick}
              className="p-3.5 rounded-xl border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50 cursor-pointer flex items-center justify-between group transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-100 group-hover:scale-105 transition-transform">
                  <act.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-slate-900 group-hover:text-teal-700 transition-colors">
                    {act.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">{act.description}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-3" />
            </div>
          ))}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between items-center">
          <span>Enterprise QA Workflow Engine</span>
          <span className="font-mono text-slate-400">ReqTrace v2.4</span>
        </div>
      </div>
    </div>
  );
};
