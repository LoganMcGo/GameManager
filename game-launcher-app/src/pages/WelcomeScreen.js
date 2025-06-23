import React, { useState } from 'react';

function WelcomeScreen({ onComplete }) {
  const [step, setStep] = useState('welcome');

  const handleComplete = () => {
    // Skip directly to completion since no authentication needed
    onComplete();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl mx-auto text-center">
        {step === 'welcome' && (
          <>
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto mb-6 bg-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h1 className="text-4xl font-bold mb-4">Welcome to Game Manager</h1>
              <p className="text-xl text-gray-400 mb-8">
                Your all-in-one solution for discovering, downloading, and managing games
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-4 bg-green-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">Discover Games</h3>
                <p className="text-gray-400">Browse and search through thousands of games with detailed information and ratings</p>
              </div>

              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-4 bg-blue-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">Easy Downloads</h3>
                <p className="text-gray-400">Seamlessly download games with automatic Real-Debrid integration</p>
              </div>

              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-4 bg-purple-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">Game Library</h3>
                <p className="text-gray-400">Organize and launch your games from a centralized library</p>
              </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg mb-8">
              <h3 className="text-lg font-semibold mb-4">Ready to Get Started</h3>
              <p className="text-gray-400 mb-4">
                Game Manager is now ready to use! All services are configured automatically.
              </p>
              <ul className="text-left max-w-md mx-auto space-y-2 text-gray-400">
                <li className="flex items-center">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Game database automatically connected
                </li>
                <li className="flex items-center">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Real-Debrid service ready for downloads
                </li>
                <li className="flex items-center">
                  <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Download manager configured
                </li>
              </ul>
            </div>

            <button
              onClick={handleComplete}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xl py-3 px-8 rounded-md transition-colors duration-300"
            >
              Start Using Game Manager
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default WelcomeScreen;
