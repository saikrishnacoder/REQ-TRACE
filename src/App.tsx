import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SpecForgePortal } from './components/SpecForgePortal';

export default function App() {
  return <BrowserRouter>
    <Routes>
      <Route path="*" element={<SpecForgePortal />} />
    </Routes>
  </BrowserRouter>;
}
