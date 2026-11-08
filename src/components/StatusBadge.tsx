import React from 'react';
import {
  ApprovalStatus,
  PriorityLevel,
  RequirementCategory,
  TestStatus,
  FindingStatus,
  FindingSeverity
} from '../types';

interface StatusBadgeProps {
  status?: ApprovalStatus | TestStatus | FindingStatus | string;
  type?: 'approval' | 'test' | 'priority' | 'category' | 'finding' | 'severity';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type = 'approval',
  className = ''
}) => {
  if (!status) return null;

  let bgClass = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotClass = 'bg-slate-400';

  if (type === 'approval') {
    switch (status as ApprovalStatus) {
      case 'Approved':
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        dotClass = 'bg-emerald-500';
        break;
      case 'Under Review':
        bgClass = 'bg-amber-50 text-amber-700 border-amber-200';
        dotClass = 'bg-amber-500';
        break;
      case 'Draft':
        bgClass = 'bg-slate-100 text-slate-600 border-slate-300';
        dotClass = 'bg-slate-400';
        break;
      case 'Rejected':
        bgClass = 'bg-rose-50 text-rose-700 border-rose-200';
        dotClass = 'bg-rose-500';
        break;
    }
  } else if (type === 'test') {
    switch (status as TestStatus) {
      case 'Passed':
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        dotClass = 'bg-emerald-500';
        break;
      case 'Failed':
        bgClass = 'bg-rose-50 text-rose-700 border-rose-200';
        dotClass = 'bg-rose-500';
        break;
      case 'Running':
        bgClass = 'bg-sky-50 text-sky-700 border-sky-200 animate-pulse';
        dotClass = 'bg-sky-500';
        break;
      case 'Pending':
        bgClass = 'bg-amber-50 text-amber-700 border-amber-200';
        dotClass = 'bg-amber-400';
        break;
    }
  } else if (type === 'priority' || type === 'severity') {
    switch (status as PriorityLevel | FindingSeverity) {
      case 'Critical':
        bgClass = 'bg-rose-50 text-rose-800 border-rose-300 font-semibold';
        dotClass = 'bg-rose-600';
        break;
      case 'High':
        bgClass = 'bg-orange-50 text-orange-800 border-orange-200';
        dotClass = 'bg-orange-500';
        break;
      case 'Medium':
        bgClass = 'bg-blue-50 text-blue-700 border-blue-200';
        dotClass = 'bg-blue-500';
        break;
      case 'Low':
        bgClass = 'bg-slate-100 text-slate-600 border-slate-200';
        dotClass = 'bg-slate-400';
        break;
    }
  } else if (type === 'category') {
    switch (status as RequirementCategory) {
      case 'Security':
        bgClass = 'bg-purple-50 text-purple-700 border-purple-200';
        dotClass = 'bg-purple-500';
        break;
      case 'Functional':
        bgClass = 'bg-cyan-50 text-cyan-800 border-cyan-200';
        dotClass = 'bg-cyan-500';
        break;
      case 'Performance':
        bgClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        dotClass = 'bg-indigo-500';
        break;
      case 'Non-Functional':
        bgClass = 'bg-teal-50 text-teal-800 border-teal-200';
        dotClass = 'bg-teal-500';
        break;
      case 'Usability':
        bgClass = 'bg-amber-50 text-amber-800 border-amber-200';
        dotClass = 'bg-amber-500';
        break;
    }
  } else if (type === 'finding') {
    switch (status as FindingStatus) {
      case 'Valid Conflict':
        bgClass = 'bg-rose-50 text-rose-700 border-rose-300';
        dotClass = 'bg-rose-500';
        break;
      case 'Open':
        bgClass = 'bg-amber-50 text-amber-700 border-amber-300';
        dotClass = 'bg-amber-500';
        break;
      case 'Resolved':
        bgClass = 'bg-emerald-50 text-emerald-700 border-emerald-300';
        dotClass = 'bg-emerald-500';
        break;
      case 'False Positive':
        bgClass = 'bg-slate-100 text-slate-600 border-slate-300';
        dotClass = 'bg-slate-400';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${bgClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></span>
      {status}
    </span>
  );
};
