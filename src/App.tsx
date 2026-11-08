import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProjectProvider } from './context/ProjectContext';
import { MainLayout } from './layouts/MainLayout';

// Pages
import { Dashboard } from './pages/Dashboard';
import { RequirementIntelligence } from './pages/RequirementIntelligence';
import { RequirementReview } from './pages/RequirementReview';
import { ProjectMemoryVault } from './pages/ProjectMemoryVault';
import { ContradictionDrift } from './pages/ContradictionDrift';
import { TraceabilityExplorer } from './pages/TraceabilityExplorer';
import { TestIntelligence } from './pages/TestIntelligence';
import { AIAssistant } from './pages/AIAssistant';

export default function App() {
  return (
    <ProjectProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Navigate to="/" replace />} />
            <Route path="requirements/intelligence" element={<RequirementIntelligence />} />
            <Route path="requirements/review" element={<RequirementReview />} />
            <Route path="memory-vault" element={<ProjectMemoryVault />} />
            <Route path="analysis/contradictions" element={<ContradictionDrift />} />
            <Route path="traceability" element={<TraceabilityExplorer />} />
            <Route path="test-intelligence" element={<TestIntelligence />} />
            <Route path="ai-assistant" element={<AIAssistant />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProjectProvider>
  );
}
