import React, { useState, useEffect } from 'react';
import { useLibrary } from '../context/LibraryContext';

function FeaturedGamesSlideshow({ featuredGames = [], isLoading = false, onGameSelect }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { addToLibrary, isInLibrary } = useLibrary();

  // Auto-advance slideshow
  useEffect(() => {
    if (featuredGames.length > 1) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % featuredGames.length);
      }, 6000); // 6 seconds per slide

      return () => clearInterval(interval);
    }
  }, [featuredGames.length]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
  };

  const goToPrevious = (e) => {
    e.stopPropagation(); // Prevent triggering the container click
    setCurrentSlide((prev) => (prev - 1 + featuredGames.length) % featuredGames.length);
  };

  const goToNext = (e) => {
    e.stopPropagation(); // Prevent triggering the container click
    setCurrentSlide((prev) => (prev + 1) % featuredGames.length);
  };

  const handleContainerClick = () => {
    if (onGameSelect && currentGame) {
      onGameSelect(currentGame);
    }
  };

  const handleAddToLibrary = (e) => {
    e.stopPropagation(); // Prevent triggering the container click
    addToLibrary(currentGame);
  };

  if (isLoading) {
    return (
      <section className="mb-4 sm:mb-6 lg:mb-8">
        <div className="h-40 xs:h-48 sm:h-56 md:h-72 lg:h-80 xl:h-96 bg-gray-800 rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl animate-pulse">
          <div className="flex h-full">
            <div className="w-full sm:w-[70%] bg-gray-700 rounded-l-md sm:rounded-l-lg md:rounded-l-xl lg:rounded-l-2xl"></div>
            <div className="hidden sm:block w-[30%] p-3 sm:p-4 md:p-6 lg:p-8 flex flex-col justify-center">
              <div className="h-4 sm:h-5 md:h-6 lg:h-8 bg-gray-700 rounded mb-2 sm:mb-3 lg:mb-4 w-3/4"></div>
              <div className="h-2 sm:h-3 lg:h-4 bg-gray-700 rounded mb-1 sm:mb-2 w-full"></div>
              <div className="h-2 sm:h-3 lg:h-4 bg-gray-700 rounded mb-2 sm:mb-3 lg:mb-4 w-2/3"></div>
              <div className="h-6 sm:h-7 md:h-8 lg:h-10 bg-gray-700 rounded w-20 sm:w-24 lg:w-32"></div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!featuredGames.length) {
    return null;
  }

  const currentGame = featuredGames[currentSlide];
  const gameInLibrary = isInLibrary(currentGame.appId);

  return (
    <section className="mb-4 sm:mb-6 lg:mb-8">
      <div className="mb-3 sm:mb-4 md:mb-6">
        <h2 className="text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-1 sm:mb-2">Featured Games</h2>
        <p className="text-gray-400 text-sm xs:text-base sm:text-lg md:text-xl">Discover the hottest games right now</p>
      </div>

      <div 
        className="relative h-40 xs:h-48 sm:h-56 md:h-72 lg:h-80 xl:h-96 2xl:h-[28rem] bg-gray-800 rounded-md sm:rounded-lg md:rounded-xl lg:rounded-2xl overflow-hidden group cursor-pointer hover:shadow-lg transition-all duration-300"
        onClick={handleContainerClick}
      >
        {/* Main slideshow content */}
        <div className="flex h-full">
          {/* Game artwork - Full width on mobile, 70% on larger screens */}
          <div className="w-full sm:w-[70%] relative overflow-hidden">
            {/* Blurred background with sharp foreground image for all images */}
            <>
              {/* Blurred background layer */}
              <img
                src={currentGame.imageUrl || '/api/placeholder/800/400'}
                alt=""
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-md transition-transform duration-700 group-hover:scale-125"
                style={{ filter: 'blur(8px) brightness(0.4)' }}
              />
              {/* Sharp foreground image using object-contain to show whole image */}
              <img
                src={currentGame.imageUrl || '/api/placeholder/800/400'}
                alt={currentGame.name}
                className="relative z-10 w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
              />
            </>
            {/* Gradient overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-transparent to-transparent sm:to-gray-900 opacity-80 sm:opacity-60 z-20"></div>
            
            {/* Mobile game info overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-2 xs:p-3 sm:hidden z-30">
              <h3 className="text-base xs:text-lg font-bold text-white mb-1 line-clamp-2">{currentGame.name}</h3>
              {currentGame.genres && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {currentGame.genres.slice(0, 2).map((genre, index) => (
                    <span
                      key={index}
                      className="px-1.5 xs:px-2 py-0.5 bg-blue-600 bg-opacity-30 text-blue-300 text-xs rounded"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            {/* Navigation arrows */}
            {featuredGames.length > 1 && (
              <>
                <button
                  onClick={goToPrevious}
                  className="absolute left-1 xs:left-2 sm:left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 text-white p-1.5 xs:p-2 sm:p-3 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 z-30"
                >
                  <svg className="w-3 h-3 xs:w-4 xs:h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                  </svg>
                </button>
                <button
                  onClick={goToNext}
                  className="absolute right-1 xs:right-2 sm:right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 text-white p-1.5 xs:p-2 sm:p-3 rounded-full transition-all duration-200 opacity-0 group-hover:opacity-100 z-30"
                >
                  <svg className="w-3 h-3 xs:w-4 xs:h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Game details - Hidden on mobile, 30% on larger screens */}
          <div className="hidden sm:flex w-[30%] py-4 sm:py-6 md:py-8 lg:py-12 xl:py-16 px-3 sm:px-4 md:px-6 lg:px-8 flex-col justify-center bg-gray-800">
            <div className="mb-3 sm:mb-4 lg:mb-6">
              <h3 className="text-base sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-white mb-1 sm:mb-2 md:mb-3 lg:mb-4 leading-tight line-clamp-2">{currentGame.name}</h3>
              
              {/* Genre tags */}
              {currentGame.genres && (
                <div className="flex flex-wrap gap-1 md:gap-2 mb-1 sm:mb-2 md:mb-3 lg:mb-4">
                  {currentGame.genres.slice(0, 2).map((genre, index) => (
                    <span
                      key={index}
                      className="px-1.5 sm:px-2 md:px-3 py-0.5 md:py-1 bg-blue-600 bg-opacity-20 text-blue-300 text-xs sm:text-xs md:text-sm rounded-full"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Rating */}
              {currentGame.rating && (
                <div className="flex items-center mb-1 sm:mb-2 md:mb-3 lg:mb-4">
                  <div className="flex text-yellow-400 mr-1 sm:mr-2">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 ${i < Math.round(currentGame.rating / 20) ? 'fill-current' : 'text-gray-600'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                      </svg>
                    ))}
                  </div>
                  <span className="text-gray-400 text-xs sm:text-xs md:text-sm">{Math.round(currentGame.rating)}/100</span>
                </div>
              )}

              {/* Description - Only show on medium+ screens */}
              <p className="hidden md:block text-gray-300 text-xs lg:text-sm xl:text-base leading-relaxed mb-3 sm:mb-4 lg:mb-6 line-clamp-3">
                {currentGame.summary || currentGame.description || "Discover this amazing game and add it to your library."}
              </p>
            </div>

            {/* Single action button */}
            <div>
              <button
                onClick={handleAddToLibrary}
                className={`w-full px-2 sm:px-3 md:px-4 lg:px-6 py-1.5 sm:py-2 md:py-2.5 lg:py-3 rounded-md sm:rounded-lg font-semibold text-xs sm:text-sm md:text-base transition-all duration-200 ${
                  gameInLibrary
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {gameInLibrary ? 'In Library' : 'Add to Library'}
              </button>
            </div>
          </div>
        </div>

        {/* Slide indicators */}
        {featuredGames.length > 1 && (
          <div className="absolute bottom-1 xs:bottom-2 sm:bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-1 sm:space-x-2 z-30">
            {featuredGames.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  goToSlide(index);
                }}
                className={`w-1.5 h-1.5 xs:w-2 xs:h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-200 ${
                  index === currentSlide ? 'bg-white' : 'bg-white bg-opacity-40 hover:bg-opacity-60'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default FeaturedGamesSlideshow;
