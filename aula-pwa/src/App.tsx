import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { AulaDetalhes } from './pages/AulaDetalhes';
import './styles/global.css';

function App() {
  return (
    <BrowserRouter>
      <div className="App">
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/aula/:id" element={<AulaDetalhes />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
