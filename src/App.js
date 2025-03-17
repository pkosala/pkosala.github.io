// src/App.js
import './App.css';
import CollapsibleTree from './components/CollapsibleTree';

function App() {
  return (
    <div className="App">
      <h1 className="text-center font-bold text-xl p-4">Taxonomy visualization</h1>
      <CollapsibleTree />
    </div>
  );
}

export default App;
