import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function WelcomeScreen({ onComplete }) {
  const { startAuthFlow, checkAuthFlowStatus } = useAuth();
  const [step, setStep] = useState('welcome');
  const [authFlow, setAuthFlow] = useState(null);
  const [error, setError] = useState(null);

  // Start the Real Debrid authentication flow
  const handleStartAuthFlow = async () => {
    setStep('connecting');
    setError(null);
    
    try {
      const authData = await startAuthFlow();
      setAuthFlow(authData);
      setStep('authentication');
      
      // Start polling for authentication status with a longer initial interval
      let pollInterval = 8000; // Start with 8 seconds
      let pollCount = 0;
      
      const startPolling = () => {
        const poll = setInterval(async () => {
          try {
            pollCount++;
            const status = await checkAuthFlowStatus();
            
            if (status.status === 'authenticated') {
              clearInterval(poll);
              setStep('success');
              setTimeout(() => {
                onComplete();
              }, 2000);
            } else if (status.status === 'error') {
              clearInterval(poll);
              setError(status.message || 'Authentication failed');
              setStep('error');
            } else if (status.status === 'expired') {
              clearInterval(poll);
              setError('Authentication code expired. Please try again.');
              setStep('error');
            } else if (status.status === 'rate_limited') {
              // Increase polling interval when rate limited
              clearInterval(poll);
              setError('Rate limited. Waiting longer before next attempt...');
              setTimeout(() => {
                setError(null);
                pollInterval = Math.min(pollInterval * 1.5, 30000); // Increase interval, max 30 seconds
                startPolling();
              }, 15000); // Wait 15 seconds before resuming
            }
            
            // Gradually increase polling interval to be more respectful
            if (pollCount > 5) {
              clearInterval(poll);
              pollInterval = Math.min(pollInterval + 2000, 15000); // Increase by 2 seconds, max 15 seconds
              pollCount = 0;
              startPolling();
            }
          } catch (err) {
            console.error('Error polling auth status:', err);
            clearInterval(poll);
            setError('Authentication failed');
            setStep('error');
          }
        }, pollInterval);

        // Clear polling after the device code expires (30 minutes)
        setTimeout(() => {
          clearInterval(poll);
          if (step === 'authentication') {
            setError('Authentication code expired. Please try again.');
            setStep('error');
          }
        }, 30 * 60 * 1000);
      };
      
      startPolling();

    } catch (err) {
      console.error('Error starting auth flow:', err);
      setError('Failed to start authentication. Please try again.');
      setStep('error');
    }
  };

  // Open verification URL
  const openVerificationUrl = () => {
    if (authFlow?.verificationUrl) {
      window.open(authFlow.verificationUrl, '_blank');
    }
  };

  // Skip authentication for now
  const skipAuth = () => {
    onComplete();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8">
        {step === 'welcome' && (
          <>
            <h1 className="text-3xl font-bold mb-6 text-center">Welcome to Game Launcher</h1>
            <p className="mb-6 text-gray-300">
              To get started, you'll need to connect your Real-Debrid account. This will allow you to download games using Real-Debrid's premium services.
            </p>
            <div className="flex flex-col space-y-4">
              <button
                onClick={handleStartAuthFlow}
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-300"
              >
                Connect to Real-Debrid
              </button>
              <button
                onClick={skipAuth}
                className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-md transition-colors duration-300"
              >
                Skip for Now
              </button>
            </div>
          </>
        )}

        {step === 'connecting' && (
          <>
            <h1 className="text-3xl font-bold mb-6 text-center">Connecting...</h1>
            <div className="mb-6">
              <p className="mb-4 text-gray-300 text-center">
                Starting Real-Debrid authentication...
              </p>
            </div>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          </>
        )}

        {step === 'authentication' && authFlow && (
          <>
            <h1 className="text-3xl font-bold mb-6 text-center">Authentication Required</h1>
            <div className="bg-gray-700 p-4 rounded-md mb-6">
              <p className="text-center text-lg font-bold text-blue-400 mb-2">
                Code: {authFlow.userCode}
              </p>
              <p className="text-center text-sm text-gray-400 mb-4">
                Enter this code on the Real-Debrid verification page
              </p>
              <div className="flex justify-center mb-4">
                <button
                  onClick={openVerificationUrl}
                  className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md transition-colors duration-300"
                >
                  Open Verification Page
                </button>
              </div>
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mr-3"></div>
                <p className="text-sm text-gray-400">
                  Waiting for authentication...
                </p>
              </div>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500 mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h1 className="text-3xl font-bold mb-4">Connected Successfully!</h1>
              <p className="text-gray-300 mb-6">Your Real-Debrid account has been connected.</p>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500 mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </div>
              <h1 className="text-3xl font-bold mb-4">Connection Error</h1>
              <p className="text-gray-300 mb-6">{error}</p>
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => setStep('welcome')}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-300"
                >
                  Try Again
                </button>
                <button
                  onClick={skipAuth}
                  className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-md transition-colors duration-300"
                >
                  Skip for Now
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default WelcomeScreen;
