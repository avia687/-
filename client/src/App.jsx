import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CustomerPage from './pages/CustomerPage';
import ChefPage from './pages/ChefPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CustomerPage />} />
        <Route path="/chef" element={<ChefPage />} />
      </Routes>
    </BrowserRouter>
  );
}
