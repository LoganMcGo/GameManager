import React from 'react';

function Sidebar({ currentPage, setCurrentPage, onNavigate }) {
  // Function to handle navigation
  const navigate = (page) => {
    if (onNavigate) {
      onNavigate(page);
    } else {
      setCurrentPage(page);
    }
    
    // Trigger library refresh when navigating to library
    if (page === 'library') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('libraryRefresh'));
      }, 50);
    }
  };

  return (
    <div className="responsive-sidebar bg-gray-800 text-white h-full flex flex-col transition-all duration-300">
      {/* App Logo Section */}
      <div className="p-2 sm:p-3 md:p-4 flex items-center space-x-3 border-b border-gray-700">
        <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z"></path>
          </svg>
        </div>
        <div className="hidden md:block min-w-0 flex-1">
          <div className="font-medium truncate">Game Launcher</div>
          <div className="text-xs text-gray-400">Free Games</div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-2 sm:p-3 md:p-4">
        <div className="mb-4 md:mb-6">
          <ul className="space-y-1">
            <li>
              <button 
                onClick={() => navigate('home')}
                className={`flex items-center py-2 px-2 md:px-3 rounded w-full text-left transition-colors group ${
                  currentPage === 'home' 
                    ? 'bg-gray-700 text-white' 
                    : 'hover:bg-gray-700 text-gray-300 hover:text-white'
                }`}
                title="Home"
              >
                <svg className="w-5 h-5 md:mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                </svg>
                <span className="hidden md:block">Home</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => navigate('library')}
                className={`flex items-center py-2 px-2 md:px-3 rounded w-full text-left transition-colors group ${
                  currentPage === 'library' 
                    ? 'bg-gray-700 text-white' 
                    : 'hover:bg-gray-700 text-gray-300 hover:text-white'
                }`}
                title="Library"
              >
                <svg className="w-5 h-5 md:mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253"></path>
                </svg>
                <span className="hidden md:block">Library</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => navigate('downloads')}
                className={`flex items-center py-2 px-2 md:px-3 rounded w-full text-left transition-colors group ${
                  currentPage === 'downloads' 
                    ? 'bg-gray-700 text-white' 
                    : 'hover:bg-gray-700 text-gray-300 hover:text-white'
                }`}
                title="Downloads"
              >
                <svg className="w-5 h-5 md:mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                <span className="hidden md:block">Downloads</span>
              </button>
            </li>
            <li>
              <button 
                onClick={() => navigate('settings')}
                className={`flex items-center py-2 px-2 md:px-3 rounded w-full text-left transition-colors group ${
                  currentPage === 'settings' 
                    ? 'bg-gray-700 text-white' 
                    : 'hover:bg-gray-700 text-gray-300 hover:text-white'
                }`}
                title="Settings"
              >
                <svg className="w-5 h-5 md:mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                </svg>
                <span className="hidden md:block">Settings</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  );
}

export default Sidebar;
