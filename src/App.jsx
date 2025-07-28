import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

const MAP_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || "token info here"
import { baseSource, masterSource } from './map'; 
import { AltadenaMap } from 'altadena-map';


function App() {
  const [user, setUser] = useState({})

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <AltadenaMap MAP_TOKEN={MAP_TOKEN} BASE_SOURCE={baseSource} MASTER_SOURCE={masterSource} user={user} />
    </>
  )
}

export default App
