import React, { useState } from 'react';
import { useLibrary } from '../context/LibraryContext';
import gameDownloadService from '../services/gameDownloadService';

// Game card component for displaying game information
function GameCard({ game, size = 'small', onClick }) {
  const { addToLibrary, isInLibrary, toggleFavorite, isFavorited } = useLibrary();
  const [downloadStatus, setDownloadStatus] = useState(null);
  
  // Determine if the game has an image URL
  const hasImage = game.imageUrl && game.imageUrl !== '';
  
  // Handle add to library button click
  const handleAddToLibrary = (e) => {
    e.stopPropagation(); // Prevent triggering the card click
    addToLibrary(game);
  };
  
  // Handle favorite button click
  const handleToggleFavorite = (e) => {
    e.stopPropagation(); // Prevent triggering the card click
    toggleFavorite(game);
  };

  // Handle game download
  const handleGameDownload = async (e) => {
    e.stopPropagation(); // Prevent triggering the card click
    
    setDownloadStatus({ status: 'downloading', message: 'Searching for torrents...' });

    try {
      const result = await gameDownloadService.downloadGame(game.name);
      
      if (result.success) {
        setDownloadStatus({ 
          status: 'success', 
          message: '✅ Added to Real-Debrid!',
          torrent: result.torrent 
        });
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setDownloadStatus(null);
        }, 3000);
      } else {
        setDownloadStatus({ status: 'error', message: `❌ ${result.error}` });
        
        // Clear error message after 5 seconds
        setTimeout(() => {
          setDownloadStatus(null);
        }, 5000);
      }
    } catch (error) {
      setDownloadStatus({ status: 'error', message: `❌ Download failed: ${error.message}` });
      
      // Clear error message after 5 seconds
      setTimeout(() => {
        setDownloadStatus(null);
      }, 5000);
    }
  };
  
  const gameInLibrary = isInLibrary(game.appId);
  const gameIsFavorited = isFavorited(game.appId);
  
  // Render a small card (for favorite games grid)
  if (size === 'small') {
    return (
      <div 
        className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer h-40 group"
        onClick={() => onClick && onClick(game)}
      >
        {hasImage ? (
          <div className="h-full w-full relative">
            <img 
              src={game.imageUrl} 
              alt={game.name} 
              className="h-full w-full object-cover"
            />
            {/* Button overlays */}
            <div className="absolute top-2 right-2 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {/* Favorite button */}
              <button
                onClick={handleToggleFavorite}
                className="p-1 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-all duration-200"
                title={gameIsFavorited ? "Remove from favorites" : "Add to favorites"}
              >
                <svg className={`w-3 h-3 ${gameIsFavorited ? 'text-red-500 fill-current' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                </svg>
              </button>

              {/* Download button */}
              {downloadStatus ? (
                <div className="p-1 rounded-full bg-black bg-opacity-75">
                  {downloadStatus.status === 'downloading' && (
                    <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-400"></div>
                  )}
                  {downloadStatus.status === 'success' && (
                    <div className="text-green-400 text-xs">✅</div>
                  )}
                  {downloadStatus.status === 'error' && (
                    <div className="text-red-400 text-xs">❌</div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleGameDownload}
                  className="p-1 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-all duration-200"
                  title="Download game"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
              <h3 className="font-medium text-white truncate">{game.name}</h3>
            </div>
          </div>
        ) : (
          <div className="p-3 h-full flex flex-col items-center justify-center relative">
            {/* Button overlays for no-image cards */}
            <div className="absolute top-1 right-1 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {/* Favorite button */}
              <button
                onClick={handleToggleFavorite}
                className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-all duration-200"
                title={gameIsFavorited ? "Remove from favorites" : "Add to favorites"}
              >
                <svg className={`w-3 h-3 ${gameIsFavorited ? 'text-red-500 fill-current' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                </svg>
              </button>

              {/* Download button */}
              {downloadStatus ? (
                <div className="p-1 rounded-full bg-gray-700">
                  {downloadStatus.status === 'downloading' && (
                    <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-400"></div>
                  )}
                  {downloadStatus.status === 'success' && (
                    <div className="text-green-400 text-xs">✅</div>
                  )}
                  {downloadStatus.status === 'error' && (
                    <div className="text-red-400 text-xs">❌</div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleGameDownload}
                  className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-all duration-200"
                  title="Download game"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              )}
            </div>

            <h3 className="font-medium text-center">{game.name}</h3>
          </div>
        )}
      </div>
    );
  }
  
  // Render a medium card (for popular games grid - portrait with hover overlay)
  if (size === 'medium') {
    return (
      <div 
        className="relative bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer group aspect-[3/4] card-hover"
        onClick={() => onClick && onClick(game)}
      >
        {/* Game artwork */}
        <div className="w-full h-full relative">
          {hasImage ? (
            <img 
              src={game.imageUrl} 
              alt={game.name} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <span className="text-gray-500 text-xs sm:text-sm">Game Image</span>
            </div>
          )}
          
          {/* Button overlays */}
          <div className="absolute top-2 right-2 flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {/* Favorite button */}
            <button
              onClick={handleToggleFavorite}
              className="p-1.5 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-all duration-200"
              title={gameIsFavorited ? "Remove from favorites" : "Add to favorites"}
            >
              <svg className={`w-4 h-4 ${gameIsFavorited ? 'text-red-500 fill-current' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
            </button>

            {/* Download button */}
            {downloadStatus ? (
              <div className="p-1.5 rounded-full bg-black bg-opacity-75 flex items-center justify-center">
                {downloadStatus.status === 'downloading' && (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
                )}
                {downloadStatus.status === 'success' && (
                  <div className="text-green-400">✅</div>
                )}
                {downloadStatus.status === 'error' && (
                  <div className="text-red-400">❌</div>
                )}
              </div>
            ) : (
              <button
                onClick={handleGameDownload}
                className="p-1.5 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-all duration-200"
                title="Download game"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Hover overlay - simplified without buttons */}
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-75 transition-all duration-300 flex flex-col justify-end p-2 sm:p-3 opacity-0 group-hover:opacity-100">
            <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <h3 className="text-white font-bold text-xs sm:text-sm mb-1 sm:mb-2 line-clamp-2">{game.name}</h3>
              
              {/* Genre tags */}
              {game.genres && (
                <div className="flex flex-wrap gap-1 mb-1 sm:mb-2">
                  {game.genres.slice(0, 2).map((genre, index) => (
                    <span
                      key={index}
                      className="px-1 sm:px-1.5 py-0.5 bg-blue-600 bg-opacity-30 text-blue-300 text-xs rounded"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}
              
              {/* Rating */}
              {game.rating && (
                <div className="flex items-center">
                  <div className="flex text-yellow-400 mr-1">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-2 h-2 sm:w-2.5 sm:h-2.5 ${i < Math.round(game.rating / 20) ? 'fill-current' : 'text-gray-600'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                      </svg>
                    ))}
                  </div>
                  <span className="text-gray-300 text-xs">{Math.round(game.rating)}/100</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Render a large card (for featured games or game details)
  return (
    <div 
      className="bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer group"
      onClick={() => onClick && onClick(game)}
    >
      <div className="h-48 bg-gray-700 flex items-center justify-center relative">
        {hasImage ? (
          <img 
            src={game.imageUrl} 
            alt={game.name} 
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-gray-500">Game Image</span>
        )}
        {/* Button overlays */}
        <div className="absolute top-2 right-2 flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Favorite button */}
          <button
            onClick={handleToggleFavorite}
            className="p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-all duration-200"
            title={gameIsFavorited ? "Remove from favorites" : "Add to favorites"}
          >
            <svg className={`w-5 h-5 ${gameIsFavorited ? 'text-red-500 fill-current' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
            </svg>
          </button>

          {/* Download button */}
          {downloadStatus ? (
            <div className="p-2 rounded-full bg-black bg-opacity-75 flex items-center justify-center">
              {downloadStatus.status === 'downloading' && (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-400"></div>
              )}
              {downloadStatus.status === 'success' && (
                <div className="text-green-400 text-lg">✅</div>
              )}
              {downloadStatus.status === 'error' && (
                <div className="text-red-400 text-lg">❌</div>
              )}
            </div>
          ) : (
            <button
              onClick={handleGameDownload}
              className="p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-all duration-200"
              title="Download game"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold mb-2">{game.name}</h3>
        {game.description && (
          <p className="text-gray-400 text-sm mb-4">{game.description}</p>
        )}
        <div className="flex space-x-2">
          <button 
            onClick={handleAddToLibrary}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-all duration-200 ${
              gameInLibrary 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {gameInLibrary ? 'In Library' : 'Add to Library'}
          </button>

          {/* Download button for large cards */}
          {downloadStatus ? (
            <div className="px-4 py-2 rounded bg-gray-700 flex items-center justify-center min-w-[100px]">
              {downloadStatus.status === 'downloading' && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
                  <span className="text-xs text-blue-400">Downloading</span>
                </div>
              )}
              {downloadStatus.status === 'success' && (
                <div className="flex items-center space-x-1">
                  <span className="text-green-400">✅</span>
                  <span className="text-xs text-green-400">Added!</span>
                </div>
              )}
              {downloadStatus.status === 'error' && (
                <div className="flex items-center space-x-1">
                  <span className="text-red-400">❌</span>
                  <span className="text-xs text-red-400">Failed</span>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleGameDownload}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-all duration-200 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameCard;
