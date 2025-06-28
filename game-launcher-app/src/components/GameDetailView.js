import React, { useState, useEffect } from 'react';
import { useLibrary } from '../context/LibraryContext';
import AvailableDownloads from './AvailableDownloads';

function GameDetailView({ game, isLoading, onClose, onGameSelect }) {
  const { addToLibrary, isInLibrary, toggleFavorite, isFavorited } = useLibrary();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMedia, setSelectedMedia] = useState(0);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);
  const [imageOpacity, setImageOpacity] = useState(1);

  if (!game) return null;

  // Navigation function to go to library
  const handleNavigateToLibrary = () => {
    onClose(); // Close the detail view first
    // Use a small delay to ensure the detail view closes before navigation
    setTimeout(() => {
      // Navigate to library by calling the parent's navigation function
      if (window.location && window.location.hash) {
        window.location.hash = '#library';
      }
      // Also trigger a custom event that the App component can listen to
      window.dispatchEvent(new CustomEvent('navigateToLibrary'));
    }, 100);
  };

  // Navigation function to go to downloads page
  const handleNavigateToDownloads = () => {
    onClose(); // Close the detail view first
    // Use a small delay to ensure the detail view closes before navigation
    setTimeout(() => {
      // Navigate to downloads page by triggering custom event
      window.dispatchEvent(new CustomEvent('navigateToDownloads'));
    }, 100);
  };

  // Combine screenshots and videos into media array - videos first
  const mediaItems = [];
  
  // Add videos first (priority)
  if (game.videos) {
    game.videos.forEach((videoId, index) => {
      const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      const baseParams = `rel=0&modestbranding=1&playsinline=1&enablejsapi=1${origin ? `&origin=${origin}` : ''}&iv_load_policy=3&fs=1&disablekb=0`;
      
      mediaItems.push({
        type: 'video',
        url: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&${baseParams}`,
        unmutedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&${baseParams}`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        id: `video-${index}`,
        videoId: videoId
      });
    });
  }
  
  // Add screenshots after videos
  if (game.screenshots) {
    game.screenshots.forEach((screenshot, index) => {
      mediaItems.push({
        type: 'image',
        url: screenshot,
        thumbnail: screenshot,
        id: `screenshot-${index}`
      });
    });
  }

  // Auto-rotation effect
  useEffect(() => {
    if (!autoRotate || mediaItems.length <= 1) return;

    const currentMediaItem = mediaItems[selectedMedia];
    let rotationDelay;

    if (currentMediaItem?.type === 'video' && isPlayingVideo) {
      rotationDelay = 180000; // 3 minutes
    } else {
      rotationDelay = 5000;
    }

    const timeout = setTimeout(() => {
      if (currentMediaItem?.type === 'image') {
        setImageOpacity(0);
        setTimeout(() => {
          setSelectedMedia(prev => (prev + 1) % mediaItems.length);
          setIsPlayingVideo(false);
          setImageOpacity(1);
        }, 300);
      } else {
        setSelectedMedia(prev => (prev + 1) % mediaItems.length);
        setIsPlayingVideo(false);
      }
    }, rotationDelay);

    return () => clearTimeout(timeout);
  }, [autoRotate, mediaItems.length, selectedMedia, isPlayingVideo]);

  // Auto-play video effect
  useEffect(() => {
    if (mediaItems[selectedMedia]?.type === 'video' && !isPlayingVideo) {
      const timeout = setTimeout(() => {
        setIsPlayingVideo(true);
      }, 3000);

      return () => clearTimeout(timeout);
    }
  }, [selectedMedia, mediaItems, isPlayingVideo]);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' }
  ];

  const heroImage = game.heroImageUrl || game.imageUrl;
  const currentMedia = mediaItems[selectedMedia];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg overflow-hidden max-w-6xl w-full max-h-[95vh] flex flex-col">
        {/* Header with close button */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold">{game.name}</h2>
            {(game.rating || game.totalRating) && (
              <div className="flex items-center space-x-2">
                <div className="bg-blue-600 text-white px-2 py-1 rounded text-sm font-bold">
                  {game.totalRating || game.rating}%
                </div>
                <span className="text-gray-400 text-sm">
                  {game.totalRating ? 'Overall Score' : 'User Score'}
                </span>
              </div>
            )}
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-400">Loading game details...</span>
          </div>
        )}

        {/* Content area with scrolling */}
        {!isLoading && (
          <div className="overflow-y-auto flex-1">
            {/* Hero Section */}
            <div className="relative h-96 bg-gray-700 overflow-hidden">
              {currentMedia ? (
                currentMedia.type === 'video' && isPlayingVideo ? (
                  <iframe
                    src={videoMuted ? currentMedia.url : currentMedia.unmutedUrl}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    title={`${game.name} video`}
                    loading="lazy"
                    key={`${currentMedia.id}-${videoMuted}`}
                  />
                ) : (
                  currentMedia?.type === 'image' || game?.imageType === 'portrait' || (currentMedia?.url && currentMedia.url.includes('cover')) ? (
                    <>
                      <img
                        src={currentMedia?.type === 'image' ? currentMedia.url : currentMedia?.thumbnail}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover scale-110 blur-md transition-all duration-300"
                        style={{ 
                          filter: 'blur(8px) brightness(0.4)',
                          opacity: currentMedia?.type === 'image' ? imageOpacity : 1
                        }}
                      />
                      <img
                        src={currentMedia?.type === 'image' ? currentMedia.url : currentMedia?.thumbnail}
                        alt={game.name}
                        className="relative z-10 w-full h-full object-contain transition-opacity duration-300"
                        style={{ opacity: currentMedia?.type === 'image' ? imageOpacity : 1 }}
                      />
                    </>
                  ) : (
                    <img 
                      src={currentMedia?.type === 'image' ? currentMedia.url : currentMedia?.thumbnail}
                      alt={game.name} 
                      className="w-full h-full object-cover transition-opacity duration-300"
                      style={{ opacity: currentMedia?.type === 'image' ? imageOpacity : 1 }}
                    />
                  )
                )
              ) : heroImage ? (
                game.imageType === 'portrait' || heroImage.includes('cover') ? (
                  <>
                    <img
                      src={heroImage}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-md transition-all duration-500"
                      style={{ filter: 'blur(8px) brightness(0.4)' }}
                    />
                    <img
                      src={heroImage}
                      alt={game.name}
                      className="relative z-10 w-full h-full object-contain transition-opacity duration-500"
                    />
                  </>
                ) : (
                  <img 
                    src={heroImage} 
                    alt={game.name} 
                    className="w-full h-full object-cover transition-opacity duration-500"
                  />
                )
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-gray-500 text-xl">Game Image</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent z-10"></div>
              <div className="absolute bottom-6 left-6 right-6 z-20">
                <div className="flex items-end justify-between">
                  <div>
                    <h3 className="text-3xl font-bold mb-2">{game.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-300">
                      <span>{game.releaseDate}</span>
                      <span>•</span>
                      <span>{game.developer}</span>
                      {game.platforms && (
                        <>
                          <span>•</span>
                          <span>{game.platforms}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => addToLibrary(game)}
                      className={`px-4 py-2 rounded transition-colors flex items-center ${
                        isInLibrary(game.appId)
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-white'
                      }`}
                    >
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                      </svg>
                      {isInLibrary(game.appId) ? 'In Library' : 'Add to Library'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Media Navigation Controls */}
            {mediaItems.length > 0 && (
              <div className="px-6 py-4 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-4">
                    <h4 className="text-sm font-medium text-gray-300">Media ({mediaItems.length})</h4>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setAutoRotate(!autoRotate)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          autoRotate 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Auto-rotate {autoRotate ? 'ON' : 'OFF'}
                      </button>
                      {currentMedia?.type === 'video' && (
                        <>
                          <button
                            onClick={() => {
                              setIsPlayingVideo(!isPlayingVideo);
                            }}
                            className="px-3 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded text-xs font-medium transition-colors"
                          >
                            {isPlayingVideo ? 'Show Thumbnail' : 'Play Video'}
                          </button>
                          <button
                            onClick={() => setVideoMuted(!videoMuted)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                              videoMuted 
                                ? 'bg-yellow-600 text-white hover:bg-yellow-700' 
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          >
                            {videoMuted ? '🔇 Muted' : '🔊 Sound'}
                          </button>
                          <button
                            onClick={() => window.open(`https://www.youtube.com/watch?v=${currentMedia.videoId}`)}
                            className="px-3 py-1 bg-red-600 text-white hover:bg-red-700 rounded text-xs font-medium transition-colors"
                          >
                            YouTube ↗
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {selectedMedia + 1} of {mediaItems.length}
                  </div>
                </div>
                
                {/* Media Thumbnails */}
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {mediaItems.map((media, index) => (
                    <button
                      key={media.id}
                      onClick={() => {
                        if (mediaItems[index]?.type === 'image') {
                          setImageOpacity(0);
                          setTimeout(() => {
                            setSelectedMedia(index);
                            setIsPlayingVideo(false);
                            setImageOpacity(1);
                          }, 300);
                        } else {
                          setSelectedMedia(index);
                          setIsPlayingVideo(false);
                        }
                      }}
                      className={`relative flex-shrink-0 w-16 h-12 rounded overflow-hidden transition-all ${
                        selectedMedia === index 
                          ? 'ring-2 ring-blue-500 opacity-100' 
                          : 'opacity-60 hover:opacity-80'
                      }`}
                    >
                      <img
                        src={media.thumbnail}
                        alt={`Media ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {media.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-black bg-opacity-50 rounded-full p-1">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M8 5v10l7-5-7-5z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="border-b border-gray-700 bg-gray-900">
              <div className="flex space-x-8 px-6">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-3 gap-8">
                  <div className="col-span-2 space-y-6">
                    {/* Description */}
                    <div>
                      <h4 className="text-lg font-semibold mb-3">About This Game</h4>
                      <p className="text-gray-300 leading-relaxed">
                        {game.description || game.summary || "No description available for this game."}
                      </p>
                      {game.storyline && (
                        <div className="mt-4">
                          <h5 className="font-semibold mb-2">Storyline</h5>
                          <p className="text-gray-300 leading-relaxed">{game.storyline}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Available Downloads */}
                    <AvailableDownloads 
                      gameName={game.name} 
                      gameId={game.appId} 
                      game={game}
                      onNavigateToLibrary={handleNavigateToLibrary}
                      onNavigateToDownloads={handleNavigateToDownloads}
                    />
                    
                    {/* Genres and Themes */}
                    {((game.genres && game.genres.length > 0) || (game.themes && game.themes.length > 0)) && (
                      <div>
                        <h4 className="text-lg font-semibold mb-3">Genres & Themes</h4>
                        <div className="space-y-3">
                          {game.genres && game.genres.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-400 mb-2">Genres</h5>
                              <div className="flex flex-wrap gap-2">
                                {game.genres.map((genre, index) => (
                                  <span 
                                    key={index} 
                                    className="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm hover:bg-gray-600 transition-colors cursor-pointer"
                                  >
                                    {genre}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {game.themes && game.themes.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-400 mb-2">Themes</h5>
                              <div className="flex flex-wrap gap-2">
                                {game.themes.map((theme, index) => (
                                  <span 
                                    key={index} 
                                    className="bg-blue-700 text-blue-300 px-3 py-1 rounded-full text-sm hover:bg-blue-600 transition-colors cursor-pointer"
                                  >
                                    {theme}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sidebar */}
                  <div className="space-y-6">
                    {/* Game Info */}
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h4 className="font-semibold mb-3">Game Information</h4>
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="text-gray-400">Developer:</span>
                          <p className="text-gray-300">{game.developer || "Unknown"}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Publisher:</span>
                          <p className="text-gray-300">{game.publisher || "Unknown"}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Release Date:</span>
                          <p className="text-gray-300">{game.releaseDate || "Unknown"}</p>
                        </div>
                        {game.platforms && (
                          <div>
                            <span className="text-gray-400">Platforms:</span>
                            <p className="text-gray-300">{game.platforms}</p>
                          </div>
                        )}
                      {game.gameEngines && game.gameEngines.length > 0 && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Game Engine:</span>
                          <p className="text-gray-300">{game.gameEngines.join(', ')}</p>
                        </div>
                      )}
                        {(game.rating || game.totalRating) && (
                          <div>
                            <span className="text-gray-400">Rating:</span>
                            <p className="text-gray-300">
                              {game.totalRating || game.rating}% 
                              {game.totalRatingCount > 0 && ` (${game.totalRatingCount} reviews)`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Game Features */}
                    {(game.gameModes && game.gameModes.length > 0) || game.multiplayerInfo && (
                      <div className="bg-gray-700 rounded-lg p-4">
                        <h4 className="font-semibold mb-3">Game Features</h4>
                        <div className="text-sm space-y-2">
                          {game.gameModes && game.gameModes.length > 0 && (
                            <div>
                              <span className="text-gray-400">Game Modes:</span>
                              <p className="text-gray-300">{game.gameModes.join(', ')}</p>
                            </div>
                          )}
                          {game.multiplayerInfo && (
                            <div className="space-y-1">
                              <span className="text-gray-400">Multiplayer:</span>
                              {game.multiplayerInfo.onlineMax > 0 && (
                                <p className="text-gray-300">Online: Up to {game.multiplayerInfo.onlineMax} players</p>
                              )}
                              {game.multiplayerInfo.offlineMax > 1 && (
                                <p className="text-gray-300">Local: Up to {game.multiplayerInfo.offlineMax} players</p>
                              )}
                              {game.multiplayerInfo.campaignCoop && (
                                <p className="text-gray-300">✓ Campaign Co-op</p>
                              )}
                              {game.multiplayerInfo.splitscreen && (
                                <p className="text-gray-300">✓ Split Screen</p>
                              )}
                            </div>
                          )}
                          {game.playerPerspectives && game.playerPerspectives.length > 0 && (
                            <div>
                              <span className="text-gray-400">Perspective:</span>
                              <p className="text-gray-300">{game.playerPerspectives.join(', ')}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* System Requirements */}
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h4 className="font-semibold mb-3">System Requirements</h4>
                      <div className="text-sm space-y-2">
                        <p className="text-gray-300">
                          System requirements are not available through our game database.
                        </p>
                        <p className="text-gray-400 text-xs mt-3">
                          For accurate system requirements, please check the game's official store page or the publisher's website.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-lg font-semibold mb-4">Game Details</h4>
                    <div className="space-y-4">
                      <div className="border-b border-gray-700 pb-3">
                        <span className="text-gray-400">Title:</span>
                        <p className="text-gray-300 font-medium">{game.name}</p>
                      </div>
                      <div className="border-b border-gray-700 pb-3">
                        <span className="text-gray-400">Developer:</span>
                        <p className="text-gray-300">{game.developers || "Unknown"}</p>
                      </div>
                      <div className="border-b border-gray-700 pb-3">
                        <span className="text-gray-400">Publisher:</span>
                        <p className="text-gray-300">{game.publishers || "Unknown"}</p>
                      </div>
                      <div className="border-b border-gray-700 pb-3">
                        <span className="text-gray-400">Release Date:</span>
                        <p className="text-gray-300">{game.releaseDate || "Unknown"}</p>
                      </div>
                      {game.platforms && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Platforms:</span>
                          <p className="text-gray-300">{game.platforms}</p>
                        </div>
                      )}
                      {game.genres && game.genres.length > 0 && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Genres:</span>
                          <p className="text-gray-300">{game.genres.join(', ')}</p>
                        </div>
                      )}
                      {game.themes && game.themes.length > 0 && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Themes:</span>
                          <p className="text-gray-300">{game.themes.join(', ')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-lg font-semibold mb-4">Additional Information</h4>
                    <div className="space-y-4">
                      {(game.rating || game.totalRating) && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Rating:</span>
                          <p className="text-gray-300">
                            {game.totalRating || game.rating}% 
                            {game.totalRatingCount > 0 && ` (${game.totalRatingCount} reviews)`}
                          </p>
                        </div>
                      )}
                      {game.gameEngines && game.gameEngines.length > 0 && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Game Engine:</span>
                          <p className="text-gray-300">{game.gameEngines.join(', ')}</p>
                        </div>
                      )}
                      {game.gameModes && game.gameModes.length > 0 && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Game Modes:</span>
                          <p className="text-gray-300">{game.gameModes.join(', ')}</p>
                        </div>
                      )}
                      <div className="border-b border-gray-700 pb-3">
                        <span className="text-gray-400">Game ID:</span>
                        <p className="text-gray-300 font-mono text-sm">{game.appId}</p>
                      </div>
                      {mediaItems.length > 0 && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Media:</span>
                          <p className="text-gray-300">
                            {game.screenshots?.length || 0} screenshots
                            {game.videos?.length > 0 && `, ${game.videos.length} videos`}
                          </p>
                        </div>
                      )}
                      {game.similarGames && game.similarGames.length > 0 && (
                        <div className="border-b border-gray-700 pb-3">
                          <span className="text-gray-400">Similar Games:</span>
                          <p className="text-gray-300">{game.similarGames.length} suggestions</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GameDetailView;
